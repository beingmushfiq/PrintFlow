<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FileDeletionEvent extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'order_id',
        'order_file_id',
        'reason',
        'trigger_reason',
        'source',
        'deletion_status',
        'deleted_at',
        'local_shredded_at',
        'remote_purged_at',
        'audit_hash',
        'details',
    ];

    protected $casts = [
        'deleted_at' => 'datetime',
        'local_shredded_at' => 'datetime',
        'remote_purged_at' => 'datetime',
        'details' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function orderFile(): BelongsTo
    {
        return $this->belongsTo(OrderFile::class);
    }
}
