<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OwnerAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_registration_provisions_tenant_shop_user_and_token(): void
    {
        $payload = [
            'name' => 'Rashidul Islam',
            'email' => 'rashid@example.com',
            'phone' => '01712345678',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'shop_name' => 'Dhaka Digital Prints',
            'shop_slug' => 'dhaka-digital',
        ];

        $response = $this->postJson('/api/v1/auth/register-owner', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.user.name', 'Rashidul Islam')
            ->assertJsonPath('data.user.email', 'rashid@example.com')
            ->assertJsonPath('data.user.phone', '01712345678')
            ->assertJsonPath('data.shop.name', 'Dhaka Digital Prints')
            ->assertJsonPath('data.shop.slug', 'dhaka-digital')
            ->assertJsonPath('data.tenant.edition', 'standalone')
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'user' => ['id', 'name', 'email', 'phone'],
                    'shop' => ['id', 'name', 'slug'],
                    'tenant' => ['id', 'name', 'slug', 'edition'],
                ],
                'meta' => ['correlation_id', 'timestamp'],
            ]);

        $this->assertDatabaseHas('users', ['email' => 'rashid@example.com', 'phone' => '01712345678']);
        $this->assertDatabaseHas('shops', ['slug' => 'dhaka-digital']);
        $this->assertDatabaseHas('tenants', ['edition' => 'standalone']);
    }

    public function test_owner_registration_enforces_mandatory_bd_phone(): void
    {
        $payload = [
            'name' => 'Rashidul Islam',
            'email' => 'rashid2@example.com',
            'phone' => '12345678', // Invalid phone
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'shop_name' => 'Dhaka Prints',
        ];

        $response = $this->postJson('/api/v1/auth/register-owner', $payload);

        $response->assertStatus(422)
            ->assertJsonPath('errors.0.code', 'VALIDATION_ERROR')
            ->assertJsonPath('errors.0.field', 'phone');
    }

    public function test_owner_login_success_and_failure(): void
    {
        $registerPayload = [
            'name' => 'Owner Person',
            'email' => 'owner@example.com',
            'phone' => '01812345678',
            'password' => 'Secret123456',
            'password_confirmation' => 'Secret123456',
            'shop_name' => 'Owner Shop',
        ];
        $this->postJson('/api/v1/auth/register-owner', $registerPayload);

        // Success login
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@example.com',
            'password' => 'Secret123456',
        ]);
        $loginResponse->assertStatus(200)
            ->assertJsonStructure(['data' => ['token', 'user', 'shop', 'tenant']]);

        // Invalid credentials
        $failResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@example.com',
            'password' => 'WrongPassword',
        ]);
        $failResponse->assertStatus(401)
            ->assertJsonPath('errors.0.code', 'INVALID_CREDENTIALS');
    }

    public function test_owner_me_and_logout_endpoints(): void
    {
        $registerPayload = [
            'name' => 'Me Owner',
            'email' => 'me@example.com',
            'phone' => '01912345678',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
            'shop_name' => 'Me Prints',
        ];
        $reg = $this->postJson('/api/v1/auth/register-owner', $registerPayload);
        $token = $reg->json('data.token');

        // Test GET /auth/me
        $meResponse = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/me');
        $meResponse->assertStatus(200)
            ->assertJsonPath('data.user.email', 'me@example.com')
            ->assertJsonPath('data.shop.name', 'Me Prints');

        // Test POST /auth/logout
        $logoutResponse = $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/v1/auth/logout');
        $logoutResponse->assertStatus(200)
            ->assertJsonPath('data.message', 'Logged out successfully.');

        // Verify token is revoked in database
        $this->assertDatabaseCount('personal_access_tokens', 0);

        // Reset auth guard cache and verify 401
        $this->app['auth']->forgetGuards();
        $meAgain = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/me');
        $meAgain->assertStatus(401);
    }
}
