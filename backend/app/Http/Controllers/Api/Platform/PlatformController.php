<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Platform;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformController extends Controller
{
    /**
     * List all subscription plans.
     */
    public function plans(Request $request): JsonResponse
    {
        $plans = Plan::where('is_active', true)->get();

        return ApiResponse::success($plans);
    }

    /**
     * List all tenants on platform.
     */
    public function tenants(Request $request): JsonResponse
    {
        $tenants = Tenant::paginate($request->integer('per_page', 25));

        return ApiResponse::paginated($tenants);
    }

    /**
     * List subscriptions across platform.
     */
    public function subscriptions(Request $request): JsonResponse
    {
        $subscriptions = Subscription::with('plan')->paginate($request->integer('per_page', 25));

        return ApiResponse::paginated($subscriptions);
    }
}
