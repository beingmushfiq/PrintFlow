<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'order_id',
        'subscription_invoice_id',
        'gateway_account_id',
        'purpose',
        'provider',
        'provider_order_id',
        'provider_payment_id',
        'provider_transaction_id',
        'internal_reference',
        'currency',
        'amount_minor',
        'fee_minor',
        'net_minor',
        'status',
        'verified_at',
        'captured_at',
        'failed_at',
        'raw_result_redacted_json',
    ];

    protected $casts = [
        'amount_minor' => 'integer',
        'fee_minor' => 'integer',
        'net_minor' => 'integer',
        'verified_at' => 'datetime',
        'captured_at' => 'datetime',
        'failed_at' => 'datetime',
        'raw_result_redacted_json' => 'array',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function gatewayAccount(): BelongsTo
    {
        return $this->belongsTo(GatewayAccount::class);
    }
}
