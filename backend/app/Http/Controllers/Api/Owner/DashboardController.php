<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Domain\Shared\Money;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\PrintAgent;
use App\Models\PrintJob;
use DateTime;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    use ResolvesOwnerShop;

    public function metrics(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! $user->hasPermissionTo('orders.view')) {
            return ApiResponse::error('Forbidden. orders.view permission required.', 403, [], 'FORBIDDEN');
        }

        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $dhakaTz = new DateTimeZone('Asia/Dhaka');
        $todayStart = (new DateTime('today', $dhakaTz))->setTimezone(new DateTimeZone('UTC'));
        $todayEnd = (new DateTime('tomorrow', $dhakaTz))->setTimezone(new DateTimeZone('UTC'));

        $todayOrdersQuery = Order::withoutTenant()
            ->where('shop_id', $shop->id)
            ->whereBetween('created_at', [$todayStart, $todayEnd]);

        $todayOrdersCount = (int) $todayOrdersQuery->count();

        $todayRevenuePoisha = (int) Order::withoutTenant()
            ->where('shop_id', $shop->id)
            ->whereIn('status', ['paid', 'completed', 'collected', 'PRINTED', 'COLLECTED', 'PAID'])
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->sum('total_minor');

        $activeErrorsCount = (int) PrintJob::withoutTenant()
            ->where('shop_id', $shop->id)
            ->whereIn('status', ['failed', 'unknown'])
            ->count();

        $connectedAgentsCount = (int) PrintAgent::withoutTenant()
            ->where('shop_id', $shop->id)
            ->where(function ($q) {
                $q->where('status', 'online')
                  ->orWhere('last_seen_at', '>=', now()->subMinutes(2));
            })
            ->count();

        $queueDepth = (int) PrintJob::withoutTenant()
            ->where('shop_id', $shop->id)
            ->whereIn('status', ['queued', 'leased', 'printing'])
            ->count();

        return ApiResponse::success([
            'today_orders_count' => $todayOrdersCount,
            'today_revenue_poisha' => $todayRevenuePoisha,
            'today_revenue_formatted' => Money::fromPoisha($todayRevenuePoisha)->format('en'),
            'active_errors_count' => $activeErrorsCount,
            'connected_agents_count' => $connectedAgentsCount,
            'queue_depth' => $queueDepth,
        ], [
            'timezone' => 'Asia/Dhaka',
        ]);
    }
}
