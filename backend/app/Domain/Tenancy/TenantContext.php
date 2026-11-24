<?php

declare(strict_types=1);

namespace App\Domain\Tenancy;

final class TenantContext
{
    public function __construct(
        private readonly string $id,
        private readonly string $slug,
        private readonly Edition $edition
    ) {}

    /**
     * Create a TenantContext from a Tenant model or tenant-like object.
     */
    public static function fromTenant(object $tenant): self
    {
        $edition = $tenant->edition instanceof Edition
            ? $tenant->edition
            : (Edition::tryFrom((string) ($tenant->edition ?? 'standalone')) ?? Edition::STANDALONE);

        return new self(
            id: (string) ($tenant->id ?? $tenant->ulid ?? ''),
            slug: (string) ($tenant->slug ?? ''),
            edition: $edition
        );
    }

    public function id(): string
    {
        return $this->id;
    }

    public function slug(): string
    {
        return $this->slug;
    }

    public function edition(): Edition
    {
        return $this->edition;
    }
}
