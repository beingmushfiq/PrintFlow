<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Domain\Agent\AgentPairingService;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\PrintAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AgentPairingController extends Controller
{
    use ResolvesOwnerShop;

    public function generatePairingCode(Request $request, AgentPairingService $pairingService): JsonResponse
    {
        $shop = $this->resolveShop($request);

        if (! $shop) {
            return ApiResponse::error(
                'No associated shop found for the authenticated owner',
                Response::HTTP_NOT_FOUND,
                [],
                'SHOP_NOT_FOUND'
            );
        }

        $codeData = $pairingService->generatePairingCode($shop, $request->input('device_name'));
        if (! isset($codeData['expires_in_seconds'])) {
            $codeData['expires_in_seconds'] = 600;
        }

        return ApiResponse::success($codeData, [], Response::HTTP_CREATED);
    }

    public function revokePairingCode(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found', 404, [], 'SHOP_NOT_FOUND');
        }

        PrintAgent::withoutTenant()
            ->where('shop_id', $shop->id)
            ->whereNotNull('pairing_code')
            ->where('status', 'offline')
            ->delete();

        return ApiResponse::success([
            'message' => 'Pairing code revoked',
        ]);
    }
}
