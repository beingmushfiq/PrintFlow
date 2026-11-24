<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Agent;

use App\Domain\Agent\AgentPresenceService;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\PrintAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AgentPresenceController extends Controller
{
    public function heartbeat(Request $request, AgentPresenceService $presenceService): JsonResponse
    {
        /** @var PrintAgent $agent */
        $agent = $request->attributes->get('agent') ?? app(PrintAgent::class);

        $presenceService->recordHeartbeat($agent, $request->input('metrics'));

        return ApiResponse::success([
            'status' => 'active',
            'agent_id' => $agent->id,
            'last_seen_at' => $agent->last_seen_at?->toIso8601String(),
        ]);
    }

    /**
     * Outbound presence stream for persistent agent monitoring.
     */
    public function stream(Request $request, AgentPresenceService $presenceService): StreamedResponse
    {
        /** @var PrintAgent $agent */
        $agent = $request->attributes->get('agent') ?? app(PrintAgent::class);
        $presenceService->recordHeartbeat($agent);

        return response()->stream(function () use ($agent) {
            echo "event: connected\n";
            echo 'data: ' . json_encode(['agent_id' => $agent->id, 'status' => 'online', 'heartbeat_interval_seconds' => 30]) . "\n\n";
            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
