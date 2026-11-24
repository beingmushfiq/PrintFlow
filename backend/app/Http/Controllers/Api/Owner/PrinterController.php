<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Printer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrinterController extends Controller
{
    use ResolvesOwnerShop;

    public function index(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $printers = Printer::withoutTenant()
            ->where('shop_id', $shop->id)
            ->get();

        $data = $printers->map(function (Printer $p) {
            $caps = is_array($p->capabilities) ? $p->capabilities : [];

            return [
                'id' => $p->id,
                'name' => $p->name,
                'system_name' => $p->system_name,
                'driver_name' => $p->driver_name,
                'connection_type' => $p->connection_type,
                'status' => $p->status,
                'is_default' => (bool) $p->is_default,
                'is_online' => (bool) $p->is_online,
                'is_active' => $p->status !== 'disabled',
                'capabilities' => [
                    'color' => (bool) ($caps['color'] ?? false),
                    'duplex' => (bool) ($caps['duplex'] ?? false),
                    'paper_sizes' => $caps['paper_sizes'] ?? $caps['supported_paper_sizes'] ?? ['A4'],
                    'trays' => $caps['trays'] ?? ['tray_1' => 'A4', 'tray_2' => 'Legal'],
                ],
                'created_at' => $p->created_at?->toISOString(),
                'updated_at' => $p->updated_at?->toISOString(),
            ];
        });

        return ApiResponse::success($data->values()->all(), [
            'total' => $data->count(),
        ]);
    }

    public function update(Request $request, ?string $id = null): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $printerId = $id ?? $request->input('id');
        $printer = Printer::withoutTenant()->where('shop_id', $shop->id)->where('id', $printerId)->first();
        if (! $printer) {
            return ApiResponse::error('Printer not found.', 404, [], 'PRINTER_NOT_FOUND');
        }

        $isDefault = $request->input('is_default');
        if ($isDefault === true || $isDefault === 1 || $isDefault === 'true') {
            Printer::withoutTenant()
                ->where('shop_id', $shop->id)
                ->where('id', '!=', $printer->id)
                ->update(['is_default' => false]);
            $printer->is_default = true;
        }

        if ($request->has('name')) {
            $printer->name = (string) $request->input('name');
        }

        if ($request->has('capabilities')) {
            $merged = array_merge(
                is_array($printer->capabilities) ? $printer->capabilities : [],
                (array) $request->input('capabilities')
            );
            $printer->capabilities = $merged;
        }

        $printer->save();

        return ApiResponse::success([
            'id' => $printer->id,
            'name' => $printer->name,
            'is_default' => (bool) $printer->is_default,
            'status' => $printer->status,
            'capabilities' => $printer->capabilities,
        ]);
    }

    public function status(Request $request, string $id): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $printer = Printer::withoutTenant()->where('shop_id', $shop->id)->where('id', $id)->first();
        if (! $printer) {
            return ApiResponse::error('Printer not found.', 404, [], 'PRINTER_NOT_FOUND');
        }

        $isActive = filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($isActive === null) {
            $isActive = ! in_array($printer->status, ['disabled', 'offline'], true);
        }

        if ($printer->is_default && ! $isActive) {
            return ApiResponse::error(
                'Cannot disable the default printer without selecting a replacement',
                422,
                ['allowed' => false, 'warning' => 'Cannot disable the default printer without selecting a replacement'],
                'CANNOT_DISABLE_DEFAULT_PRINTER'
            );
        }

        $newStatus = $isActive ? 'ready' : 'disabled';
        $printer->update([
            'status' => $newStatus,
            'is_online' => $isActive,
        ]);

        return ApiResponse::success([
            'id' => $printer->id,
            'is_active' => $isActive,
            'status' => $newStatus,
        ]);
    }
}
