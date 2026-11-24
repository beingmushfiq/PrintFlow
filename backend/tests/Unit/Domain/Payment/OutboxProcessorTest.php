<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Payment;

use App\Domain\Payment\Outbox\OutboxProcessor;
use App\Models\Order;
use App\Models\OrderFile;
use App\Models\OutboxEvent;
use App\Models\PrintJob;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OutboxProcessorTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Shop $shop;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Nilkhet Print Hub',
            'slug' => 'nilkhet-hub',
            'status' => 'active',
        ]);

        $this->shop = Shop::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Main Outlet',
            'slug' => 'main-outlet',
            'phone' => '01712345678',
            'public_status' => 'active',
        ]);
    }

    public function test_unpaid_order_does_not_create_print_jobs(): void
    {
        $order = Order::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-DRAFT-01',
            'public_token_hash' => hash('sha256', 'tok_draft'),
            'customer_phone' => '01712345678',
            'status' => 'draft', // Not paid!
        ]);

        $file = OrderFile::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'draft.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 1024,
            'page_count' => 1,
            'storage_disk' => 'local',
            'object_key' => 'orders/draft.pdf',
            'sha256_hash' => hash('sha256', 'draft'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $event = OutboxEvent::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'event_type' => 'order.paid',
            'payload_json' => [
                'order_id' => $order->id,
                'files' => [$file->id],
            ],
            'status' => 'pending',
            'retry_count' => 0,
        ]);

        $processor = new OutboxProcessor;
        $this->assertTrue($processor->processEvent($event));

        $this->assertDatabaseMissing('print_jobs', [
            'order_id' => $order->id,
        ]);
    }

    public function test_paid_order_creates_queued_print_job_with_all_metadata(): void
    {
        $order = Order::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'public_reference' => 'PF-PAID-01',
            'public_token_hash' => hash('sha256', 'tok_paid'),
            'customer_phone' => '01712345678',
            'status' => 'paid',
            'quote_snapshot_json' => [
                'print_options' => [
                    'copies' => 3,
                    'color' => false,
                    'duplex' => true,
                    'paper_size' => 'A4',
                    'orientation' => 'portrait',
                ],
            ],
        ]);

        $file = OrderFile::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'thesis.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 524288,
            'page_count' => 45,
            'storage_disk' => 'local',
            'object_key' => 'orders/thesis.pdf',
            'sha256_hash' => hash('sha256', 'thesis_content'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $event = OutboxEvent::withoutTenant()->create([
            'tenant_id' => $this->tenant->id,
            'event_type' => 'order.paid',
            'payload_json' => [
                'order_id' => $order->id,
                'files' => [$file->id],
            ],
            'status' => 'pending',
            'retry_count' => 0,
        ]);

        $processor = new OutboxProcessor;
        $this->assertTrue($processor->processEvent($event));

        $job = PrintJob::withoutTenant()->where('order_id', $order->id)->first();
        $this->assertNotNull($job);
        $this->assertSame('queued', $job->status);
        $this->assertSame($this->tenant->id, $job->tenant_id);
        $this->assertSame($this->shop->id, $job->shop_id);
        $this->assertSame($file->id, $job->order_file_id);
        $this->assertSame($file->sha256_hash, $job->file_hash);
        $this->assertSame(524288, $job->file_size_bytes);
        $this->assertSame(45, $job->pages_total);
        $this->assertSame(3, $job->print_settings['copies']);
        $this->assertTrue($job->print_settings['duplex']);
        $this->assertSame('A4', $job->print_settings['paper_size']);
        $this->assertSame(OutboxProcessor::generateJobIdempotencyKey($order->id, $file->id, 1), $job->idempotency_key);
    }
}
