<?php

declare(strict_types=1);

namespace Tests\Feature\Public;

use App\Models\Order;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StorefrontAndUploadTest extends TestCase
{
    use RefreshDatabase;

    private Shop $shop;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');

        $tenant = Tenant::create([
            'name' => 'Storefront Tenant',
            'slug' => 'storefront-tenant',
            'edition' => 'standalone',
            'status' => 'active',
            'default_currency' => 'BDT',
            'default_locale' => 'bn',
            'timezone' => 'Asia/Dhaka',
        ]);

        $this->shop = Shop::create([
            'tenant_id' => $tenant->id,
            'name' => 'Campus Print Hub',
            'slug' => 'campus-hub',
            'address' => 'TSC, Dhaka University',
            'phone' => '01711223344',
            'email' => 'campushub@example.com',
            'locale' => 'bn',
            'currency' => 'BDT',
            'public_status' => 'active',
        ]);
    }

    public function test_get_public_storefront_details(): void
    {
        $response = $this->getJson('/api/v1/public/storefront/campus-hub');

        $response->assertStatus(200)
            ->assertJsonPath('data.shop.name', 'Campus Print Hub')
            ->assertJsonPath('data.shop.slug', 'campus-hub')
            ->assertJsonPath('data.shop.public_status', 'active');
    }

    public function test_create_order_enforces_mandatory_bd_phone(): void
    {
        // 1. Missing phone
        $res1 = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_name' => 'Student A',
        ]);
        $res1->assertStatus(422)
            ->assertJsonPath('errors.0.field', 'customer_phone');

        // 2. Invalid non-BD phone
        $res2 = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_phone' => '01234567890', // 012 is invalid operator
            'customer_name' => 'Student A',
        ]);
        $res2->assertStatus(422);

        // 3. Valid BD phone
        $res3 = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_phone' => '+880 1712-345678',
            'customer_name' => 'Student Valid',
        ]);
        $res3->assertStatus(201)
            ->assertJsonPath('data.order.customer_phone', '01712345678')
            ->assertJsonPath('data.order.status', 'draft')
            ->assertJsonStructure([
                'data' => [
                    'order' => ['id', 'public_reference', 'public_token', 'customer_phone', 'status'],
                ],
            ]);

        $this->assertDatabaseHas('orders', [
            'customer_phone' => '01712345678',
            'shop_id' => $this->shop->id,
            'status' => 'draft',
        ]);
    }

    public function test_upload_presign_and_direct_upload_and_confirm_lifecycle(): void
    {
        // Create draft order
        $orderRes = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_phone' => '01811223344',
            'customer_name' => 'Thesis Student',
        ]);
        $publicToken = $orderRes->json('data.order.public_token');

        // 1. Presign upload
        $presignRes = $this->postJson('/api/v1/public/upload/presign', [
            'public_token' => $publicToken,
            'original_name' => 'Chapter 1 Final.pdf',
            'size_bytes' => 1500,
            'mime_type' => 'application/pdf',
        ]);

        $presignRes->assertStatus(200)
            ->assertJsonStructure(['data' => ['file_id', 'object_key', 'upload_url']]);

        $fileId = $presignRes->json('data.file_id');

        // 2. Direct upload genuine PDF
        $genuinePdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            ."2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n"
            ."3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n"
            ."4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n"
            ."xref\ntrailer\n<< /Root 1 0 R >>\n%%EOF";

        $uploadRes = $this->call(
            'POST',
            "/api/v1/public/upload/direct/{$fileId}?public_token={$publicToken}",
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/pdf'],
            $genuinePdf
        );
        $uploadRes->assertStatus(200);

        // 3. Confirm upload
        $confirmRes = $this->postJson('/api/v1/public/upload/confirm', [
            'public_token' => $publicToken,
            'file_id' => $fileId,
        ]);

        $confirmRes->assertStatus(200)
            ->assertJsonPath('data.file.mime_type', 'application/pdf')
            ->assertJsonPath('data.file.page_count', 2)
            ->assertJsonPath('data.file.scan_status', 'clean')
            ->assertJsonPath('data.file.processing_status', 'ready');

        $this->assertDatabaseHas('order_files', [
            'id' => $fileId,
            'page_count' => 2,
            'processing_status' => 'ready',
        ]);
    }

    public function test_upload_confirm_rejects_invalid_magic_bytes(): void
    {
        $orderRes = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_phone' => '01811223344',
        ]);
        $publicToken = $orderRes->json('data.order.public_token');

        $presignRes = $this->postJson('/api/v1/public/upload/presign', [
            'public_token' => $publicToken,
            'original_name' => 'fake.pdf',
            'size_bytes' => 100,
            'mime_type' => 'application/pdf',
        ]);
        $fileId = $presignRes->json('data.file_id');

        // Upload fake non-PDF bytes disguised with .pdf extension
        $fakeBytes = "MZ\x90\x00Not a real PDF executable payload";
        $this->call(
            'POST',
            "/api/v1/public/upload/direct/{$fileId}?public_token={$publicToken}",
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/pdf'],
            $fakeBytes
        );

        $confirmRes = $this->postJson('/api/v1/public/upload/confirm', [
            'public_token' => $publicToken,
            'file_id' => $fileId,
        ]);

        $confirmRes->assertStatus(422)
            ->assertJsonPath('errors.0.code', 'INVALID_MIME_TYPE');

        $this->assertDatabaseHas('order_files', [
            'id' => $fileId,
            'processing_status' => 'rejected',
        ]);
    }

    public function test_upload_confirm_rejects_encrypted_pdf(): void
    {
        $orderRes = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_phone' => '01811223344',
        ]);
        $publicToken = $orderRes->json('data.order.public_token');

        $presignRes = $this->postJson('/api/v1/public/upload/presign', [
            'public_token' => $publicToken,
            'original_name' => 'locked.pdf',
            'size_bytes' => 500,
            'mime_type' => 'application/pdf',
        ]);
        $fileId = $presignRes->json('data.file_id');

        $encryptedPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            ."2 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\n"
            ."3 0 obj\n<< /Filter /Standard /V 2 >>\nendobj\n"
            ."trailer\n<< /Root 1 0 R /Encrypt 3 0 R >>\n%%EOF";

        $this->call(
            'POST',
            "/api/v1/public/upload/direct/{$fileId}?public_token={$publicToken}",
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/pdf'],
            $encryptedPdf
        );

        $confirmRes = $this->postJson('/api/v1/public/upload/confirm', [
            'public_token' => $publicToken,
            'file_id' => $fileId,
        ]);

        $confirmRes->assertStatus(422)
            ->assertJsonPath('errors.0.code', 'ENCRYPTED_PDF');

        $this->assertDatabaseHas('order_files', [
            'id' => $fileId,
            'processing_status' => 'rejected',
        ]);
    }

    public function test_upload_confirm_quarantines_malware(): void
    {
        $orderRes = $this->postJson('/api/v1/public/storefront/campus-hub/order', [
            'customer_phone' => '01811223344',
        ]);
        $publicToken = $orderRes->json('data.order.public_token');

        $presignRes = $this->postJson('/api/v1/public/upload/presign', [
            'public_token' => $publicToken,
            'original_name' => 'virus.pdf',
            'size_bytes' => 200,
            'mime_type' => 'application/pdf',
        ]);
        $fileId = $presignRes->json('data.file_id');

        $infectedPdf = "%PDF-1.4\n".'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'."\n%%EOF";

        $this->call(
            'POST',
            "/api/v1/public/upload/direct/{$fileId}?public_token={$publicToken}",
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/pdf'],
            $infectedPdf
        );

        $confirmRes = $this->postJson('/api/v1/public/upload/confirm', [
            'public_token' => $publicToken,
            'file_id' => $fileId,
        ]);

        $confirmRes->assertStatus(422)
            ->assertJsonPath('errors.0.code', 'MALWARE_DETECTED');

        $this->assertDatabaseHas('order_files', [
            'id' => $fileId,
            'scan_status' => 'infected',
            'processing_status' => 'rejected',
        ]);
    }
}
