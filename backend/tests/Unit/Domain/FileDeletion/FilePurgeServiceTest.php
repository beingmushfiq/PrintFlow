<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\FileDeletion;

use App\Domain\FileDeletion\FilePurgeService;
use App\Models\FileDeletionEvent;
use App\Models\Order;
use App\Models\OrderFile;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class FilePurgeServiceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private Shop $shop;
    private Order $order;
    private OrderFile $orderFile;
    private FilePurgeService $service;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->tenant = Tenant::create([
            'name' => 'Test Tenant',
            'slug' => 'test-tenant',
            'edition' => 'standalone',
        ]);

        $this->shop = Shop::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Test Shop',
            'slug' => 'test-shop',
            'phone' => '01712345678',
        ]);

        $this->order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01912345678',
            'public_reference' => 'PF-' . strtoupper(Str::random(6)),
            'public_token_hash' => hash('sha256', Str::random(24)),
            'status' => 'paid',
        ]);

        // Put a fake file in storage
        $objectKey = 'orders/testfile.pdf';
        Storage::disk('local')->put($objectKey, 'Fake PDF byte payload');

        $this->orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $this->order->id,
            'original_name' => 'testfile.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 21,
            'page_count' => 1,
            'storage_disk' => 'local',
            'object_key' => $objectKey,
            'sha256_hash' => hash('sha256', 'Fake PDF byte payload'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $this->service = app(FilePurgeService::class);
    }

    public function test_record_local_shred_creates_audit_event(): void
    {
        $event = $this->service->recordLocalShred($this->orderFile->id, $this->tenant->id, [
            'file_name' => 'testfile.pdf',
            'bytes_shredded' => 21,
        ]);

        $this->assertInstanceOf(FileDeletionEvent::class, $event);
        $this->assertEquals($this->tenant->id, $event->tenant_id);
        $this->assertEquals($this->orderFile->id, $event->order_file_id);
        $this->assertEquals($this->order->id, $event->order_id);
        $this->assertEquals('agent_shred', $event->source);
        $this->assertNotEmpty($event->audit_hash);
        $this->assertNotNull($event->deleted_at);

        $this->assertDatabaseHas('file_deletion_events', [
            'id' => $event->id,
            'source' => 'agent_shred',
            'order_file_id' => $this->orderFile->id,
        ]);
    }

    public function test_purge_remote_file_deletes_object_and_creates_audit_event(): void
    {
        $this->assertTrue(Storage::disk('local')->exists($this->orderFile->object_key));

        $event = $this->service->purgeRemoteFile($this->orderFile, 'order_completed');

        $this->assertNotNull($event);
        $this->assertEquals('server_purge', $event->source);
        $this->assertEquals('order_completed', $event->reason);
        $this->assertNotEmpty($event->audit_hash);

        // Verify storage file was deleted
        $this->assertFalse(Storage::disk('local')->exists($this->orderFile->object_key));

        // Verify order file status updated
        $this->orderFile->refresh();
        $this->assertEquals('remote_purged', $this->orderFile->deletion_status);
        $this->assertNotNull($this->orderFile->deleted_at);
    }
}
