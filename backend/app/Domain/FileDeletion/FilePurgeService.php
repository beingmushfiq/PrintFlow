<?php

declare(strict_types=1);

namespace App\Domain\FileDeletion;

use App\Models\FileDeletionEvent;
use App\Models\OrderFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class FilePurgeService
{
    /**
     * Record that the local agent shredded the temp file after spooling.
     */
    public function recordLocalShred(string $orderFileId, string $tenantId, ?array $details = null): FileDeletionEvent
    {
        $orderFile = OrderFile::find($orderFileId);
        $orderId = $orderFile?->order_id ?? ($details['order_id'] ?? null);
        $deletedAt = now();
        $auditHash = hash('sha256', $orderFileId . '_agent_shred_' . $deletedAt->timestamp);

        return FileDeletionEvent::create([
            'tenant_id' => $tenantId,
            'order_id' => $orderId,
            'order_file_id' => $orderFileId,
            'reason' => 'order_completed',
            'trigger_reason' => 'spooler_closed',
            'source' => 'agent_shred',
            'deletion_status' => 'local_shredded',
            'deleted_at' => $deletedAt,
            'local_shredded_at' => $deletedAt,
            'audit_hash' => $auditHash,
            'details' => $details,
        ]);
    }

    /**
     * Permanently purge remote object from S3/MinIO and record audit event.
     */
    public function purgeRemoteFile(OrderFile|string $orderFileOrId, string $triggerReason = 'order_completed'): ?FileDeletionEvent
    {
        $orderFile = is_string($orderFileOrId) ? OrderFile::find($orderFileOrId) : $orderFileOrId;
        if (! $orderFile) {
            Log::warning("Cannot purge remote file: OrderFile {$orderFileOrId} not found.");
            return null;
        }

        $reason = match ($triggerReason) {
            'cancelled', 'order_cancelled' => 'cancelled',
            'privacy_ttl', 'retention_expired' => 'privacy_ttl',
            default => 'order_completed',
        };

        try {
            $disk = $orderFile->storage_disk ?: config('filesystems.default', 'local');
            if ($orderFile->object_key && Storage::disk($disk)->exists($orderFile->object_key)) {
                Storage::disk($disk)->delete($orderFile->object_key);
            }

            // Also delete preview artifact if exists
            if ($orderFile->preview_object_key && Storage::disk($disk)->exists($orderFile->preview_object_key)) {
                Storage::disk($disk)->delete($orderFile->preview_object_key);
            }

            $deletedAt = now();
            $auditHash = hash('sha256', $orderFile->id . '_server_purge_' . $deletedAt->timestamp);

            $orderFile->update([
                'deletion_status' => 'remote_purged',
                'deleted_at' => $deletedAt,
            ]);

            return FileDeletionEvent::create([
                'tenant_id' => $orderFile->tenant_id,
                'order_id' => $orderFile->order_id,
                'order_file_id' => $orderFile->id,
                'reason' => $reason,
                'trigger_reason' => $triggerReason,
                'source' => 'server_purge',
                'deletion_status' => 'remote_purged',
                'deleted_at' => $deletedAt,
                'remote_purged_at' => $deletedAt,
                'audit_hash' => $auditHash,
                'details' => [
                    'disk' => $disk,
                    'object_key' => $orderFile->object_key,
                    'purged_size_bytes' => $orderFile->size_bytes,
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error("Failed to purge remote file {$orderFile->id}: {$e->getMessage()}");

            return FileDeletionEvent::create([
                'tenant_id' => $orderFile->tenant_id,
                'order_id' => $orderFile->order_id,
                'order_file_id' => $orderFile->id,
                'reason' => $reason,
                'trigger_reason' => $triggerReason,
                'source' => 'server_purge',
                'deletion_status' => 'failed',
                'audit_hash' => hash('sha256', $orderFile->id . '_server_purge_failed_' . now()->timestamp),
                'details' => [
                    'error' => $e->getMessage(),
                ],
            ]);
        }
    }
}
