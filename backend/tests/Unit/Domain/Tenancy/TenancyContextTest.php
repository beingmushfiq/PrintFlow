<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Tenancy;

use App\Domain\Tenancy\Edition;
use App\Domain\Tenancy\EditionContext;
use App\Domain\Tenancy\TenantContext;
use PHPUnit\Framework\TestCase;

class TenancyContextTest extends TestCase
{
    public function test_edition_context_defaults_to_standalone(): void
    {
        $context = new EditionContext('standalone');

        $this->assertTrue($context->isStandalone());
        $this->assertFalse($context->isSaas());
        $this->assertSame(Edition::STANDALONE, $context->current());
    }

    public function test_edition_context_saas(): void
    {
        $context = new EditionContext('saas');

        $this->assertFalse($context->isStandalone());
        $this->assertTrue($context->isSaas());
        $this->assertSame(Edition::SAAS, $context->current());
    }

    public function test_tenant_context_creation_and_immutability(): void
    {
        $context = new TenantContext(
            id: '01HMEXAMPLE000000000000000',
            slug: 'central-print-dhaka',
            edition: Edition::STANDALONE
        );

        $this->assertSame('01HMEXAMPLE000000000000000', $context->id());
        $this->assertSame('central-print-dhaka', $context->slug());
        $this->assertSame(Edition::STANDALONE, $context->edition());
    }

    public function test_tenant_context_from_tenant_object(): void
    {
        $mockTenant = (object) [
            'id' => '01HMEXAMPLE000000000000000',
            'slug' => 'nilkhet-express',
            'edition' => 'standalone',
        ];

        $context = TenantContext::fromTenant($mockTenant);

        $this->assertSame('01HMEXAMPLE000000000000000', $context->id());
        $this->assertSame('nilkhet-express', $context->slug());
        $this->assertSame(Edition::STANDALONE, $context->edition());
    }
}
