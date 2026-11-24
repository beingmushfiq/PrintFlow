<?php

declare(strict_types=1);

namespace Tests\Feature\Owner;

use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\OrderFile;
use App\Models\PriceProfile;
use App\Models\PriceRule;
use App\Models\PrintAgent;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\Role;
use App\Models\Shop;
use App\Models\ShopUserAssignment;
use App\Models\Tenant;
use App\Models\TenantUser;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OwnerOperationsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private Shop $shop;
    private User $ownerUser;
    private string $ownerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Nilkhet Print Hub',
            'slug' => 'nilkhet-hub',
            'edition' => 'standalone',
            'status' => 'active',
            'default_currency' => 'BDT',
            'default_locale' => 'bn',
            'timezone' => 'Asia/Dhaka',
        ]);

        $this->shop = Shop::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Nilkhet Print Hub Main',
            'slug' => 'nilkhet-main',
            'phone' => '01712345678',
            'email' => 'owner@nilkhet.test',
            'locale' => 'bn',
            'currency' => 'BDT',
            'timezone' => 'Asia/Dhaka',
            'public_status' => 'active',
        ]);

        $this->ownerUser = User::create([
            'name' => 'Shop Owner',
            'email' => 'owner@nilkhet.test',
            'phone' => '01712345678',
            'password' => bcrypt('password123'),
            'status' => 'active',
        ]);

        $tenantUser = TenantUser::create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->ownerUser->id,
            'status' => 'active',
        ]);

        $ownerRole = Role::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'owner',
            'guard_name' => 'web',
        ]);
        $tenantUser->roles()->attach($ownerRole->id);

        ShopUserAssignment::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'user_id' => $this->ownerUser->id,
            'role' => 'owner',
        ]);

        $this->ownerToken = $this->ownerUser->createToken('test')->plainTextToken;
    }

    private function authHeaders(): array
    {
        return [
            'Authorization' => "Bearer {$this->ownerToken}",
            'Accept' => 'application/json',
            'X-Tenant-ID' => $this->tenant->id,
        ];
    }

    public function test_dashboard_metrics_computes_correct_aggregates(): void
    {
        Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-ORD-01',
            'public_token_hash' => hash('sha256', 'token-1'),
            'customer_phone' => '01712345678',
            'status' => 'paid',
            'total_minor' => 1250,
            'currency' => 'BDT',
        ]);

        Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-ORD-02',
            'public_token_hash' => hash('sha256', 'token-2'),
            'customer_phone' => '01899887766',
            'status' => 'collected',
            'total_minor' => 750,
            'currency' => 'BDT',
        ]);

        Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-ORD-03',
            'public_token_hash' => hash('sha256', 'token-3'),
            'customer_phone' => '01911223344',
            'status' => 'cancelled',
            'total_minor' => 500,
            'currency' => 'BDT',
        ]);

        $response = $this->withHeaders($this->authHeaders())
            ->getJson('/api/v1/owner/dashboard/metrics');

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertEquals(3, $data['today_orders_count']);
        $this->assertEquals(2000, $data['today_revenue_poisha']);
        $this->assertEquals('৳ 20.00', $data['today_revenue_formatted']);
        $this->assertEquals('Asia/Dhaka', $response->json('meta.timezone'));
    }

    public function test_queue_listing_and_manual_hold_resume_actions(): void
    {
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-QUEUE-01',
            'public_token_hash' => hash('sha256', 'tok-queue'),
            'customer_phone' => '01712345678',
            'status' => 'paid',
            'total_minor' => 1000,
        ]);

        $file = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'Report.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 1024,
            'page_count' => 5,
            'scan_status' => 'clean',
            'object_key' => 'docs/report.pdf',
            'sha256_hash' => hash('sha256', 'doc'),
        ]);

        $job = PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $file->id,
            'status' => 'queued',
            'print_settings' => ['copies' => 2, 'duplex' => true, 'color' => false],
            'pages_total' => 5,
            'file_hash' => hash('sha256', 'doc'),
            'idempotency_key' => 'idemp-1',
        ]);

        $listRes = $this->withHeaders($this->authHeaders())
            ->getJson('/api/v1/owner/queue');

        $listRes->assertStatus(200);
        $this->assertCount(1, $listRes->json('data'));
        $this->assertEquals('PF-QUEUE-01', $listRes->json('data.0.order_reference'));
        $this->assertEquals('017****5678', $listRes->json('data.0.customer_phone_masked'));

        // Hold
        $holdRes = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/jobs/{$job->id}/hold");

        $holdRes->assertStatus(200);
        $this->assertEquals('held', $holdRes->json('data.status'));
        $this->assertEquals('held', $job->fresh()->status);

        // Resume
        $resumeRes = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/jobs/{$job->id}/resume");

        $resumeRes->assertStatus(200);
        $this->assertEquals('queued', $resumeRes->json('data.status'));
        $this->assertEquals('queued', $job->fresh()->status);
    }

    public function test_owner_can_cancel_order(): void
    {
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-CANCEL-01',
            'public_token_hash' => hash('sha256', 'tok-cancel'),
            'customer_phone' => '01712345678',
            'status' => 'paid',
            'total_minor' => 1000,
        ]);

        $cancelRes = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/orders/{$order->id}/cancel", [
                'reason' => 'Customer requested cancellation',
            ]);

        $cancelRes->assertStatus(200);
        $this->assertEquals('cancelled', $cancelRes->json('data.status'));
        $this->assertEquals('cancelled', $order->fresh()->status);
    }

    public function test_operator_without_cancel_permission_cannot_cancel_order(): void
    {
        $operator = User::create([
            'name' => 'Operator Staff',
            'email' => 'operator@nilkhet.test',
            'phone' => '01811223344',
            'password' => bcrypt('password123'),
        ]);

        $opTenantUser = TenantUser::create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $operator->id,
            'status' => 'active',
        ]);

        $operatorRole = Role::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'operator',
            'guard_name' => 'web',
        ]);

        $opTenantUser->roles()->attach($operatorRole->id);

        $opToken = $operator->createToken('op')->plainTextToken;

        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-CANCEL-02',
            'public_token_hash' => hash('sha256', 'tok-cancel-2'),
            'customer_phone' => '01712345678',
            'status' => 'paid',
            'total_minor' => 1000,
        ]);

        $opRes = $this->withHeaders([
            'Authorization' => "Bearer {$opToken}",
            'Accept' => 'application/json',
            'X-Tenant-ID' => $this->tenant->id,
        ])->postJson("/api/v1/owner/orders/{$order->id}/cancel");

        $opRes->assertStatus(403);
    }

    public function test_order_collection_handover_idempotency(): void
    {
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-HANDOVER-01',
            'public_token_hash' => hash('sha256', 'tok-handover'),
            'customer_phone' => '01712345678',
            'status' => 'READY',
            'total_minor' => 1000,
        ]);

        $firstHandover = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/orders/{$order->id}/handover");

        $firstHandover->assertStatus(200);
        $this->assertEquals('COLLECTED', $firstHandover->json('data.status'));

        // Duplicate click
        $secondHandover = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/orders/{$order->id}/handover");

        $secondHandover->assertStatus(200);
        $this->assertEquals('COLLECTED', $secondHandover->json('data.status'));
    }

    public function test_controlled_reprint_requires_mandatory_reason(): void
    {
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-REPRINT-01',
            'public_token_hash' => hash('sha256', 'tok-reprint'),
            'customer_phone' => '01712345678',
            'status' => 'completed',
            'total_minor' => 1250,
        ]);

        OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'Doc.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 1024,
            'page_count' => 3,
            'scan_status' => 'clean',
            'object_key' => 'docs/doc.pdf',
            'sha256_hash' => hash('sha256', 'doc'),
        ]);

        // Empty reason fails
        $failRes = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/orders/{$order->id}/reprint", [
                'reason' => '',
            ]);

        $failRes->assertStatus(422);

        // Non-empty reason succeeds
        $okRes = $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/owner/orders/{$order->id}/reprint", [
                'reason' => 'Toner smudge on back side of page 2',
            ]);

        $okRes->assertStatus(200);
        $this->assertNotNull($okRes->json('data.reprint_job_id'));

        $this->assertDatabaseHas('order_events', [
            'order_id' => $order->id,
            'event_type' => 'order.reprint_requested',
        ]);
    }

    public function test_printer_fleet_management_and_default_switch(): void
    {
        $p1 = Printer::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'name' => 'HP LaserJet Pro',
            'status' => 'ready',
            'is_default' => true,
            'is_online' => true,
            'capabilities' => ['color' => false, 'duplex' => true, 'paper_sizes' => ['A4']],
        ]);

        $p2 = Printer::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'name' => 'Epson L3210 Color',
            'status' => 'ready',
            'is_default' => false,
            'is_online' => true,
            'capabilities' => ['color' => true, 'duplex' => false, 'paper_sizes' => ['A4', 'Legal']],
        ]);

        // List
        $res = $this->withHeaders($this->authHeaders())
            ->getJson('/api/v1/owner/printers');

        $res->assertStatus(200);
        $this->assertCount(2, $res->json('data'));

        // Designate P2 as default
        $updateRes = $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/owner/printers/{$p2->id}", [
                'is_default' => true,
            ]);

        $updateRes->assertStatus(200);
        $this->assertTrue((bool) $p2->fresh()->is_default);
        $this->assertFalse((bool) $p1->fresh()->is_default);

        // Cannot disable default printer
        $disableRes = $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/owner/printers/{$p2->id}/status", [
                'is_active' => false,
            ]);

        $disableRes->assertStatus(422);
    }

    public function test_pricing_profile_active_and_preview_endpoints(): void
    {
        $getRes = $this->withHeaders($this->authHeaders())
            ->getJson('/api/v1/owner/pricing');

        $getRes->assertStatus(200);
        $this->assertEquals(200, $getRes->json('data.base_simplex_poisha'));

        $updateRes = $this->withHeaders($this->authHeaders())
            ->putJson('/api/v1/owner/pricing', [
                'base_simplex_poisha' => 300,
                'duplex_model' => 'model_b',
                'duplex_discount_percent' => 20,
            ]);

        $updateRes->assertStatus(200);
        $this->assertEquals(300, $updateRes->json('data.base_simplex_poisha'));

        // Preview: 5 pages duplex, 1 copy: front=3 @ 300 = 900, back=2 @ 240 = 480 -> 1380
        $prevRes = $this->withHeaders($this->authHeaders())
            ->postJson('/api/v1/owner/pricing/preview', [
                'base_simplex_poisha' => 300,
                'duplex_discount_percent' => 20,
                'pages' => 5,
                'copies' => 1,
                'sides_mode' => 'duplex',
            ]);

        $prevRes->assertStatus(200);
        $this->assertEquals(1380, $prevRes->json('data.subtotal_poisha'));
    }

    public function test_gateway_credentials_storage_and_masking(): void
    {
        $saveRes = $this->withHeaders($this->authHeaders())
            ->putJson('/api/v1/owner/gateways/sslcommerz', [
                'merchant_identifier' => 'dhaka_print_01',
                'store_password' => 'super_secret_password_1234',
                'environment' => 'sandbox',
            ]);

        $saveRes->assertStatus(200);
        $this->assertEquals('saved', $saveRes->json('data.status'));

        $getRes = $this->withHeaders($this->authHeaders())
            ->getJson('/api/v1/owner/gateways/sslcommerz');

        $getRes->assertStatus(200);
        $this->assertEquals('dhaka_print_01', $getRes->json('data.merchant_identifier'));
        $this->assertEquals('********1234', $getRes->json('data.store_password_masked'));
        $this->assertArrayNotHasKey('store_password', $getRes->json('data'));
    }
}
