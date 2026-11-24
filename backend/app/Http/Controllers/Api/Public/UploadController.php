<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Upload\Services\ClamAvScanner;
use App\Domain\Upload\Services\MimeValidator;
use App\Domain\Upload\Services\PdfMetricsService;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\OrderFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    public function __construct(
        private readonly MimeValidator $mimeValidator,
        private readonly PdfMetricsService $pdfMetricsService,
        private readonly ClamAvScanner $clamAvScanner
    ) {}

    /**
     * Resolve Order by public token.
     */
    private function resolveOrder(string $publicToken): ?Order
    {
        $hash = hash('sha256', $publicToken);

        return Order::withoutTenant()->where('public_token_hash', $hash)->first();
    }

    /**
     * Presign direct upload slot to S3/MinIO or local upload endpoint.
     */
    public function presign(Request $request): JsonResponse
    {
        $request->validate([
            'public_token' => 'required|string',
            'original_name' => 'required|string|max:255',
            'size_bytes' => 'required|integer|min:1|max:104857600', // 100MB limit
            'mime_type' => 'required|string',
        ]);

        $order = $this->resolveOrder($request->public_token);
        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'Invalid or expired order session.',
                ],
            ], 404);
        }

        // Sanitize original filename
        $cleanName = preg_replace('/[^\w\-. ]+/', '_', basename($request->original_name));
        if (empty($cleanName)) {
            $cleanName = 'document_'.time();
        }

        $extension = strtolower(pathinfo($cleanName, PATHINFO_EXTENSION));
        $fileUlid = (string) Str::ulid();
        $objectKey = "documents/{$order->tenant_id}/{$order->id}/{$fileUlid}.".($extension ?: 'bin');

        $diskName = config('filesystems.default', 'local');

        $orderFile = OrderFile::withoutTenant()->create([
            'id' => $fileUlid,
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'original_name' => $cleanName,
            'object_key' => $objectKey,
            'storage_disk' => $diskName,
            'file_extension_detected' => $extension,
            'size_bytes' => (int) $request->size_bytes,
            'scan_status' => 'pending',
            'processing_status' => 'pending',
            'expires_at' => now()->addHours(24),
        ]);

        $uploadUrl = null;
        $method = 'PUT';

        // Check if S3 temporary upload URL is supported
        if ($diskName === 's3') {
            try {
                $uploadUrl = Storage::disk('s3')->temporaryUploadUrl($objectKey, now()->addMinutes(15));
            } catch (\Throwable) {
                // S3 not configured or driver doesn't support temporaryUploadUrl
            }
        }

        // Fallback to direct upload API endpoint
        if (! $uploadUrl) {
            $uploadUrl = url("/api/v1/public/upload/direct/{$orderFile->id}?public_token=".urlencode($request->public_token));
            $method = 'POST';
        }

        return ApiResponse::success([
            'file_id' => $orderFile->id,
            'object_key' => $orderFile->object_key,
            'upload_url' => $uploadUrl,
            'method' => $method,
            'headers' => [
                'Content-Type' => $request->mime_type,
            ],
            'expires_at' => now()->addMinutes(15)->toISOString(),
        ]);
    }

    /**
     * Direct upload streaming endpoint (for local development or direct upload fallback).
     */
    public function directUpload(Request $request, string $fileId): JsonResponse
    {
        $publicToken = (string) ($request->query('public_token') ?? $request->header('X-Order-Token') ?? $request->input('public_token'));

        $order = $this->resolveOrder($publicToken);
        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'Invalid or expired order session.',
                ],
            ], 404);
        }

        $orderFile = OrderFile::withoutTenant()->where('id', $fileId)->where('order_id', $order->id)->first();
        if (! $orderFile) {
            return ApiResponse::error([
                [
                    'code' => 'FILE_NOT_FOUND',
                    'message' => 'Upload target file not found.',
                ],
            ], 404);
        }

        $content = null;
        if ($request->hasFile('file')) {
            $uploadedFile = $request->file('file');
            $content = file_get_contents($uploadedFile->getRealPath());
        } else {
            $content = $request->getContent();
        }

        if (empty($content)) {
            return ApiResponse::error([
                [
                    'code' => 'EMPTY_PAYLOAD',
                    'message' => 'No file payload was received in upload.',
                ],
            ], 422);
        }

        $diskName = $orderFile->storage_disk ?: 'local';
        Storage::disk($diskName)->put($orderFile->object_key, $content);

        return ApiResponse::success([
            'message' => 'File uploaded successfully.',
            'file_id' => $orderFile->id,
            'size_bytes' => strlen($content),
        ]);
    }

    /**
     * Confirm uploaded file, inspect magic bytes, scan virus, and extract PDF metrics.
     */
    public function confirm(Request $request): JsonResponse
    {
        $request->validate([
            'public_token' => 'required|string',
            'file_id' => 'required|string',
        ]);

        $order = $this->resolveOrder($request->public_token);
        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'Invalid or expired order session.',
                ],
            ], 404);
        }

        $orderFile = OrderFile::withoutTenant()
            ->where('id', $request->file_id)
            ->where('order_id', $order->id)
            ->first();

        if (! $orderFile) {
            return ApiResponse::error([
                [
                    'code' => 'FILE_NOT_FOUND',
                    'message' => 'Upload file record not found for this order.',
                ],
            ], 404);
        }

        $diskName = $orderFile->storage_disk ?: 'local';
        if (! Storage::disk($diskName)->exists($orderFile->object_key)) {
            return ApiResponse::error([
                [
                    'code' => 'FILE_NOT_ON_STORAGE',
                    'message' => 'File payload was not found on object storage. Please complete the upload first.',
                ],
            ], 422);
        }

        $bytes = Storage::disk($diskName)->get($orderFile->object_key);
        $fileSize = strlen($bytes);

        // 1. Magic byte & MIME validation
        $mimeCheck = $this->mimeValidator->inspectBytes($bytes);
        if (! $mimeCheck['valid']) {
            $orderFile->update([
                'processing_status' => 'rejected',
                'scan_status' => 'error',
                'deletion_error_code' => 'INVALID_MIME',
                'processing_json' => ['error' => $mimeCheck['error']],
            ]);

            return ApiResponse::error([
                [
                    'code' => 'INVALID_MIME_TYPE',
                    'message' => $mimeCheck['error'] ?: 'Invalid file format.',
                ],
            ], 422);
        }

        // Write to temporary file for deep inspection & scanning
        $tempDir = sys_get_temp_dir();
        $tempPath = $tempDir.DIRECTORY_SEPARATOR.'inspect_'.uniqid().'.'.($mimeCheck['extension'] ?? 'tmp');
        file_put_contents($tempPath, $bytes);

        try {
            // 2. Malware inspection via ClamAV hook
            $scanResult = $this->clamAvScanner->scanFile($tempPath);
            if ($scanResult['status'] === 'infected') {
                Storage::disk($diskName)->delete($orderFile->object_key);

                $orderFile->update([
                    'scan_status' => 'infected',
                    'processing_status' => 'rejected',
                    'deletion_status' => 'purged_malware',
                    'processing_json' => ['virus' => $scanResult['virus_name']],
                ]);

                OrderEvent::withoutTenant()->create([
                    'tenant_id' => $order->tenant_id,
                    'shop_id' => $order->shop_id,
                    'order_id' => $order->id,
                    'event_type' => 'document.malware_detected',
                    'from_status' => $order->status,
                    'to_status' => 'failed',
                    'actor_type' => 'system',
                    'description' => "Uploaded file {$orderFile->original_name} was quarantined: {$scanResult['virus_name']}",
                ]);

                return ApiResponse::error([
                    [
                        'code' => 'MALWARE_DETECTED',
                        'message' => 'Security alert: Uploaded document contained malicious code and has been removed.',
                    ],
                ], 422);
            }

            // 3. Document Metrics Inspection (PDF / Image)
            $pageCount = 1;
            $widthPx = null;
            $heightPx = null;
            $previewObjectKey = null;

            if ($mimeCheck['mime'] === 'application/pdf') {
                $pdfInspection = $this->pdfMetricsService->inspect($tempPath);

                if ($pdfInspection['error']) {
                    $orderFile->update([
                        'processing_status' => 'rejected',
                        'scan_status' => 'clean',
                        'processing_json' => ['error' => $pdfInspection['error']],
                    ]);

                    $code = $pdfInspection['is_encrypted'] ? 'ENCRYPTED_PDF' : 'PDF_INSPECTION_FAILED';

                    return ApiResponse::error([
                        [
                            'code' => $code,
                            'message' => $pdfInspection['error'],
                        ],
                    ], 422);
                }

                $pageCount = $pdfInspection['page_count'];
                $widthPx = $pdfInspection['width_px'];
                $heightPx = $pdfInspection['height_px'];

                if (! empty($pdfInspection['preview_path']) && file_exists($pdfInspection['preview_path'])) {
                    $previewObjectKey = "previews/{$order->tenant_id}/{$order->id}/{$orderFile->id}_thumb.png";
                    Storage::disk($diskName)->put($previewObjectKey, file_get_contents($pdfInspection['preview_path']));
                    @unlink($pdfInspection['preview_path']);
                }
            } else {
                // PNG or JPEG
                $imgInspection = $this->pdfMetricsService->inspectImage($tempPath);
                $pageCount = 1;
                $widthPx = $imgInspection['width_px'];
                $heightPx = $imgInspection['height_px'];
            }

            $sha256 = hash('sha256', $bytes);

            $orderFile->update([
                'mime_type_detected' => $mimeCheck['mime'],
                'file_extension_detected' => $mimeCheck['extension'],
                'size_bytes' => $fileSize,
                'sha256_hash' => $sha256,
                'scan_status' => 'clean',
                'processing_status' => 'ready',
                'page_count' => $pageCount,
                'width_px' => $widthPx,
                'height_px' => $heightPx,
                'orientation' => ($widthPx && $heightPx && $widthPx > $heightPx) ? 'landscape' : 'portrait',
                'preview_object_key' => $previewObjectKey,
                'processing_json' => [
                    'verified_at' => now()->toISOString(),
                    'page_count' => $pageCount,
                    'dimensions' => "{$widthPx}x{$heightPx}",
                ],
            ]);

            // Update order status if currently draft
            if ($order->status === 'draft') {
                $order->update(['status' => 'uploaded']);
            }

            OrderEvent::withoutTenant()->create([
                'tenant_id' => $order->tenant_id,
                'shop_id' => $order->shop_id,
                'order_id' => $order->id,
                'event_type' => 'document.verified',
                'from_status' => 'draft',
                'to_status' => 'uploaded',
                'actor_type' => 'system',
                'description' => "Document {$orderFile->original_name} verified ({$pageCount} pages, {$fileSize} bytes).",
                'payload_json' => [
                    'file_id' => $orderFile->id,
                    'page_count' => $pageCount,
                    'mime_type' => $mimeCheck['mime'],
                ],
            ]);

            return ApiResponse::success([
                'file' => [
                    'id' => $orderFile->id,
                    'original_name' => $orderFile->original_name,
                    'mime_type' => $orderFile->mime_type_detected,
                    'size_bytes' => $orderFile->size_bytes,
                    'page_count' => $orderFile->page_count,
                    'width_px' => $orderFile->width_px,
                    'height_px' => $orderFile->height_px,
                    'orientation' => $orderFile->orientation,
                    'scan_status' => $orderFile->scan_status,
                    'processing_status' => $orderFile->processing_status,
                    'preview_url' => $previewObjectKey ? Storage::disk($diskName)->url($previewObjectKey) : null,
                ],
            ]);
        } finally {
            if (file_exists($tempPath)) {
                @unlink($tempPath);
            }
        }
    }
}
