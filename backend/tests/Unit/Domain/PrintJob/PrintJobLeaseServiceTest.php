<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\PrintJob;

use App\Domain\FileDeletion\Jobs\DeleteOrderFileRemotely;
use App\Domain\PrintJob\PrintJobLeaseService;
use App\Domain\PrintJob\StaleLeaseReconciler;
use App\Models\Order;
use App\Models\OrderFile;
use App\Models\PrintAgent;
use App\Models\PrintJob;
use App\Models\PrintJobAttempt;
use App\Models\Shop;
use App\Models\Tenant;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class PrintJobLeaseServiceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private Shop $shop;
    private PrintAgent $agent;
    private PrintJobLeaseService $service;

    protected function setUp(): void
    {
        parent::setUp();

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

        $this->agent = PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Agent-01',
            'device_uuid' => 'guid-1122',
            'public_key_hash' => 'pubkey-1122',
            'agent_token' => hash('sha256', 'tok123'),
            'agent_token_hash' => hash('sha256', 'tok123'),
            'status' => 'online',
        ]);

        $this->service = app(PrintJobLeaseService::class);
    }

    private function createJob(string $status = 'queued'): PrintJob
    {
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01812345678',
            'public_reference' => 'PF-' . strtoupper(Str::random(6)),
            'public_token_hash' => hash('sha256', Str::random(24)),
            'status' => 'paid',
        ]);

        $orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'doc.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 12345,
            'page_count' => 3,
            'storage_disk' => 'local',
            'object_key' => 'orders/doc.pdf',
            'sha256_hash' => 'hashabc',
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        return PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $orderFile->id,
            'status' => $status,
            'print_settings' => ['copies' => 1, 'color' => false],
            'file_hash' => 'hashabc',
            'file_size_bytes' => 12345,
            'pages_total' => 3,
            'idempotency_key' => 'idemp_' . Str::random(32),
        ]);
    }

    public function test_leases_next_queued_job_with_300s_ttl(): void
    {
        $job = $this->createJob('queued');

        $result = $this->service->leaseNextJob($this->agent);

        $this->assertNotNull($result);
        $this->assertEquals($job->id, $result['job_id']);
        $this->assertNotEmpty($result['lease_token']);
        $this->assertEquals('hashabc', $result['file_hash']);
        $this->assertEquals(3, $result['pages_total']);

        $job->refresh();
        $this->assertEquals('leased', $job->status);
        $this->assertEquals($this->agent->id, $job->print_agent_id);
        $this->assertNotNull($job->lease_expires_at);
        $this->assertTrue($job->lease_expires_at->greaterThan(now()->addSeconds(290)));
    }

    public function test_returns_null_when_no_queued_jobs_available(): void
    {
        $this->createJob('completed');
        $this->createJob('leased');

        $result = $this->service->leaseNextJob($this->agent);
        $this->assertNull($result);
    }

    public function test_acknowledge_with_wrong_lease_token_throws_exception(): void
    {
        $job = $this->createJob('queued');
        $leased = $this->service->leaseNextJob($this->agent);
        $job->refresh();

        $this->expectException(DomainException::class);
        $this->expectExceptionMessage('Invalid lease token');

        $this->service->acknowledgeJob($job, 'wrong_token', 999);
    }

    public function test_acknowledge_with_correct_token_completes_job_and_dispatches_purge(): void
    {
        Queue::fake();

        $job = $this->createJob('queued');
        $leased = $this->service->leaseNextJob($this->agent);
        $job->refresh();

        $completedJob = $this->service->acknowledgeJob($job, $leased['lease_token'], 501);

        $this->assertEquals('completed', $completedJob->status);
        $this->assertEquals('501', (string) $completedJob->spooler_job_id);
        $this->assertEquals(3, $completedJob->pages_printed);

        Queue::assertPushed(DeleteOrderFileRemotely::class);
    }

    public function test_stale_reconciler_moves_expired_leases_to_unknown_never_queued(): void
    {
        $job = $this->createJob('queued');
        $leased = $this->service->leaseNextJob($this->agent);

        // Manually simulate lease expiration in the past
        $job->update([
            'lease_expires_at' => now()->subSeconds(10),
        ]);

        $reconciler = app(StaleLeaseReconciler::class);
        $count = $reconciler->reconcile();

        $this->assertEquals(1, $count);

        $job->refresh();
        $this->assertEquals('unknown', $job->status);
        $this->assertNotEquals('queued', $job->status);

        $attempt = $job->attempts()->latest('attempt_number')->first();
        $this->assertEquals('expired', $attempt->status);
    }
}
