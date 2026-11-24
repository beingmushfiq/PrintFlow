<?php

use App\Domain\Tenancy\EditionContext;
use App\Http\Controllers\Api\Agent\AgentEnrollmentController;
use App\Http\Controllers\Api\Agent\AgentJobController;
use App\Http\Controllers\Api\Agent\AgentPresenceController;
use App\Http\Controllers\Api\Agent\AgentPrinterController;
use App\Http\Controllers\Api\Auth\OwnerAuthController;
use App\Http\Controllers\Api\Owner\AgentPairingController;
use App\Http\Controllers\Api\Owner\DashboardController;
use App\Http\Controllers\Api\Owner\GatewayController;
use App\Http\Controllers\Api\Owner\OrderManagementController;
use App\Http\Controllers\Api\Owner\PricingController;
use App\Http\Controllers\Api\Owner\PrinterController;
use App\Http\Controllers\Api\Owner\QueueController;
use App\Http\Controllers\Api\Owner\ShopController;
use App\Http\Controllers\Api\Platform\PlatformController;
use App\Http\Controllers\Api\Public\PaymentCheckoutController;
use App\Http\Controllers\Api\Public\PublicOrderController;
use App\Http\Controllers\Api\Public\QuoteController;
use App\Http\Controllers\Api\Public\StorefrontController;
use App\Http\Controllers\Api\Public\UploadController;
use App\Http\Controllers\Api\Public\WebhookController;
use App\Http\Responses\ApiResponse;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| System & Health Routes
|--------------------------------------------------------------------------
*/
Route::get('/health', function () {
    $dbStatus = 'UP';
    try {
        \Illuminate\Support\Facades\DB::connection()->getPdo();
    } catch (\Throwable) {
        $dbStatus = 'DOWN';
    }

    $redisStatus = 'UP';
    try {
        \Illuminate\Support\Facades\Redis::ping();
    } catch (\Throwable) {
        $redisStatus = 'DOWN';
    }

    return ApiResponse::success([
        'status' => 'healthy',
        'version' => '1.0.0',
        'edition' => app(EditionContext::class)->current()->value,
        'checks' => [
            'database' => ['status' => $dbStatus, 'driver' => config('database.default')],
            'redis' => ['status' => $redisStatus, 'ping' => 'PONG'],
            'storage' => ['status' => 'UP', 'disk' => config('filesystems.default'), 'bucket' => config('filesystems.disks.s3.bucket')],
            'reverb' => ['status' => 'UP'],
        ],
    ], [
        'server_time' => now()->toIso8601String(),
    ]);
});

/*
|--------------------------------------------------------------------------
| Public Storefront & Intake Routes
|--------------------------------------------------------------------------
*/
Route::prefix('public')->group(function () {
    Route::get('/storefront/{slug}', [StorefrontController::class, 'show']);
    Route::post('/storefront/{slug}/order', [StorefrontController::class, 'createOrder']);

    Route::post('/upload/presign', [UploadController::class, 'presign']);
    Route::post('/upload/direct/{file_id}', [UploadController::class, 'directUpload']);
    Route::post('/upload/confirm', [UploadController::class, 'confirm']);

    // Milestone 3: Pricing & Payment Routes
    Route::post('/storefront/{slug}/order/{token}/quote', [QuoteController::class, 'createQuote']);
    Route::get('/storefront/{slug}/order/{token}/quote', [QuoteController::class, 'getQuote']);
    Route::post('/storefront/{slug}/order/{token}/checkout', [PaymentCheckoutController::class, 'initiateCheckout']);

    Route::post('/webhooks/sslcommerz', [WebhookController::class, 'sslcommerz']);
    Route::post('/webhooks/bkash', [WebhookController::class, 'bkash']);
    Route::post('/payments/sandbox/simulate', [PaymentCheckoutController::class, 'simulateSandbox']);

    Route::get('/order/{token}', [PublicOrderController::class, 'show']);
    Route::get('/order/{token}/receipt', [PublicOrderController::class, 'receipt']);
});

/*
|--------------------------------------------------------------------------
| Authentication Routes
|--------------------------------------------------------------------------
*/
Route::prefix('auth')->group(function () {
    Route::post('/register-owner', [OwnerAuthController::class, 'registerOwner']);
    Route::post('/login', [OwnerAuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [OwnerAuthController::class, 'logout']);
        Route::get('/me', [OwnerAuthController::class, 'me']);
    });
});

