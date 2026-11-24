<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderFile extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'order_id',
        'original_name',
        'object_key',
        'storage_disk',
        'mime_type_detected',
        'file_extension_detected',
        'size_bytes',
        'sha256_hash',
        'scan_status',
        'processing_status',
        'page_count',
        'width_px',
        'height_px',
        'orientation',
        'preview_object_key',
        'expires_at',
        'deleted_at',
        'deletion_status',
        'deletion_error_code',
        'processing_json',
    ];

    protected $casts = [
        'processing_json' => 'array',
        'size_bytes' => 'integer',
        'page_count' => 'integer',
        'width_px' => 'integer',
        'height_px' => 'integer',
        'expires_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function printJobs(): HasMany
    {
        return $this->hasMany(PrintJob::class);
    }

    public function deletionEvents(): HasMany
    {
        return $this->hasMany(FileDeletionEvent::class);
    }
}
