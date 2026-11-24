<?php

declare(strict_types=1);

namespace App\Domain\Tenancy;

class EditionContext
{
    private Edition $edition;

    public function __construct(?string $edition = null)
    {
        $editionValue = $edition ?? config('app.edition', env('APP_EDITION', 'standalone'));
        $this->edition = Edition::tryFrom(strtolower((string) $editionValue)) ?? Edition::STANDALONE;
    }

    public function isStandalone(): bool
    {
        return $this->edition === Edition::STANDALONE;
    }

    public function isSaas(): bool
    {
        return $this->edition === Edition::SAAS;
    }

    public function current(): Edition
    {
        return $this->edition;
    }
}
