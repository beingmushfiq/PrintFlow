<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrintJobAttempt extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'print_job_id',
        'print_agent_id',
        'attempt_number',
        'status',
        'started_at',
        'ended_at',
        'completed_at',
        'error_code',
        'error_details',
        'error_message',
        'spooler_job_id',
    ];

    protected $casts = [
        'attempt_number' => 'integer',
        'spooler_job_id' => 'integer',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function printJob(): BelongsTo
    {
        return $this->belongsTo(PrintJob::class);
    }

    public function printAgent(): BelongsTo
    {
        return $this->belongsTo(PrintAgent::class);
    }
}
