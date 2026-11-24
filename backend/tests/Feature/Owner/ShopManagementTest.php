<?php

declare(strict_types=1);

namespace Tests\Feature\Owner;

use App\Models\Shop;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShopManagementTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $registerPayload = [
            'name' => 'Shop Owner',
            'email' => 'shopowner@example.com',
            'phone' => '01799887766',
            'password' => 'OwnerPass123!',
            'password_confirmation' => 'OwnerPass123!',
            'shop_name' => 'Fast Print Dhanmondi',
            'shop_slug' => 'fast-print-dhanmondi',
        ];
        $response = $this->postJson('/api/v1/auth/register-owner', $registerPayload);
        $this->token = $response->json('data.token');
    }

    public function test_can_get_and_update_shop_profile(): void
    {
        // 1. Get shop
        $getResponse = $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->getJson('/api/v1/owner/shop');

        $getResponse->assertStatus(200)
            ->assertJsonPath('data.shop.name', 'Fast Print Dhanmondi')
            ->assertJsonPath('data.shop.slug', 'fast-print-dhanmondi')
            ->assertJsonPath('data.shop.public_status', 'active');

        // 2. Update shop
        $updatePayload = [
            'name' => 'Fast Print Dhanmondi (Updated)',
            'address' => 'Road 27, Dhanmondi, Dhaka',
            'phone' => '01811223344',
            'public_status' => 'paused',
        ];

        $updateResponse = $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->putJson('/api/v1/owner/shop', $updatePayload);

        $updateResponse->assertStatus(200)
            ->assertJsonPath('data.shop.name', 'Fast Print Dhanmondi (Updated)')
            ->assertJsonPath('data.shop.address', 'Road 27, Dhanmondi, Dhaka')
            ->assertJsonPath('data.shop.phone', '01811223344')
            ->assertJsonPath('data.shop.public_status', 'paused');

        $this->assertDatabaseHas('shops', [
            'slug' => 'fast-print-dhanmondi',
            'public_status' => 'paused',
            'phone' => '01811223344',
        ]);
    }

    public function test_can_generate_qr_code_in_png_svg_and_pdf_formats(): void
    {
        // 1. PNG
        $pngResponse = $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->get('/api/v1/owner/shop/qr?format=png');
        $pngResponse->assertStatus(200);
        $this->assertSame('image/png', $pngResponse->headers->get('Content-Type'));
        $this->assertStringStartsWith("\x89PNG\r\n\x1a\n", $pngResponse->getContent());

        // 2. SVG
        $svgResponse = $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->get('/api/v1/owner/shop/qr?format=svg');
        $svgResponse->assertStatus(200);
        $this->assertSame('image/svg+xml', $svgResponse->headers->get('Content-Type'));
        $this->assertStringContainsString('<svg', $svgResponse->getContent());

        // 3. PDF
        $pdfResponse = $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->get('/api/v1/owner/shop/qr?format=pdf&paper=a4');
        $pdfResponse->assertStatus(200);
        $this->assertSame('application/pdf', $pdfResponse->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF-', $pdfResponse->getContent());
    }
}
