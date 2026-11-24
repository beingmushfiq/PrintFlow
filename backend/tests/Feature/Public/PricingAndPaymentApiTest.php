<?php

declare(strict_types=1);

namespace Tests\Feature\Public;

use App\Models\Order;
use App\Models\OrderFile;
use App\Models\Payment;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PricingAndPaymentApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private Shop $shop;
    private Order $order;
    private string $rawToken = 'customer_token_xyz_123';

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create(['name' => 'Demo Tenant', 'slug' => 'demo-tenant', 'status' => 'active']);
        $this->shop = Shop::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Nilkhet Print Hub',
            'slug' => 'nilkhet-print',
            'phone' => '01712345678',
            'public_status' => 'active',
        ]);

        $this->order = Order::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-8K2M9A',
            'public_token_hash' => hash('sha256', $this->rawToken),
            'customer_phone' => '01712345678',
            'status' => 'submitted',
        ]);

        OrderFile::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $this->order->id,
            'original_name' => 'test.pdf',
            'object_key' => 'private/secret_key.pdf',
            'storage_disk' => 'local',
            'mime_type_detected' => 'application/pdf',
            'page_count' => 5,
            'scan_status' => 'clean',
            'processing_status' => 'ready',
        ]);
    }

    public function test_can_generate_and_retrieve_quote(): void
    {
        $response = $this->postJson("/api/v1/public/storefront/{$this->shop->slug}/order/{$this->rawToken}/quote", [
            'copies' => 2,
            'color_mode' => 'mono',
            'sides_mode' => 'duplex',
            'paper_size' => 'A4',
            'page_range' => 'all',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.quote.quote_version', 1)
            ->assertJsonPath('data.quote.is_expired', false);

        $this->assertNotEmpty($response->json('data.quote.calculation_hash'));

        // Retrieve quote
        $getRes = $this->getJson("/api/v1/public/storefront/{$this->shop->slug}/order/{$this->rawToken}/quote");
        $getRes->assertStatus(200)
            ->assertJsonPath('data.quote.quote_version', 1);
    }

    public function test_can_initiate_checkout_and_double_submit_protection(): void
    {
        // First generate quote
        $this->postJson("/api/v1/public/storefront/{$this->shop->slug}/order/{$this->rawToken}/quote", [
            'copies' => 1,
            'sides_mode' => 'simplex',
        ])->assertStatus(201);

        $idempotencyToken = hash('sha256', 'idem_test_key_1');

        $res1 = $this->postJson("/api/v1/public/storefront/{$this->shop->slug}/order/{$this->rawToken}/checkout", [
            'gateway' => 'sandbox',
            'idempotency_token' => $idempotencyToken,
        ]);

        $res1->assertStatus(200)
            ->assertJsonPath('data.gateway', 'sandbox')
            ->assertJsonStructure(['data' => ['redirect_url', 'session_token', 'internal_reference']]);

        // Duplicate submission with same idempotency token returns cached result
        $res2 = $this->postJson("/api/v1/public/storefront/{$this->shop->slug}/order/{$this->rawToken}/checkout", [
            'gateway' => 'sandbox',
            'idempotency_token' => $idempotencyToken,
        ]);

        $res2->assertStatus(200)
            ->assertJsonPath('data.internal_reference', $res1->json('data.internal_reference'));
    }

    public function test_can_simulate_sandbox_payment_to_paid(): void
    {
        $response = $this->postJson('/api/v1/public/payments/sandbox/simulate', [
            'order_token' => $this->rawToken,
            'outcome' => 'success',
            'amount_minor' => 1250,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'PAID')
            ->assertJsonPath('data.amount_minor', 1250);

        $orderFresh = Order::withoutTenant()->find($this->order->id);
        $this->assertSame('paid', $orderFresh->status);
    }

    public function test_public_order_status_hides_sensitive_fields(): void
    {
        $response = $this->getJson("/api/v1/public/order/{$this->rawToken}");

        $response->assertStatus(200)
            ->assertJsonPath('data.reference', 'PF-8K2M9A')
            ->assertJsonPath('data.shop_name', 'Nilkhet Print Hub')
            ->assertJsonStructure([
                'data' => [
                    'reference',
                    'status',
                    'stages',
                    'current_stage',
                    'shop_name',
                    'channel',
                ],
            ]);

        $data = $response->json('data');

        // Sensitive fields MUST NOT exist in public response
        $this->assertArrayNotHasKey('customer_phone', $data);
        $this->assertArrayNotHasKey('object_key', $data);
        $this->assertArrayNotHasKey('tenant_id', $data);
    }

    public function test_digital_receipt_endpoint(): void
    {
        // First mark order paid
        $this->postJson('/api/v1/public/payments/sandbox/simulate', [
            'order_token' => $this->rawToken,
            'outcome' => 'success',
            'amount_minor' => 1890,
        ]);

        $response = $this->getJson("/api/v1/public/order/{$this->rawToken}/receipt");

        $response->assertStatus(200)
            ->assertJsonPath('data.publicReference', 'PF-8K2M9A')
            ->assertJsonPath('data.shopName', 'Nilkhet Print Hub')
            ->assertJsonPath('data.totalPoisha', 1890)
            ->assertJsonStructure([
                'data' => [
                    'shopName',
                    'shopPhone',
                    'publicReference',
                    'transactionId',
                    'orderDate',
                    'lineItems',
                    'subtotalPoisha',
                    'totalPoisha',
                ],
            ]);
    }
}
