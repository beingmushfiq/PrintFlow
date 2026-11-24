<?php

declare(strict_types=1);

namespace App\Domain\Shared;

final class QueuePriority
{
    public const PAYMENTS = 'payments';

    public const DOCUMENTS = 'documents';

    public const PRINTING = 'printing';

    public const NOTIFICATIONS = 'notifications';

    public const MAINTENANCE = 'maintenance';

    /**
     * Strict prioritization order for queue workers.
     * Workers processing queues in this sequence prioritize financial settlement
     * and document intake ahead of background notifications and maintenance.
     */
    public const ORDER = [
        self::PAYMENTS,
        self::DOCUMENTS,
        self::PRINTING,
        self::NOTIFICATIONS,
        self::MAINTENANCE,
    ];

    /**
     * Return comma-separated list of queues in strict priority order for artisan queue:work.
     */
    public static function asString(): string
    {
        return implode(',', self::ORDER);
    }
}
