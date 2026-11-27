<?php

declare(strict_types=1);

namespace Tests\Feature\Agent;

use App\Domain\FileDeletion\Jobs\DeleteOrderFileRemotely;
use App\Models\Order;
use App\Models\OrderFile;
use App\Models\PrintAgent;
use App\Models\PrintJob;
use App\Models\PrintJobAttempt;
use App\Models\Shop;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Tests\TestCase;

class PrintAgentApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Shop $shop;

    private User $owner;

    private string $ownerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Nilkhet Print Hub',
            'slug' => 'nilkhet-hub',
            'edition' => 'standalone',
        ]);

        $this->shop = Shop::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Main Counter',
            'slug' => 'main-counter',
            'phone' => '01712345678',
        ]);

        $this->owner = User::create([
            'name' => 'Habibur Rahman',
            'email' => 'habib@nilkhet.test',
            'phone' => '01712345678',
            'password' => bcrypt('Password123!'),
        ]);

        $this->ownerToken = $this->owner->createToken('owner-token')->plainTextToken;
    }

    public function test_owner_can_generate_agent_pairing_code(): void
    {
        $response = $this->withHeader('Authorization', 'Bearer '.$this->ownerToken)
            ->postJson('/api/v1/owner/agent/pairing-code', [
                'device_name' => 'Counter-01-Win11',
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'data' => [
                    'agent_id',
                    'pairing_code',
                    'expires_at',
                    'expires_in_seconds',
                ],
            ]);

        $pairingCode = $response->json('data.pairing_code');
        $this->assertEquals(6, strlen($pairingCode));

        $this->assertDatabaseHas('print_agents', [
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'pairing_code' => $pairingCode,
        ]);
    }

    public function test_agent_can_enroll_with_valid_pairing_code(): void
    {
        // 1. Generate pairing code
        $code = '123456';
        $agent = PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Pending Agent',
            'public_key_hash' => 'pending',
            'agent_token' => 'pending',
            'status' => 'offline',
            'pairing_code' => $code,
            'pairing_code_expires_at' => now()->addMinutes(5),
            'pairing_expires_at' => now()->addMinutes(5),
        ]);

        // 2. Enroll agent
        $enrollResponse = $this->postJson('/api/v1/agent/enroll', [
            'pairing_code' => $code,
            'device_name' => 'Workstation-A',
            'device_uuid' => 'win-guid-998877',
            'public_key_hash' => 'sha256-pubkey-sample-hash',
            'metadata' => [
                'os' => 'Windows 11 Pro',
                'arch' => 'x86_64',
            ],
        ]);

        $enrollResponse->assertStatus(200)
            ->assertJsonPath('data.agent_id', $agent->id)
            ->assertJsonPath('data.tenant_id', $this->tenant->id)
            ->assertJsonPath('data.shop_id', $this->shop->id)
            ->assertJsonPath('data.device_name', 'Workstation-A')
            ->assertJsonStructure([
                'data' => ['agent_id', 'agent_token', 'tenant_id', 'shop_id', 'device_name'],
            ]);

        $rawToken = $enrollResponse->json('data.agent_token');
        $this->assertNotEmpty($rawToken);

        $agent->refresh();
        $this->assertEquals('online', $agent->status);
        $this->assertNull($agent->pairing_code);
        $this->assertEquals(hash('sha256', $rawToken), $agent->agent_token_hash);
    }

    public function test_agent_enrollment_fails_with_expired_or_invalid_pairing_code(): void
    {
        // Expired code
        PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Expired Agent',
            'public_key_hash' => 'pending',
            'agent_token' => 'pending',
            'status' => 'offline',
            'pairing_code' => '999999',
            'pairing_code_expires_at' => now()->subMinutes(1),
            'pairing_expires_at' => now()->subMinutes(1),
        ]);

        $response = $this->postJson('/api/v1/agent/enroll', [
            'pairing_code' => '999999',
            'public_key_hash' => 'sha256-test',
        ]);

        $response->assertStatus(422);

        // Completely non-existent code
        $nonExistentResponse = $this->postJson('/api/v1/agent/enroll', [
            'pairing_code' => '000000',
            'public_key_hash' => 'sha256-test',
        ]);

        $nonExistentResponse->assertStatus(422);
    }

    public function test_agent_heartbeat_updates_presence(): void
    {
        $rawToken = 'pfa_valid_token_1234567890';
        $agent = PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Counter-01',
            'device_uuid' => 'guid-123',
            'public_key_hash' => 'pubkey-123',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'offline',
            'last_seen_at' => now()->subMinutes(10),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson('/api/v1/agent/heartbeat', [
                'metrics' => [
                    'cpu_usage' => 12.5,
                    'spooler_queue_count' => 0,
                ],
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'active');

        $agent->refresh();
        $this->assertEquals('online', $agent->status);
        $this->assertNotNull($agent->last_seen_at);
        $this->assertTrue($agent->last_seen_at->greaterThan(now()->subSeconds(5)));
    }

    public function test_agent_unauthorized_without_token_or_when_revoked(): void
    {
        // Missing token
        $missingTokenResp = $this->postJson('/api/v1/agent/heartbeat');
        $missingTokenResp->assertStatus(401);

        // Invalid token
        $invalidTokenResp = $this->withHeader('Authorization', 'Bearer invalid_token')
            ->postJson('/api/v1/agent/heartbeat');
        $invalidTokenResp->assertStatus(401);

        // Revoked agent
        $rawToken = 'pfa_revoked_token_123';
        PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Revoked-PC',
            'device_uuid' => 'guid-revoked',
            'public_key_hash' => 'pubkey-revoked',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'revoked',
        ]);

        $revokedResp = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson('/api/v1/agent/heartbeat');
        $revokedResp->assertStatus(403);
    }

    public function test_agent_can_sync_discovered_printers(): void
    {
        $rawToken = 'pfa_printer_sync_token';
        $agent = PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Counter-01',
            'device_uuid' => 'guid-printers',
            'public_key_hash' => 'pubkey-printers',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'online',
        ]);

        $payload = [
            'printers' => [
                [
                    'name' => 'Canon imageRUNNER 2520',
                    'system_name' => 'Canon_IR2520_UFRII',
                    'driver_name' => 'Canon UFR II LT',
                    'connection_type' => 'network',
                    'capabilities' => [
                        'color' => false,
                        'duplex' => true,
                        'supported_paper_sizes' => ['A4', 'Legal', 'A3'],
                        'trays' => ['Cassette 1', 'Cassette 2', 'Bypass Tray'],
                    ],
                    'status' => 'ready',
                    'is_default' => true,
                    'is_online' => true,
                ],
                [
                    'name' => 'HP LaserJet Pro M404dn',
                    'system_name' => 'HP_M404dn',
                    'driver_name' => 'HP PCL-6',
                    'connection_type' => 'usb',
                    'capabilities' => [
                        'color' => false,
                        'duplex' => true,
                        'supported_paper_sizes' => ['A4'],
                    ],
                    'status' => 'ready',
                    'is_default' => false,
                    'is_online' => true,
                ],
            ],
        ];

        $response = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson('/api/v1/agent/printers', $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.count', 2);

        $this->assertDatabaseHas('printers', [
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'print_agent_id' => $agent->id,
            'name' => 'Canon imageRUNNER 2520',
            'system_name' => 'Canon_IR2520_UFRII',
            'is_default' => true,
            'is_online' => true,
            'status' => 'ready',
        ]);

        $this->assertDatabaseHas('printers', [
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'print_agent_id' => $agent->id,
            'name' => 'HP LaserJet Pro M404dn',
            'is_default' => false,
        ]);
    }

    public function test_agent_job_lease_lifecycle_ack_and_purge_dispatch(): void
    {
        Queue::fake();

        $rawToken = 'pfa_job_lease_token';
        $agent = PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Agent Station',
            'device_uuid' => 'guid-job-lease',
            'public_key_hash' => 'pubkey-job-lease',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'online',
        ]);

        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01711223344',
            'public_reference' => 'PF-'.strtoupper(Str::random(6)),
            'public_token_hash' => hash('sha256', Str::random(24)),
            'status' => 'paid',
        ]);

        $orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'contract.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 102400,
            'page_count' => 5,
            'storage_disk' => 'local',
            'object_key' => 'orders/contract.pdf',
            'sha256_hash' => 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $job = PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $orderFile->id,
            'status' => 'queued',
            'print_settings' => [
                'copies' => 2,
                'color' => false,
                'duplex' => true,
                'paper_size' => 'A4',
            ],
            'file_hash' => 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'file_size_bytes' => 102400,
            'pages_total' => 5,
            'idempotency_key' => 'idemp_'.Str::random(32),
        ]);

        // 1. Lease job
        $leaseResponse = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson('/api/v1/agent/jobs/next');

        $leaseResponse->assertStatus(200)
            ->assertJsonPath('data.job_id', $job->id)
            ->assertJsonPath('data.file_hash', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
            ->assertJsonPath('data.pages_total', 5)
            ->assertJsonStructure([
                'data' => [
                    'job_id',
                    'order_id',
                    'order_file_id',
                    'lease_token',
                    'lease_expires_at',
                    'download_url',
                    'file_hash',
                    'print_settings',
                ],
            ]);

        $leaseToken = $leaseResponse->json('data.lease_token');
        $this->assertNotEmpty($leaseToken);

        $job->refresh();
        $this->assertEquals('leased', $job->status);
        $this->assertEquals($agent->id, $job->print_agent_id);
        $this->assertNotNull($job->lease_expires_at);

        $attempt = PrintJobAttempt::where('print_job_id', $job->id)->first();
        $this->assertNotNull($attempt);
        $this->assertEquals($agent->id, $attempt->print_agent_id);
        $this->assertEquals(1, $attempt->attempt_number);

        // 2. Acknowledge spooling completed
        $ackResponse = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson("/api/v1/agent/jobs/{$job->id}/ack", [
                'lease_token' => $leaseToken,
                'spooler_job_id' => 1042,
            ]);

        $ackResponse->assertStatus(200)
            ->assertJsonPath('data.job_id', $job->id)
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.spooler_job_id', 1042);

        $job->refresh();
        $this->assertEquals('completed', $job->status);
        $this->assertEquals(5, $job->pages_printed);
        $this->assertEquals('1042', (string) $job->spooler_job_id);

        $attempt->refresh();
        $this->assertEquals('completed', $attempt->status);
        $this->assertEquals(1042, $attempt->spooler_job_id);

        $order->refresh();
        $this->assertEquals('complete', $order->status);

        // Assert remote file purge job was dispatched
        Queue::assertPushed(DeleteOrderFileRemotely::class, function ($job) use ($orderFile) {
            return $job->orderFileId === $orderFile->id;
        });

        // 3. Local shred acknowledgement
        $shredResponse = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson("/api/v1/agent/jobs/{$job->id}/shred-ack");

        $shredResponse->assertStatus(200)
            ->assertJsonStructure(['data' => ['event_id', 'deletion_status']]);

        $this->assertDatabaseHas('file_deletion_events', [
            'tenant_id' => $this->tenant->id,
            'order_file_id' => $orderFile->id,
            'source' => 'agent_shred',
            'deletion_status' => 'local_shredded',
        ]);
    }

    public function test_stale_lease_reconciliation_command_transitions_to_unknown_never_queued(): void
    {
        $rawToken = 'pfa_stale_token';
        $agent = PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Agent Station',
            'device_uuid' => 'guid-stale',
            'public_key_hash' => 'pubkey-stale',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'online',
        ]);

        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01711223344',
            'public_reference' => 'PF-'.strtoupper(Str::random(6)),
            'public_token_hash' => hash('sha256', Str::random(24)),
            'status' => 'paid',
        ]);

        $orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'sample.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 50000,
            'page_count' => 2,
            'storage_disk' => 'local',
            'object_key' => 'orders/sample.pdf',
            'sha256_hash' => 'hash123',
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        // Job with expired lease
        $job = PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $orderFile->id,
            'print_agent_id' => $agent->id,
            'status' => 'leased',
            'lease_token' => 'plt_stale_token',
            'leased_at' => now()->subMinutes(10),
            'lease_expires_at' => now()->subMinutes(5), // EXPIRED!
            'print_settings' => ['copies' => 1],
            'file_hash' => 'hash123',
            'idempotency_key' => 'idemp_'.Str::random(32),
        ]);

        $attempt = PrintJobAttempt::create([
            'tenant_id' => $this->tenant->id,
            'print_job_id' => $job->id,
            'print_agent_id' => $agent->id,
            'attempt_number' => 1,
            'status' => 'leased',
            'started_at' => now()->subMinutes(10),
        ]);

        // Run artisan command
        $this->artisan('printflow:reconcile-leases')
            ->expectsOutputToContain("1 stale leases transitioned to 'unknown'")
            ->assertExitCode(0);

        $job->refresh();
        // MUST NEVER transition back to 'queued' automatically!
        $this->assertEquals('unknown', $job->status);
        $this->assertNotEquals('queued', $job->status);

        $attempt->refresh();
        $this->assertEquals('expired', $attempt->status);
        $this->assertEquals('LEASE_EXPIRED', $attempt->error_code);
    }

    public function test_unsigned_download_request_returns_403_forbidden(): void
    {
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01711223344',
            'public_reference' => 'PF-'.strtoupper(Str::random(6)),
            'public_token_hash' => hash('sha256', Str::random(24)),
            'status' => 'paid',
        ]);

        $orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'secret_doc.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 1234,
            'page_count' => 1,
            'storage_disk' => 'local',
            'object_key' => 'orders/secret_doc.pdf',
            'sha256_hash' => 'hash_secret_123',
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $job = PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $orderFile->id,
            'status' => 'leased',
            'print_settings' => ['copies' => 1],
            'file_hash' => 'hash_secret_123',
            'idempotency_key' => 'idemp_'.Str::random(32),
        ]);

        // Unsigned request must return HTTP 403 Forbidden
        $response = $this->getJson("/api/v1/agent/jobs/{$job->id}/download");
        $response->assertStatus(403);

        // Tampered signature must return HTTP 403 Forbidden
        $tamperedResponse = $this->getJson("/api/v1/agent/jobs/{$job->id}/download?signature=invalid_signature_hash&expires=9999999999");
        $tamperedResponse->assertStatus(403);
    }

    public function test_valid_signed_download_request_returns_document(): void
    {
        Storage::fake('local');
        $fileContent = '%PDF-1.4 test genuine pdf document';
        Storage::disk('local')->put('orders/signed_doc.pdf', $fileContent);

        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01711223344',
            'public_reference' => 'PF-'.strtoupper(Str::random(6)),
            'public_token_hash' => hash('sha256', Str::random(24)),
            'status' => 'paid',
        ]);

        $orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'signed_doc.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => strlen($fileContent),
            'page_count' => 1,
            'storage_disk' => 'local',
            'object_key' => 'orders/signed_doc.pdf',
            'sha256_hash' => hash('sha256', $fileContent),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $job = PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $orderFile->id,
            'status' => 'leased',
            'print_settings' => ['copies' => 1],
            'file_hash' => hash('sha256', $fileContent),
            'idempotency_key' => 'idemp_'.Str::random(32),
        ]);

        $signedUrl = URL::temporarySignedRoute(
            'agent.job.download',
            now()->addMinutes(15),
            ['id' => $job->id]
        );

        $response = $this->get($signedUrl);
        $response->assertStatus(200);
        $this->assertEquals($fileContent, $response->streamedContent());
        $response->assertHeader('X-File-SHA256', hash('sha256', $fileContent));
    }

    public function test_sandbox_payment_auto_enqueues_print_job_and_advances_order_stages(): void
    {
        Queue::fake();
        Storage::fake('local');

        $rawToken = 'pfa_e2e_stage_token';
        PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Counter E2E Agent',
            'device_uuid' => 'guid-e2e-stage',
            'public_key_hash' => 'pubkey-e2e-stage',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'online',
        ]);

        $orderToken = 'e2e_order_token_123456';
        $fileBytes = '%PDF-1.4 automated pipeline test content';
        Storage::disk('local')->put('orders/e2e.pdf', $fileBytes);

        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01711223344',
            'public_reference' => 'PF-E2E-101',
            'public_token_hash' => hash('sha256', $orderToken),
            'status' => 'uploaded',
            'total_minor' => 1000,
        ]);

        OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'e2e.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => strlen($fileBytes),
            'page_count' => 2,
            'storage_disk' => 'local',
            'object_key' => 'orders/e2e.pdf',
            'sha256_hash' => hash('sha256', $fileBytes),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        // 1. Sandbox payment captures order AND immediately flushes outbox to queued PrintJob
        $payRes = $this->postJson('/api/v1/public/payments/sandbox/simulate', [
            'order_token' => $orderToken,
            'outcome' => 'success',
            'amount_minor' => 1000,
        ]);
        $payRes->assertStatus(200)->assertJsonPath('data.status', 'PAID');

        $this->assertDatabaseHas('print_jobs', [
            'order_id' => $order->id,
            'status' => 'queued',
        ]);

        $this->getJson("/api/v1/public/order/{$orderToken}")
            ->assertStatus(200)
            ->assertJsonPath('data.current_stage', 2);

        // 2. Agent polls /jobs/next -> PrintJob leased & parent order enters Stage 3 (PRINTING)
        $leaseRes = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson('/api/v1/agent/jobs/next');
        $leaseRes->assertStatus(200);
        $jobId = $leaseRes->json('data.job_id');
        $leaseToken = $leaseRes->json('data.lease_token');
        $downloadUrl = $leaseRes->json('data.download_url');
        $this->assertNotEmpty($jobId);

        $this->getJson("/api/v1/public/order/{$orderToken}")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'printing')
            ->assertJsonPath('data.current_stage', 3);

        // 3. Signed download streams file bytes
        $dlRes = $this->get($downloadUrl);
        $dlRes->assertStatus(200);
        $this->assertEquals($fileBytes, $dlRes->streamedContent());

        // 4. Agent ack completes PrintJob -> Order transitions to complete & public timeline reaches READY (Stage 4)
        $ackRes = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson("/api/v1/agent/jobs/{$jobId}/ack", [
                'lease_token' => $leaseToken,
                'spooler_job_id' => 77,
                'status' => 'completed',
            ]);
        $ackRes->assertStatus(200)->assertJsonPath('data.status', 'completed');

        $this->getJson("/api/v1/public/order/{$orderToken}")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'complete')
            ->assertJsonPath('data.current_stage', 4);
    }

    public function test_permanent_agent_job_failure_marks_order_failed_not_ready(): void
    {
        $rawToken = 'pfa_fail_test_token';
        PrintAgent::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'device_name' => 'Counter Fail Test Agent',
            'device_uuid' => 'guid-fail-test',
            'public_key_hash' => 'pubkey-fail-test',
            'agent_token' => hash('sha256', $rawToken),
            'agent_token_hash' => hash('sha256', $rawToken),
            'status' => 'online',
        ]);

        $orderToken = 'fail_order_token_123456';
        $order = Order::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'customer_phone' => '01711223344',
            'public_reference' => 'PF-FAIL-101',
            'public_token_hash' => hash('sha256', $orderToken),
            'status' => 'paid',
        ]);

        $orderFile = OrderFile::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'original_name' => 'stuck.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 1024,
            'page_count' => 1,
            'storage_disk' => 'local',
            'object_key' => 'orders/stuck.pdf',
            'sha256_hash' => hash('sha256', 'stuck'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $job = PrintJob::create([
            'tenant_id' => $this->tenant->id,
            'shop_id' => $this->shop->id,
            'order_id' => $order->id,
            'order_file_id' => $orderFile->id,
            'status' => 'queued',
            'print_settings' => ['copies' => 1],
            'file_hash' => hash('sha256', 'stuck'),
            'file_size_bytes' => 1024,
            'pages_total' => 1,
            'idempotency_key' => 'idemp_'.Str::random(32),
        ]);

        $leaseRes = $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson('/api/v1/agent/jobs/next');
        $leaseToken = $leaseRes->json('data.lease_token');

        $this->withHeader('Authorization', 'Bearer '.$rawToken)
            ->postJson("/api/v1/agent/jobs/{$job->id}/fail", [
                'lease_token' => $leaseToken,
                'error_code' => 'WIN32_PRINT_ERROR',
                'error_message' => 'Print job was cancelled in the Windows print queue.',
                'retryable' => false,
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'failed');

        $order->refresh();
        $this->assertEquals('failed', $order->status);

        $this->getJson("/api/v1/public/order/{$orderToken}")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.print_failed', true)
            ->assertJsonPath('data.current_stage', 3);
    }
}
