<?php

declare(strict_types=1);

namespace App\Domain\Tenancy;

enum Edition: string
{
    case STANDALONE = 'standalone';
    case SAAS = 'saas';
}
