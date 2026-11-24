<?php

declare(strict_types=1);

namespace App\Domain\Shared;

enum RoundingMode: string
{
    case HALF_UP = 'half_up';
    case HALF_DOWN = 'half_down';
    case HALF_EVEN = 'half_even';
    case UP = 'up';
    case DOWN = 'down';
}
