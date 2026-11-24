<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Agent;

use App\Domain\Agent\AgentPairingService;
use App\Events\AgentPaired;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\PrintAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentEnrollmentController extends Controller
{
    public function enroll(Request $request, AgentPairingService $pairingService): JsonResponse
    {
        $validated = $request->validate([
            'pairing_code' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
            'machine_guid' => ['nullable', 'string', 'max:255'],
            'public_key_hash' => ['required', 'string', 'max:255'],
            'metadata' => ['nullable', 'array'],
        ]);

        $deviceMetadata = array_merge($validated['metadata'] ?? [], [
            'device_name' => $validated['device_name'] ?? $request->input('hostname'),
            'machine_guid' => $validated['machine_guid'] ?? $request->input('machine_id'),
        ]);

        $result = $pairingService->enroll(
            $validated['pairing_code'],
            $deviceMetadata,
            $validated['public_key_hash']
        );

        $agent = PrintAgent::withoutTenant()->with('shop')->find($result['agent_id']);
        if ($agent && $agent->shop) {
            event(new AgentPaired($agent->shop->slug, $agent->id, $agent->device_name));
        }

        return ApiResponse::success($result, [], 200);
    }
}
