<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Payment\Factories\PaymentGatewayFactory;
use App\Domain\Payment\Outbox\OutboxProcessor;
use App\Domain\Payment\Outbox\PaymentCaptureService;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GatewayAccount;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class PaymentCheckoutController extends Controller
{
    public function __construct(
        private readonly PaymentCaptureService $captureService,
    ) {}

    private function resolveOrder(string $token): ?Order
    {
        $hash = hash('sha256', $token);

        return Order::withoutTenant()
            ->where('public_token_hash', $hash)
            ->orWhere('public_token_hash', $token)
            ->orWhere('public_reference', $token)
            ->first();
    }

    /**
     * Initiate hosted payment checkout with double-submit guard and idempotency token.
     */
    public function initiateCheckout(Request $request, string $slug, string $token): JsonResponse
    {
        $order = $this->resolveOrder($token);

        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'The requested order was not found.',
                ],
            ], 404);
        }

        $validated = $request->validate([
            'gateway' => 'required|string|in:sslcommerz,bkash,sandbox',
            'idempotency_token' => 'nullable|string|max:64',
            'outcome' => 'nullable|string|in:success,failed,timeout',
        ]);

        $gateway = strtolower($validated['gateway']);
        $idempotencyToken = $validated['idempotency_token'] ?? null;
        $outcome = $validated['outcome'] ?? 'success';

        // Duplicate submission window cache check (2000ms+ guard)
        if ($idempotencyToken) {
            $cachedSession = Cache::get("checkout_idem_{$idempotencyToken}");
            if ($cachedSession) {
                return ApiResponse::success($cachedSession);
            }
        }

        // Verify quote exists and is not expired
        $latestQuote = $order->quotes()->orderBy('quote_version', 'desc')->first();

        if (! $latestQuote) {
            return ApiResponse::error([
                [
                    'code' => 'NO_QUOTE_FOUND',
                    'message' => 'Please generate a price quote before proceeding to checkout.',
                ],
            ], 422);
        }

        if ($latestQuote->isExpired()) {
            return ApiResponse::error([
                [
                    'code' => 'QUOTE_EXPIRED',
                    'message' => 'The quote has expired. Please recalculate your quote.',
                ],
            ], 422);
        }

        // Resolve gateway account
        $account = GatewayAccount::withoutTenant()
            ->where('tenant_id', $order->tenant_id)
            ->where('provider', $gateway)
            ->where('status', 'active')
            ->first();

        $driver = PaymentGatewayFactory::make($gateway, $account);

        $internalReference = 'PF_TX_' . date('Ymd') . '_' . strtoupper(Str::random(8));

        // Create initial Payment attempt
        $payment = Payment::withoutTenant()->create([
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'gateway_account_id' => $account?->id,
            'purpose' => 'print_order',
            'provider' => $gateway,
            'internal_reference' => $internalReference,
            'currency' => $latestQuote->currency,
            'amount_minor' => $latestQuote->total_minor,
            'status' => 'created',
        ]);

        $session = $driver->initiateCheckout([
            'tran_id' => $internalReference,
            'internal_reference' => $internalReference,
            'amount_minor' => $latestQuote->total_minor,
            'currency' => $latestQuote->currency,
            'order_token' => $token,
            'outcome' => $outcome,
            'merchant_invoice_number' => $order->public_reference,
            'customer_phone' => $order->customer_phone,
        ]);

        $responseData = [
            'gateway' => $gateway,
            'internal_reference' => $internalReference,
            'session_token' => $session['sessionToken'] ?? $session['sessionkey'] ?? $session['paymentID'] ?? null,
            'redirect_url' => $session['redirectUrl'] ?? $session['GatewayPageURL'] ?? $session['bkashURL'] ?? null,
            'amount_minor' => $latestQuote->total_minor,
            'currency' => $latestQuote->currency,
            'idempotency_token' => $idempotencyToken,
            'status' => $session['status'] ?? 'pending',
            'details' => $session,
        ];

        if ($idempotencyToken) {
            Cache::put("checkout_idem_{$idempotencyToken}", $responseData, 120);
        }

        return ApiResponse::success($responseData);
    }

    /**
     * Simulate sandbox payment directly (instant outcome testing).
     */
    public function simulateSandbox(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_token' => 'required|string',
            'outcome' => 'nullable|string|in:success,failed,timeout',
            'amount_minor' => 'nullable|integer',
        ]);

        $orderToken = $validated['order_token'];
        $outcome = $validated['outcome'] ?? 'success';

        $order = $this->resolveOrder($orderToken);

        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'The requested order was not found.',
                ],
            ], 404);
        }

        $latestQuote = $order->quotes()->orderBy('quote_version', 'desc')->first();
        $amountMinor = (int) ($validated['amount_minor'] ?? $latestQuote?->total_minor ?? $order->total_minor ?? 1000);

        $driver = PaymentGatewayFactory::make('sandbox');
        $result = $driver->initiateCheckout([
            'order_token' => $orderToken,
            'amount_minor' => $amountMinor,
            'outcome' => $outcome,
        ]);

        $tranId = $result['transactionId'] ?? 'SNDBX_' . time();
        $reference = 'PF_TX_' . date('Ymd') . '_' . strtoupper(Str::random(8));

        $payment = Payment::withoutTenant()->create([
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'purpose' => 'print_order',
            'provider' => 'sandbox',
            'provider_transaction_id' => $tranId,
            'internal_reference' => $reference,
            'currency' => 'BDT',
            'amount_minor' => $amountMinor,
            'status' => $outcome === 'success' ? 'created' : ($outcome === 'timeout' ? 'pending' : 'failed'),
            'failed_at' => $outcome === 'failed' ? now() : null,
        ]);

        if ($outcome === 'success') {
            $this->captureService->capture($payment, $order, [
                'transaction_id' => $tranId,
                'gateway' => 'sandbox',
                'amount_minor' => $amountMinor,
            ]);

            try {
                app(OutboxProcessor::class)->processPending(10);
            } catch (\Throwable $e) {
                report($e);
            }

            return ApiResponse::success([
                'status' => 'PAID',
                'gateway' => 'sandbox',
                'transaction_id' => $tranId,
                'amount_minor' => $amountMinor,
                'idempotency_key' => $result['idempotencyKey'] ?? hash('sha256', "{$orderToken}:{$amountMinor}"),
            ]);
        }

        if ($outcome === 'timeout') {
            return ApiResponse::success([
                'status' => 'PENDING_TIMEOUT',
                'gateway' => 'sandbox',
                'transaction_id' => $tranId,
                'error' => $result['error'] ?? 'Payment gateway timeout waiting for customer authorization',
            ]);
        }

        return ApiResponse::success([
            'status' => 'PAYMENT_FAILED',
            'gateway' => 'sandbox',
            'transaction_id' => $tranId,
            'error' => $result['error'] ?? 'Card declined or insufficient balance in sandbox wallet',
        ]);
    }
}
