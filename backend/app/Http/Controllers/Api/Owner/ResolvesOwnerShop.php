<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Models\Shop;
use App\Models\ShopUserAssignment;
use App\Models\Tenant;
use App\Models\TenantUser;
use Illuminate\Http\Request;

trait ResolvesOwnerShop
{
    protected function resolveShop(Request $request): ?Shop
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $assignment = ShopUserAssignment::withoutTenant()->where('user_id', $user->id)->first();
        if ($assignment) {
            return Shop::withoutTenant()->find($assignment->shop_id);
        }

        $tenantUser = TenantUser::withoutTenant()->where('user_id', $user->id)->first();
        if ($tenantUser) {
            return Shop::withoutTenant()->where('tenant_id', $tenantUser->tenant_id)->first();
        }

        $standaloneTenant = Tenant::where('edition', 'standalone')->first();
        if ($standaloneTenant) {
            return Shop::withoutTenant()->where('tenant_id', $standaloneTenant->id)->first();
        }

        return Shop::withoutTenant()->first();
    }
}
