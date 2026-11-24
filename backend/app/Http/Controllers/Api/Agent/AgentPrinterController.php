<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Agent;

use App\Domain\Agent\PrinterSyncService;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\PrintAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentPrinterController extends Controller
{
    public function sync(Request $request, PrinterSyncService $syncService): JsonResponse
    {
        /** @var PrintAgent $agent */
        $agent = $request->attributes->get('agent') ?? app(PrintAgent::class);

        $validated = $request->validate([
            'printers' => ['required', 'array'],
            'printers.*.name' => ['required', 'string', 'max:255'],
            'printers.*.system_name' => ['nullable', 'string', 'max:255'],
            'printers.*.driver_name' => ['nullable', 'string', 'max:255'],
            'printers.*.connection_type' => ['nullable', 'string', 'in:usb,network,virtual,shared,unknown'],
            'printers.*.capabilities' => ['nullable', 'array'],
            'printers.*.status' => ['nullable', 'string', 'in:ready,online,offline,error,disabled'],
            'printers.*.is_default' => ['nullable', 'boolean'],
            'printers.*.is_online' => ['nullable', 'boolean'],
        ]);

        $synced = $syncService->syncPrinters($agent, $validated['printers']);

        return ApiResponse::success([
            'count' => $synced->count(),
            'printers' => $synced,
        ]);
    }
}
