<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Payment;

use App\Domain\Payment\Drivers\BkashCheckoutDriver;
use App\Domain\Payment\Drivers\SandboxDriver;
use App\Domain\Payment\Drivers\SslCommerzDriver;
use App\Domain\Payment\Outbox\OutboxProcessor;
use App\Domain\Payment\Outbox\PaymentCaptureService;
use App\Domain\Payment\Services\WebhookSignatureVerifier;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\OrderFile;
use App\Models\OutboxEvent;
use App\Models\Payment;
use App\Models\PrintJob;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentGatewayDriversTest extends TestCase
{
    use RefreshDatabase;

    public function test_sandbox_driver_deterministic_outcomes(): void
    {
        $driver = new SandboxDriver;

        // Success outcome
        $success = $driver->initiateCheckout([
            'order_token' => 'ord_tok_123',
            'amount_minor' => 1250,
            'outcome' => 'success',
        ]);
        $this->assertSame('PAID', $success['status']);
        $this->assertSame('sandbox', $success['gateway']);
        $this->assertSame(1250, $success['amountPoisha']);
        $this->assertSame(64, strlen($success['idempotencyKey']));

        // Deterministic idempotency key
        $success2 = $driver->initiateCheckout([
            'order_token' => 'ord_tok_123',
            'amount_minor' => 1250,
            'outcome' => 'success',
        ]);
        $this->assertSame($success['idempotencyKey'], $success2['idempotencyKey']);

        // Failed outcome
        $failed = $driver->initiateCheckout([
            'order_token' => 'ord_tok_123',
            'amount_minor' => 500,
            'outcome' => 'failed',
        ]);
        $this->assertSame('PAYMENT_FAILED', $failed['status']);
        $this->assertStringContainsString('declined', $failed['error']);

        // Timeout outcome
        $timeout = $driver->initiateCheckout([
            'order_token' => 'ord_tok_123',
            'amount_minor' => 500,
            'outcome' => 'timeout',
        ]);
        $this->assertSame('PENDING_TIMEOUT', $timeout['status']);
    }

    public function test_sslcommerz_driver_session_and_signature_validation(): void
    {
        $driver = new SslCommerzDriver(
            storeId: 'test_store',
            storePassword: 'secret_password_123'
        );

        $session = $driver->initiateCheckout([
            'tran_id' => 'PF_TX_SSL_01',
            'amount_minor' => 5000,
            'currency' => 'BDT',
        ]);

        $this->assertSame('SUCCESS', $session['status']);
        $this->assertStringContainsString('sandbox.sslcommerz.com', $session['GatewayPageURL']);
        $this->assertSame('50.00', $session['amount']);

        // Valid signature test
        $keys = ['amount', 'currency', 'status', 'tran_id', 'val_id'];
        sort($keys);
        $payload = [
            'tran_id' => 'PF_TX_SSL_01',
            'val_id' => 'VAL_123',
            'amount' => '50.00',
            'currency' => 'BDT',
            'status' => 'VALID',
            'verify_key' => implode(',', $keys),
        ];

        $hashStringParts = [];
        foreach ($keys as $k) {
            $hashStringParts[] = "{$k}={$payload[$k]}";
        }
        $signString = implode('&', $hashStringParts).'&'.md5('secret_password_123');
        $payload['verify_sign'] = md5($signString);

        $this->assertTrue($driver->validateIpnSignature($payload, 'secret_password_123'));
        $this->assertFalse($driver->validateIpnSignature($payload, 'wrong_password'));

        // Tamper amount
        $tampered = $payload;
        $tampered['amount'] = '99999.00';
        $this->assertFalse($driver->validateIpnSignature($tampered, 'secret_password_123'));
    }

    public function test_bkash_driver_operations_and_error_codes(): void
    {
        $driver = new BkashCheckoutDriver;

        $session = $driver->initiateCheckout([
            'amount_minor' => 3500,
            'merchant_invoice_number' => 'INV_1001',
        ]);

        $this->assertSame('0000', $session['statusCode']);
        $this->assertStringStartsWith('TR0011', $session['paymentID']);
        $this->assertStringContainsString('sandbox.payment.bkash.com', $session['bkashURL']);

        $query = $driver->queryTransaction('TR001199');
        $this->assertSame('0000', $query['statusCode']);
        $this->assertSame('Completed', $query['transactionStatus']);

        $this->assertSame('Invalid App Key', $driver->normalizeErrorCode('2001'));
        $this->assertSame('Insufficient Balance in Customer Wallet', $driver->normalizeErrorCode('2023'));
        $this->assertSame('Duplicate for all transactions', $driver->normalizeErrorCode('2029'));
    }

    public function test_webhook_raw_signature_verifier(): void
    {
        $verifier = new WebhookSignatureVerifier;
        $secret = 'printflow_webhook_secret_key';
        $payload = '{"event":"order.paid","amount_poisha":1250}';
        $sig = hash_hmac('sha256', $payload, $secret);

        $this->assertTrue($verifier->verifyRawSignature($payload, $sig, $secret));
        $this->assertFalse($verifier->verifyRawSignature($payload.' ', $sig, $secret));
        $this->assertFalse($verifier->verifyRawSignature($payload, 'bad_sig', $secret));

        // Replay window
        $nowIso = date('c');
        $oldIso = date('c', time() - 600); // 10 minutes ago
        $this->assertTrue($verifier->isTimestampValid($nowIso));
        $this->assertFalse($verifier->isTimestampValid($oldIso));
    }

    public function test_payment_capture_and_outbox_processor(): void
    {
        $tenant = Tenant::create(['name' => 'T1', 'slug' => 't1', 'status' => 'active']);
        $shop = Shop::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'name' => 'S1',
            'slug' => 's1',
            'phone' => '01712345678',
            'public_status' => 'active',
        ]);

        $order = Order::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'public_reference' => 'PF-OUTBOX-01',
            'public_token_hash' => hash('sha256', 'tok_outbox'),
            'customer_phone' => '01712345678',
            'status' => 'draft',
            'quote_snapshot_json' => [
                'print_options' => [
                    'copies' => 2,
                    'color' => false,
                    'duplex' => true,
                    'paper_size' => 'A4',
                    'orientation' => 'portrait',
                ],
            ],
        ]);

        $file = OrderFile::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'order_id' => $order->id,
            'original_name' => 'invoice.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 4096,
            'page_count' => 3,
            'storage_disk' => 'local',
            'object_key' => 'orders/invoice.pdf',
            'sha256_hash' => hash('sha256', 'invoice-pdf-content'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $payment = Payment::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'order_id' => $order->id,
            'internal_reference' => 'PF_TX_OUTBOX_01',
            'provider' => 'sandbox',
            'amount_minor' => 1250,
            'status' => 'created',
        ]);

        $captureService = new PaymentCaptureService;
        $result = $captureService->capture($payment, $order, ['transaction_id' => 'SNDBX_123']);

        $this->assertSame('captured', $result['payment']->status);
        $this->assertSame('paid', $result['order']->status);
        $this->assertSame('order.paid', $result['outbox']->event_type);
        $this->assertSame('pending', $result['outbox']->status);

        // Outbox processing
        $processor = new OutboxProcessor;
        $processed = $processor->processPending(10);
        $this->assertSame(1, $processed);

        $outboxFresh = OutboxEvent::withoutTenant()->find($result['outbox']->id);
        $this->assertSame('processed', $outboxFresh->status);

        // Assert PrintJob was genuinely created with queued status
        $printJobs = PrintJob::withoutTenant()->where('order_id', $order->id)->get();
        $this->assertCount(1, $printJobs);
        $job = $printJobs->first();
        $this->assertSame('queued', $job->status);
        $this->assertSame($tenant->id, $job->tenant_id);
        $this->assertSame($shop->id, $job->shop_id);
        $this->assertSame($file->id, $job->order_file_id);
        $this->assertSame($file->sha256_hash, $job->file_hash);
        $this->assertSame(4096, $job->file_size_bytes);
        $this->assertSame(3, $job->pages_total);
        $this->assertSame(2, $job->print_settings['copies']);
        $this->assertSame(OutboxProcessor::generateJobIdempotencyKey($order->id, $file->id, 1), $job->idempotency_key);
    }

    public function test_outbox_processor_creates_queued_print_jobs_idempotently_for_paid_orders(): void
    {
        $tenant = Tenant::create(['name' => 'T2', 'slug' => 't2', 'status' => 'active']);
        $shop = Shop::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'name' => 'S2',
            'slug' => 's2',
            'phone' => '01812345678',
            'public_status' => 'active',
        ]);

        $order = Order::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'public_reference' => 'PF-OUTBOX-MULTI',
            'public_token_hash' => hash('sha256', 'tok_outbox_multi'),
            'customer_phone' => '01812345678',
            'status' => 'paid',
            'quote_snapshot_json' => [
                'print_options' => [
                    'copies' => 1,
                    'color' => true,
                    'duplex' => false,
                    'paper_size' => 'Legal',
                    'orientation' => 'landscape',
                ],
            ],
        ]);

        $file1 = OrderFile::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'order_id' => $order->id,
            'original_name' => 'chapter1.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 1024,
            'page_count' => 5,
            'storage_disk' => 'local',
            'object_key' => 'orders/ch1.pdf',
            'sha256_hash' => hash('sha256', 'ch1'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $file2 = OrderFile::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'order_id' => $order->id,
            'original_name' => 'chapter2.pdf',
            'mime_type_detected' => 'application/pdf',
            'size_bytes' => 2048,
            'page_count' => 10,
            'storage_disk' => 'local',
            'object_key' => 'orders/ch2.pdf',
            'sha256_hash' => hash('sha256', 'ch2'),
            'scan_status' => 'clean',
            'processing_status' => 'processed',
        ]);

        $event = OutboxEvent::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'event_type' => 'order.paid',
            'payload_json' => [
                'order_id' => $order->id,
                'files' => [$file1->id, $file2->id],
            ],
            'status' => 'pending',
            'retry_count' => 0,
        ]);

        $processor = new OutboxProcessor;
        $this->assertTrue($processor->processEvent($event));

        $jobs = PrintJob::withoutTenant()->where('order_id', $order->id)->get();
        $this->assertCount(2, $jobs);

        foreach ($jobs as $job) {
            $this->assertSame('queued', $job->status);
            $this->assertSame($tenant->id, $job->tenant_id);
            $this->assertSame($shop->id, $job->shop_id);
            $this->assertTrue($job->print_settings['color']);
            $this->assertSame('Legal', $job->print_settings['paper_size']);
        }

        // Re-processing the same event or processing pending again must be strictly idempotent
        $event->update(['status' => 'pending']);
        $this->assertTrue($processor->processEvent($event));

        $jobsAfterSecondRun = PrintJob::withoutTenant()->where('order_id', $order->id)->get();
        $this->assertCount(2, $jobsAfterSecondRun);
    }

    public function test_concurrent_double_capture_returns_early_without_duplicate_events(): void
    {
        $tenant = Tenant::create(['name' => 'T3', 'slug' => 't3', 'status' => 'active']);
        $shop = Shop::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'name' => 'S3',
            'slug' => 's3',
            'phone' => '01712345678',
            'public_status' => 'active',
        ]);

        $order = Order::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'public_reference' => 'PF-DOUBLE-CAP',
            'public_token_hash' => hash('sha256', 'tok_double_cap'),
            'customer_phone' => '01712345678',
            'status' => 'draft',
        ]);

        $payment = Payment::withoutTenant()->create([
            'tenant_id' => $tenant->id,
            'shop_id' => $shop->id,
            'order_id' => $order->id,
            'internal_reference' => 'PF_TX_DOUBLE_01',
            'provider' => 'sslcommerz',
            'amount_minor' => 2500,
            'status' => 'initiated',
        ]);

        $captureService = new PaymentCaptureService;

        // First capture call
        $firstResult = $captureService->capture($payment, $order, ['transaction_id' => 'TXN_FIRST_123']);
        $this->assertSame('captured', $firstResult['payment']->status);
        $this->assertSame('paid', $firstResult['order']->status);
        $this->assertNotNull($firstResult['outbox']);

        // Check initial event counts
        $orderEventsInitial = OrderEvent::withoutTenant()->where('order_id', $order->id)->count();
        $outboxEventsInitial = OutboxEvent::withoutTenant()->where('tenant_id', $tenant->id)->count();
        $this->assertSame(1, $orderEventsInitial);
        $this->assertSame(1, $outboxEventsInitial);

        // Second concurrent capture call on already captured payment
        $secondResult = $captureService->capture($payment, $order, ['transaction_id' => 'TXN_SECOND_456']);
        $this->assertSame('captured', $secondResult['payment']->status);
        $this->assertSame('paid', $secondResult['order']->status);
        $this->assertNull($secondResult['outbox']); // Must return early with outbox: null

        // Verify NO duplicate OrderEvent or OutboxEvent was created
        $orderEventsAfter = OrderEvent::withoutTenant()->where('order_id', $order->id)->count();
        $outboxEventsAfter = OutboxEvent::withoutTenant()->where('tenant_id', $tenant->id)->count();
        $this->assertSame(1, $orderEventsAfter, 'Double capture must not create duplicate OrderEvent');
        $this->assertSame(1, $outboxEventsAfter, 'Double capture must not create duplicate OutboxEvent');
    }
}
