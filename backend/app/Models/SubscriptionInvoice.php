<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubscriptionInvoice extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'subscription_id',
        'invoice_number',
        'currency',
        'subtotal_minor',
        'tax_minor',
        'total_minor',
        'status',
        'due_at',
        'paid_at',
        'period_start',
        'period_end',
    ];

    protected $casts = [
        'subtotal_minor' => 'integer',
        'tax_minor' => 'integer',
        'total_minor' => 'integer',
        'due_at' => 'datetime',
        'paid_at' => 'datetime',
        'period_start' => 'datetime',
        'period_end' => 'datetime',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
