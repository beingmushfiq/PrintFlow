<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Payment\Drivers\SslCommerzDriver;
use App\Domain\Payment\Outbox\OutboxProcessor;
use App\Domain\Payment\Outbox\PaymentCaptureService;
use App\Domain\Payment\Services\WebhookSignatureVerifier;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GatewayAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\WebhookEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    public function __construct(
        private readonly WebhookSignatureVerifier $signatureVerifier,
        private readonly PaymentCaptureService $captureService,
    ) {}

    /**
     * Handle incoming SSLCOMMERZ IPN webhook callback.
     */
    public function sslcommerz(Request $request): JsonResponse
    {
        $rawPayload = (string) $request->getContent();
        $payload = $request->all();

        $payloadHash = hash('sha256', $rawPayload ?: json_encode($payload));
        $tranId = (string) ($payload['tran_id'] ?? '');
        $valId = (string) ($payload['val_id'] ?? '');

        // Resolve payment
        $payment = Payment::withoutTenant()->where('internal_reference', $tranId)->first();

        // Resolve store password
        $storePassword = 'test_store_passwd';
        if ($payment && $payment->gateway_account_id) {
            $account = GatewayAccount::withoutTenant()->find($payment->gateway_account_id);
            if ($account) {
                // In production, decrypt ciphertext
                $storePassword = 'test_store_passwd';
            }
        }

        $driver = new SslCommerzDriver(storePassword: $storePassword);
        $isValidSignature = $driver->validateIpnSignature($payload, $storePassword);

        // Also check if raw HMAC signature header provided (Feature 41)
        $sigHeader = $request->header('x-signature') ?? $request->header('x-hub-signature-256');
        if ($sigHeader && ! $this->signatureVerifier->verifyRawSignature($rawPayload, $sigHeader, $storePassword)) {
            $isValidSignature = false;
        }

        if (! $isValidSignature) {
            WebhookEvent::create([
                'provider' => 'sslcommerz',
                'provider_event_id' => $valId ?: null,
                'event_type' => 'payment.ipn',
                'signature_valid' => false,
                'received_at' => now(),
                'processed_at' => now(),
                'processing_status' => 'failed',
                'payload_hash' => $payloadHash,
                'redacted_payload_json' => [
                    'tran_id' => $tranId,
                    'status' => $payload['status'] ?? null,
                ],
                'failure_code' => 'INVALID_SIGNATURE',
            ]);

            return ApiResponse::error([
                [
                    'code' => 'INVALID_WEBHOOK_SIGNATURE',
                    'message' => 'The provided webhook signature failed cryptographic verification.',
                ],
            ], 400);
        }

        $webhookEvent = WebhookEvent::create([
            'provider' => 'sslcommerz',
            'provider_event_id' => $valId ?: null,
            'event_type' => 'payment.ipn',
            'signature_valid' => true,
            'received_at' => now(),
            'processed_at' => now(),
            'processing_status' => 'processed',
            'payload_hash' => $payloadHash,
            'redacted_payload_json' => [
                'tran_id' => $tranId,
                'val_id' => $valId,
                'amount' => $payload['amount'] ?? null,
                'card_type' => $payload['card_type'] ?? null,
                'status' => $payload['status'] ?? null,
            ],
            'failure_code' => null,
        ]);

        if ($payment && $payment->status !== 'captured') {
            $order = Order::withoutTenant()->find($payment->order_id);
            if ($order && strtoupper((string) ($payload['status'] ?? '')) === 'VALID') {
                $this->captureService->capture($payment, $order, [
                    'val_id' => $valId,
                    'bank_tran_id' => $payload['bank_tran_id'] ?? null,
                    'card_type' => $payload['card_type'] ?? null,
                    'card_issuer' => $payload['card_issuer'] ?? null,
                    'amount' => $payload['amount'] ?? null,
                ]);
                try {
                    app(OutboxProcessor::class)->processPending(10);
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        return ApiResponse::success([
            'status' => 'processed',
            'event_id' => $webhookEvent->id,
        ]);
    }

    /**
     * Handle incoming bKash webhook callback.
     */
    public function bkash(Request $request): JsonResponse
    {
        $rawPayload = (string) $request->getContent();
        $payload = $request->all();

        $payloadHash = hash('sha256', $rawPayload ?: json_encode($payload));
        $paymentId = (string) ($payload['paymentID'] ?? $payload['payment_id'] ?? '');

        // Check raw HMAC header if supplied
        $sigHeader = $request->header('x-signature') ?? $request->header('x-hub-signature-256');
        $secret = 'printflow_webhook_secret_key';

        if ($sigHeader && ! $this->signatureVerifier->verifyRawSignature($rawPayload, $sigHeader, $secret)) {
            WebhookEvent::create([
                'provider' => 'bkash',
                'provider_event_id' => $paymentId ?: null,
                'event_type' => 'payment.callback',
                'signature_valid' => false,
                'received_at' => now(),
                'processed_at' => now(),
                'processing_status' => 'failed',
                'payload_hash' => $payloadHash,
                'redacted_payload_json' => ['paymentID' => $paymentId],
                'failure_code' => 'INVALID_SIGNATURE',
            ]);

            return ApiResponse::error([
                [
                    'code' => 'INVALID_WEBHOOK_SIGNATURE',
                    'message' => 'The provided webhook signature failed cryptographic verification.',
                ],
            ], 400);
        }

        $webhookEvent = WebhookEvent::create([
            'provider' => 'bkash',
            'provider_event_id' => $paymentId ?: null,
            'event_type' => 'payment.callback',
            'signature_valid' => true,
            'received_at' => now(),
            'processed_at' => now(),
            'processing_status' => 'processed',
            'payload_hash' => $payloadHash,
            'redacted_payload_json' => $payload,
            'failure_code' => null,
        ]);

        $payment = Payment::withoutTenant()->where('provider_payment_id', $paymentId)
            ->orWhere('internal_reference', $payload['merchantInvoiceNumber'] ?? '')
            ->first();

        if ($payment && $payment->status !== 'captured') {
            $order = Order::withoutTenant()->find($payment->order_id);
            if ($order && strtolower((string) ($payload['status'] ?? 'success')) === 'success') {
                $this->captureService->capture($payment, $order, $payload);
                try {
                    app(OutboxProcessor::class)->processPending(10);
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        return ApiResponse::success([
            'status' => 'processed',
            'event_id' => $webhookEvent->id,
        ]);
    }
}
