<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domain\Shared\Rules\BdPhone;
use App\Domain\Tenancy\EditionContext;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Role;
use App\Models\Shop;
use App\Models\ShopUserAssignment;
use App\Models\Tenant;
use App\Models\TenantDomain;
use App\Models\TenantUser;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class OwnerAuthController extends Controller
{
    public function __construct(
        private readonly EditionContext $editionContext
    ) {}

    /**
     * Register a new owner, auto-provisioning tenant and primary shop.
     */
    public function registerOwner(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'phone' => ['required', new BdPhone, 'unique:users,phone'],
            'password' => 'required|string|min:8|confirmed',
            'shop_name' => 'required|string|max:255',
            'shop_slug' => 'nullable|string|max:255|unique:shops,slug',
        ]);

        $normalizedPhone = BdPhone::normalize($request->phone);

        $result = DB::transaction(function () use ($request, $normalizedPhone) {
            // 1. Create global user
            $user = User::create([
                'name' => $request->name,
                'email' => strtolower(trim($request->email)),
                'phone' => $normalizedPhone,
                'password' => Hash::make($request->password),
                'status' => 'active',
                'is_platform_admin' => false,
            ]);

            // 2. Resolve or provision tenant
            if ($this->editionContext->isStandalone()) {
                $tenant = Tenant::where('edition', 'standalone')->first();
                if (! $tenant) {
                    $tenant = Tenant::create([
                        'name' => $request->shop_name,
                        'slug' => Str::slug($request->shop_name).'-'.Str::lower(Str::random(4)),
                        'edition' => 'standalone',
                        'status' => 'active',
                        'default_currency' => 'BDT',
                        'default_locale' => 'bn',
                        'timezone' => 'Asia/Dhaka',
                    ]);
                }
            } else {
                $tenant = Tenant::create([
                    'name' => $request->shop_name,
                    'slug' => Str::slug($request->shop_name).'-'.Str::lower(Str::random(4)),
                    'edition' => 'saas',
                    'status' => 'active',
                    'default_currency' => 'BDT',
                    'default_locale' => 'bn',
                    'timezone' => 'Asia/Dhaka',
                ]);
            }

            // 3. Ensure primary tenant domain exists
            TenantDomain::firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'host' => $request->getHost() ?: 'localhost',
                ],
                [
                    'type' => $tenant->edition === 'standalone' ? 'standalone_host' : 'platform_subdomain',
                    'verification_status' => 'verified',
                    'tls_status' => 'active',
                    'is_primary' => true,
                ]
            );

            // 4. Associate user with tenant
            $tenantUser = TenantUser::firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'user_id' => $user->id,
                ],
                [
                    'status' => 'active',
                    'joined_at' => now(),
                ]
            );

            // 5. Assign owner role
            $ownerRole = Role::withoutTenant()->firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'name' => 'owner',
                    'guard_name' => 'web',
                ]
            );
            $tenantUser->roles()->syncWithoutDetaching([$ownerRole->id]);

            // 6. Create primary shop
            $baseSlug = $request->shop_slug ? Str::slug($request->shop_slug) : Str::slug($request->shop_name);
            $shopSlug = $baseSlug;
            $counter = 1;
            while (Shop::withoutTenant()->where('slug', $shopSlug)->exists()) {
                $shopSlug = $baseSlug.'-'.$counter;
                $counter++;
            }

            $shop = Shop::create([
                'tenant_id' => $tenant->id,
                'name' => $request->shop_name,
                'slug' => $shopSlug,
                'phone' => $normalizedPhone,
                'email' => strtolower(trim($request->email)),
                'locale' => 'bn',
                'currency' => 'BDT',
                'timezone' => 'Asia/Dhaka',
                'public_status' => 'active',
            ]);

            // 7. Assign user to shop as owner
            ShopUserAssignment::firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'shop_id' => $shop->id,
                    'user_id' => $user->id,
                ],
                [
                    'role' => 'owner',
                ]
            );

            $token = $user->createToken('owner-access-token', ['owner'])->plainTextToken;

            return [
                'token' => $token,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                ],
                'shop' => [
                    'id' => $shop->id,
                    'name' => $shop->name,
                    'slug' => $shop->slug,
                    'public_status' => $shop->public_status,
                ],
                'tenant' => [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'slug' => $tenant->slug,
                    'edition' => $tenant->edition,
                ],
            ];
        });

        return ApiResponse::success($result, [], 201);
    }

    /**
     * Authenticate owner credentials and return a personal access token.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', strtolower(trim($request->email)))->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return ApiResponse::error([
                [
                    'code' => 'INVALID_CREDENTIALS',
                    'message' => 'Invalid email or password.',
                ],
            ], 401);
        }

        if ($user->status !== 'active') {
            return ApiResponse::error([
                [
                    'code' => 'ACCOUNT_SUSPENDED',
                    'message' => 'This account has been deactivated.',
                ],
            ], 403);
        }

        $user->update(['last_login_at' => now()]);

        // Resolve user's tenant and shop
        $tenantUser = TenantUser::withoutTenant()->where('user_id', $user->id)->first();
        $tenant = $tenantUser ? Tenant::find($tenantUser->tenant_id) : Tenant::where('edition', 'standalone')->first();

        $assignment = ShopUserAssignment::withoutTenant()->where('user_id', $user->id)->first();
        $shop = $assignment
            ? Shop::withoutTenant()->find($assignment->shop_id)
            : Shop::withoutTenant()->where('tenant_id', $tenant?->id)->first();

        $token = $user->createToken('owner-access-token', ['owner'])->plainTextToken;

        return ApiResponse::success([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
            ],
            'shop' => $shop ? [
                'id' => $shop->id,
                'name' => $shop->name,
                'slug' => $shop->slug,
                'public_status' => $shop->public_status,
            ] : null,
            'tenant' => $tenant ? [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'edition' => $tenant->edition,
            ] : null,
        ]);
    }

    /**
     * Revoke current personal access token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return ApiResponse::success(['message' => 'Logged out successfully.']);
    }

    /**
     * Retrieve authenticated user profile with shop and tenant context.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        $tenantUser = TenantUser::withoutTenant()->where('user_id', $user->id)->first();
        $tenant = $tenantUser ? Tenant::find($tenantUser->tenant_id) : Tenant::where('edition', 'standalone')->first();

        $assignment = ShopUserAssignment::withoutTenant()->where('user_id', $user->id)->first();
        $shop = $assignment
            ? Shop::withoutTenant()->find($assignment->shop_id)
            : Shop::withoutTenant()->where('tenant_id', $tenant?->id)->first();

        return ApiResponse::success([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'is_platform_admin' => $user->is_platform_admin,
                'status' => $user->status,
                'last_login_at' => $user->last_login_at?->toISOString(),
            ],
            'shop' => $shop ? [
                'id' => $shop->id,
                'name' => $shop->name,
                'slug' => $shop->slug,
                'address' => $shop->address,
                'phone' => $shop->phone,
                'email' => $shop->email,
                'locale' => $shop->locale,
                'currency' => $shop->currency,
                'timezone' => $shop->timezone,
                'public_status' => $shop->public_status,
                'public_settings' => $shop->public_settings_json,
            ] : null,
            'tenant' => $tenant ? [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'edition' => $tenant->edition,
            ] : null,
        ]);
    }
}
