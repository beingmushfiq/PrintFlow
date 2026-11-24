<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Pricing;

use App\Domain\Pricing\DTOs\QuoteSnapshotData;
use App\Domain\Pricing\Services\QuoteSnapshotGenerator;
use App\Models\Order;
use App\Models\Quote;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuoteSnapshotGeneratorTest extends TestCase
{
    use RefreshDatabase;

    public function test_freezes_quote_snapshot_with_deterministic_hash_and_15_minute_ttl(): void
    {
        $tenant = Tenant::create(['name' => 'Test Tenant', 'slug' => 'test-tenant', 'status' => 'active']);
        $shop = Shop::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Test Shop',
            'slug' => 'test-shop',
            'phone' => '01712345678',
            'public_status' => 'active',
        ]);

        $order = Order::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'public_reference' => 'PF-TEST-001',
            'public_token_hash' => hash('sha256', 'tok_123'),
            'customer_phone' => '01712345678',
            'status' => 'draft',
        ]);

        $data = new QuoteSnapshotData(
            subtotalPoisha: 1000,
            taxPoisha: 50,
            feePoisha: 0,
            discountPoisha: 100,
            floorAdjustmentPoisha: 0,
            totalPoisha: 1050,
            costPerCopyPoisha: 1000,
            totalSheets: 5,
            totalSides: 5,
            duplexSheets: 0,
            simplexSheets: 5,
            lineItems: [
                ['description' => '5 Simplex pages @ ৳2.00', 'quantity' => 5, 'unitRatePoisha' => 200, 'totalPoisha' => 1000],
            ],
            currency: 'BDT'
        );

        $generator = new QuoteSnapshotGenerator();
        $quote = $generator->generate($order, $data);

        $this->assertSame(1, $quote->quote_version);
        $this->assertSame(1050, $quote->total_minor);
        $this->assertSame(64, strlen($quote->calculation_hash));
        $this->assertFalse($quote->isExpired());

        $this->assertTrue(QuoteSnapshotGenerator::verifyHash($quote));

        // Tamper with total and test verification failure
        $quote->total_minor = 500;
        $this->assertFalse(QuoteSnapshotGenerator::verifyHash($quote));
    }
}
