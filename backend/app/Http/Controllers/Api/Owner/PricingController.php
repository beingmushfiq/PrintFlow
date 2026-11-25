<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Domain\Shared\Money;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\PriceProfile;
use App\Models\PriceRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PricingController extends Controller
{
    use ResolvesOwnerShop;

    public function active(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $profile = PriceProfile::withoutTenant()
            ->where('shop_id', $shop->id)
            ->where('status', 'active')
            ->first();

        if (! $profile) {
            $profile = PriceProfile::withoutTenant()
                ->where('shop_id', $shop->id)
                ->latest()
                ->first();
        }

        $baseSimplexPoisha = 200;
        $duplexModel = 'model_b';
        $duplexDiscountPercent = 20;
        $flatDuplexSheetPoisha = 350;
        $colorSimplexPoisha = 1000;
        $colorDuplexDiscountPercent = 10;
        $colorFlatDuplexSheetPoisha = 1800;
        $minimumFloorPoisha = $profile?->minimum_order_minor ?? 500;
        $vatBasisPoints = $profile?->tax_rate_basis_points ?? 500;

        if ($profile) {
            $rule = PriceRule::withoutTenant()
                ->where('price_profile_id', $profile->id)
                ->where('color_mode', 'mono')
                ->first();

            if ($rule) {
                $baseSimplexPoisha = $rule->unit_price_minor ?: 200;
                $ruleData = is_array($rule->rule_json) ? $rule->rule_json : [];
                $duplexModel = $ruleData['duplex_model'] ?? 'model_b';
                $duplexDiscountPercent = (int) ($ruleData['duplex_discount_percent'] ?? 20);
                $flatDuplexSheetPoisha = (int) ($ruleData['flat_duplex_sheet_rate_minor'] ?? 350);
            }

            $colorRule = PriceRule::withoutTenant()
                ->where('price_profile_id', $profile->id)
                ->where('color_mode', 'color')
                ->first();

            if ($colorRule) {
                $colorSimplexPoisha = $colorRule->unit_price_minor ?: 1000;
                $colorRuleData = is_array($colorRule->rule_json) ? $colorRule->rule_json : [];
                $colorDuplexDiscountPercent = (int) ($colorRuleData['duplex_discount_percent'] ?? 10);
                $colorFlatDuplexSheetPoisha = (int) ($colorRuleData['flat_duplex_sheet_rate_minor'] ?? 1800);
            }
        }

        return ApiResponse::success([
            'base_simplex_poisha' => $baseSimplexPoisha,
            'duplex_model' => $duplexModel,
            'duplex_discount_percent' => $duplexDiscountPercent,
            'flat_duplex_sheet_poisha' => $flatDuplexSheetPoisha,
            'color_simplex_poisha' => $colorSimplexPoisha,
            'color_duplex_discount_percent' => $colorDuplexDiscountPercent,
            'color_flat_duplex_sheet_poisha' => $colorFlatDuplexSheetPoisha,
            'minimum_order_floor_poisha' => $minimumFloorPoisha,
            'vat_basis_points' => $vatBasisPoints,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $baseRate = (int) $request->input('base_simplex_poisha', 200);
        if ($baseRate <= 0) {
            return ApiResponse::error([
                'base_simplex_poisha' => 'Base rate must be positive',
            ], 422, [], 'VALIDATION_ERROR');
        }

        $discountPercent = (int) $request->input('duplex_discount_percent', 20);
        if ($discountPercent < 0 || $discountPercent > 100) {
            return ApiResponse::error([
                'duplex_discount_percent' => 'Discount must be 0-100%',
            ], 422, [], 'VALIDATION_ERROR');
        }

        $duplexModel = (string) $request->input('duplex_model', 'model_b');
        if (! in_array($duplexModel, ['model_a', 'model_b'], true)) {
            $duplexModel = 'model_b';
        }

        $flatSheetRate = (int) $request->input('flat_duplex_sheet_poisha', 350);

        $colorSimplexRate = (int) $request->input('color_simplex_poisha', 1000);
        if ($colorSimplexRate <= 0) {
            return ApiResponse::error([
                'color_simplex_poisha' => 'Color base rate must be positive',
            ], 422, [], 'VALIDATION_ERROR');
        }

        $colorDiscountPercent = (int) $request->input('color_duplex_discount_percent', 10);
        if ($colorDiscountPercent < 0 || $colorDiscountPercent > 100) {
            return ApiResponse::error([
                'color_duplex_discount_percent' => 'Color discount must be 0-100%',
            ], 422, [], 'VALIDATION_ERROR');
        }

        $colorFlatSheetRate = (int) $request->input('color_flat_duplex_sheet_poisha', 1800);
        $minimumFloor = max(0, (int) $request->input('minimum_order_floor_poisha', 500));
        $vatBasisPoints = max(0, (int) $request->input('vat_basis_points', 500));

        $profile = PriceProfile::withoutTenant()->firstOrCreate(
            [
                'tenant_id' => $shop->tenant_id,
                'shop_id' => $shop->id,
                'status' => 'active',
            ],
            [
                'name' => 'Standard Rate Profile',
                'currency' => 'BDT',
                'minimum_order_minor' => $minimumFloor,
                'service_fee_minor' => 0,
                'tax_mode' => 'exclusive',
                'tax_rate_basis_points' => $vatBasisPoints,
                'calculation_version' => 1,
            ]
        );

        $profile->update([
            'minimum_order_minor' => $minimumFloor,
            'tax_rate_basis_points' => $vatBasisPoints,
            'calculation_version' => ($profile->calculation_version ?? 1) + 1,
        ]);

        PriceRule::withoutTenant()->updateOrCreate(
            [
                'tenant_id' => $shop->tenant_id,
                'price_profile_id' => $profile->id,
                'color_mode' => 'mono',
                'media_code' => 'paper_a4',
            ],
            [
                'service_code' => 'page_print',
                'sides_mode' => 'simplex',
                'unit_basis' => 'printed_side',
                'unit_price_minor' => $baseRate,
                'is_active' => true,
                'rule_json' => [
                    'duplex_model' => $duplexModel,
                    'duplex_discount_percent' => $discountPercent,
                    'flat_duplex_sheet_rate_minor' => $flatSheetRate,
                ],
            ]
        );

        PriceRule::withoutTenant()->updateOrCreate(
            [
                'tenant_id' => $shop->tenant_id,
                'price_profile_id' => $profile->id,
                'color_mode' => 'color',
                'media_code' => 'paper_a4',
            ],
            [
                'service_code' => 'page_print',
                'sides_mode' => 'simplex',
                'unit_basis' => 'printed_side',
                'unit_price_minor' => $colorSimplexRate,
                'is_active' => true,
                'rule_json' => [
                    'duplex_model' => $duplexModel,
                    'duplex_discount_percent' => $colorDiscountPercent,
                    'flat_duplex_sheet_rate_minor' => $colorFlatSheetRate,
                ],
            ]
        );

        return ApiResponse::success([
            'base_simplex_poisha' => $baseRate,
            'duplex_model' => $duplexModel,
            'duplex_discount_percent' => $discountPercent,
            'flat_duplex_sheet_poisha' => $flatSheetRate,
            'color_simplex_poisha' => $colorSimplexRate,
            'color_duplex_discount_percent' => $colorDiscountPercent,
            'color_flat_duplex_sheet_poisha' => $colorFlatSheetRate,
            'minimum_order_floor_poisha' => $minimumFloor,
            'vat_basis_points' => $vatBasisPoints,
            'message' => 'Pricing profile updated successfully',
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $colorMode = (string) $request->input('color_mode', 'mono');
        $baseRate = $colorMode === 'color'
            ? (int) $request->input('color_simplex_poisha', 1000)
            : (int) $request->input('base_simplex_poisha', 200);
        $discount = $colorMode === 'color'
            ? (int) $request->input('color_duplex_discount_percent', 10)
            : (int) $request->input('duplex_discount_percent', 20);
        $model = (string) $request->input('duplex_model', 'model_b');
        $flatSheetRate = $colorMode === 'color'
            ? (int) $request->input('color_flat_duplex_sheet_poisha', 1800)
            : (int) $request->input('flat_duplex_sheet_poisha', 350);
        $pages = max(1, (int) $request->input('pages', 5));
        $copies = max(1, (int) $request->input('copies', 1));
        $sidesMode = (string) $request->input('sides_mode', 'duplex');

        if ($sidesMode === 'simplex') {
            $totalSheets = $pages * $copies;
            $totalSides = $pages * $copies;
            $subtotalPoisha = $baseRate * $totalSides;
        } else {
            $frontSides = (int) ceil($pages / 2);
            $backSides = (int) floor($pages / 2);
            $sheetsPerCopy = $frontSides;
            $totalSheets = $sheetsPerCopy * $copies;
            $totalSides = $pages * $copies;

            if ($model === 'model_a') {
                $duplexSheets = (int) floor($pages / 2);
                $oddSheet = $pages % 2 === 1 ? 1 : 0;
                $costPerCopy = ($duplexSheets * $flatSheetRate) + ($oddSheet * $baseRate);
                $subtotalPoisha = $costPerCopy * $copies;
            } else {
                $discountedRate = (int) round($baseRate * (1 - $discount / 100));
                $costPerCopy = ($frontSides * $baseRate) + ($backSides * $discountedRate);
                $subtotalPoisha = $costPerCopy * $copies;
            }
        }

        return ApiResponse::success([
            'sheets' => $totalSheets,
            'sides' => $totalSides,
            'subtotal_poisha' => $subtotalPoisha,
            'subtotal_formatted' => Money::fromPoisha($subtotalPoisha)->format('en'),
        ]);
    }
}
