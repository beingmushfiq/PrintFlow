<?php

declare(strict_types=1);

namespace App\Domain\Agent;

use App\Models\PrintAgent;
use App\Models\Printer;
use Illuminate\Support\Collection;

class PrinterSyncService
{
    /**
     * Sync discovered printers reported by an agent.
     */
    public function syncPrinters(PrintAgent $agent, array $printersList): Collection
    {
        $synced = collect();

        foreach ($printersList as $printerData) {
            $name = trim($printerData['name'] ?? '');
            if ($name === '') {
                continue;
            }

            $printer = Printer::updateOrCreate(
                [
                    'tenant_id' => $agent->tenant_id,
                    'shop_id' => $agent->shop_id,
                    'print_agent_id' => $agent->id,
                    'name' => $name,
                ],
                [
                    'system_name' => $printerData['system_name'] ?? $name,
                    'driver_name' => $printerData['driver_name'] ?? 'Generic / Text Only',
                    'connection_type' => $printerData['connection_type'] ?? 'usb',
                    'capabilities' => $printerData['capabilities'] ?? [
                        'color' => false,
                        'duplex' => true,
                        'supported_paper_sizes' => ['A4'],
                        'trays' => ['Tray 1'],
                    ],
                    'status' => $printerData['status'] ?? 'ready',
                    'is_default' => (bool) ($printerData['is_default'] ?? false),
                    'is_online' => (bool) ($printerData['is_online'] ?? true),
                ]
            );

            $synced->push($printer);
        }

        return $synced;
    }
}