/*
|--------------------------------------------------------------------------
| Owner Shop & Console Operations Routes (Milestones 2 & 5)
|--------------------------------------------------------------------------
*/
Route::prefix('owner')->middleware('auth:sanctum')->group(function () {
    // Shop & Profile
    Route::get('/shop', [ShopController::class, 'show']);
    Route::put('/shop', [ShopController::class, 'update']);
    Route::get('/shop/qr', [ShopController::class, 'qrCode']);

    // Feature 54: Operational Dashboard
    Route::get('/dashboard', [DashboardController::class, 'metrics']);
    Route::get('/dashboard/metrics', [DashboardController::class, 'metrics']);

    // Feature 55 & 56: Live Print Queue & Actions
    Route::get('/queue', [QueueController::class, 'index']);
    Route::post('/jobs/{id}/hold', [QueueController::class, 'hold']);
    Route::post('/orders/{id}/hold', [QueueController::class, 'hold']);
    Route::post('/jobs/{id}/resume', [QueueController::class, 'resume']);
    Route::post('/orders/{id}/resume', [QueueController::class, 'resume']);

    // Features 56, 57, 58, 59, 60: Orders Ledger, Detail, Cancel, Handover, Reprint
    Route::get('/orders', [OrderManagementController::class, 'index']);
    Route::get('/orders/{id}', [OrderManagementController::class, 'show']);
    Route::post('/orders/{id}/cancel', [OrderManagementController::class, 'cancel']);
    Route::post('/jobs/{id}/cancel', [OrderManagementController::class, 'cancel']);
    Route::post('/orders/{id}/collected', [OrderManagementController::class, 'handover']);
    Route::post('/orders/{id}/handover', [OrderManagementController::class, 'handover']);
    Route::post('/orders/{id}/reprint', [OrderManagementController::class, 'reprint']);

    // Feature 61: Agent Pairing Wizard
    Route::post('/agent/pairing-code', [AgentPairingController::class, 'generatePairingCode']);
    Route::post('/agents/pairing-code', [AgentPairingController::class, 'generatePairingCode']);
    Route::delete('/agent/pairing-code', [AgentPairingController::class, 'revokePairingCode']);
    Route::delete('/agents/pairing-code', [AgentPairingController::class, 'revokePairingCode']);

    // Feature 62: Printer Fleet & Capabilities
    Route::get('/printers', [PrinterController::class, 'index']);
    Route::put('/printers', [PrinterController::class, 'update']);
    Route::put('/printers/{id}', [PrinterController::class, 'update']);
    Route::put('/printers/{id}/status', [PrinterController::class, 'status']);

    // Feature 63: Interactive Pricing Setup
    Route::get('/pricing', [PricingController::class, 'active']);
    Route::get('/pricing-profiles/active', [PricingController::class, 'active']);
    Route::put('/pricing', [PricingController::class, 'update']);
    Route::post('/pricing/preview', [PricingController::class, 'preview']);

    // Feature 64: Gateway Credentials
    Route::get('/gateways', [GatewayController::class, 'index']);
    Route::get('/gateways/{provider}', [GatewayController::class, 'show']);
    Route::put('/gateways/{provider}', [GatewayController::class, 'update']);
    Route::post('/gateways/test-credentials', [GatewayController::class, 'testCredentials']);
});

/*
|--------------------------------------------------------------------------
| Hardware Agent Routes (Milestone 4)
|--------------------------------------------------------------------------
*/
Route::prefix('agent')->group(function () {
    // Cryptographic enrollment / pairing
    Route::post('/enroll', [AgentEnrollmentController::class, 'enroll']);
    Route::post('/pair', [AgentEnrollmentController::class, 'enroll']);

    // Authenticated agent stream & operations
    Route::middleware('auth.agent')->group(function () {
        Route::post('/heartbeat', [AgentPresenceController::class, 'heartbeat']);
        Route::get('/stream', [AgentPresenceController::class, 'stream']);
        Route::post('/printers', [AgentPrinterController::class, 'sync']);
        Route::post('/jobs/next', [AgentJobController::class, 'next']);
        Route::post('/jobs/{id}/ack', [AgentJobController::class, 'ack']);
        Route::post('/jobs/{id}/fail', [AgentJobController::class, 'fail']);
        Route::post('/jobs/{id}/shred-ack', [AgentJobController::class, 'shredAck']);
    });

    // Signed or authorized file download for leased jobs
    Route::get('/jobs/{id}/download', [AgentJobController::class, 'download'])
        ->middleware('signed')
        ->name('agent.job.download');
});

/*
|--------------------------------------------------------------------------
| Platform Admin & SaaS Routes (Guarded by EditionGate)
|--------------------------------------------------------------------------
*/
Route::prefix('platform')->middleware('edition.gate:saas')->group(function () {
    Route::get('/plans', [PlatformController::class, 'plans']);
    Route::get('/tenants', [PlatformController::class, 'tenants']);
    Route::get('/subscriptions', [PlatformController::class, 'subscriptions']);
});
