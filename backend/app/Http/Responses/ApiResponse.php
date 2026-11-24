<?php

declare(strict_types=1);

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

class ApiResponse
{
    /**
     * Build standard metadata including correlation ID and UTC timestamp.
     *
     * @param  array<string, mixed>  $extraMeta
     * @return array<string, mixed>
     */
    public static function buildMeta(array $extraMeta = []): array
    {
        $correlationId = app()->has('correlation_id')
            ? (string) app('correlation_id')
            : (string) Str::uuid();

        return array_merge([
            'correlation_id' => $correlationId,
            'timestamp' => now()->toISOString(),
        ], $extraMeta);
    }

    /**
     * Return a standardized JSON success response.
     *
     * @param  array<string, mixed>  $meta
     * @param  array<string, string>  $headers
     */
    public static function success(
        mixed $data = null,
        array $meta = [],
        int $status = 200,
        array $headers = []
    ): JsonResponse {
        $metaData = self::buildMeta($meta);

        if (! isset($headers['X-Correlation-ID']) && isset($metaData['correlation_id'])) {
            $headers['X-Correlation-ID'] = $metaData['correlation_id'];
        }

        return response()->json([
            'data' => $data,
            'meta' => $metaData,
            'errors' => [],
        ], $status, $headers);
    }

    /**
     * Return a standardized paginated JSON response.
     *
     * @param  array<string, mixed>  $meta
     * @param  array<string, string>  $headers
     */
    public static function paginated(
        LengthAwarePaginator $paginator,
        array $meta = [],
        int $status = 200,
        array $headers = []
    ): JsonResponse {
        $paginationMeta = [
            'pagination' => [
                'total' => $paginator->total(),
                'count' => $paginator->count(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'total_pages' => $paginator->lastPage(),
            ],
        ];

        return self::success(
            data: $paginator->items(),
            meta: array_merge($paginationMeta, $meta),
            status: $status,
            headers: $headers
        );
    }

    /**
     * Return a standardized JSON error response.
     *
     * @param  array<int, mixed>|string  $errors
     * @param  array<string, mixed>  $meta
     * @param  array<string, string>  $headers
     */
    public static function error(
        array|string $errors,
        int $status = 400,
        array $meta = [],
        ?string $code = null,
        array $headers = []
    ): JsonResponse {
        $metaData = self::buildMeta($meta);

        if (! isset($headers['X-Correlation-ID']) && isset($metaData['correlation_id'])) {
            $headers['X-Correlation-ID'] = $metaData['correlation_id'];
        }

        $formattedErrors = [];

        if (is_string($errors)) {
            $formattedErrors[] = [
                'code' => $code ?? 'ERROR',
                'message' => $errors,
            ];
        } else {
            foreach ($errors as $key => $error) {
                if (is_array($error) && isset($error['message'])) {
                    $formattedErrors[] = $error;
                } elseif (is_string($error)) {
                    $item = [
                        'code' => $code ?? 'VALIDATION_ERROR',
                        'message' => $error,
                    ];
                    if (is_string($key)) {
                        $item['field'] = $key;
                    }
                    $formattedErrors[] = $item;
                } elseif (is_array($error)) {
                    // E.g. validation error array from validator: ['field' => ['message 1', 'message 2']]
                    foreach ($error as $subError) {
                        $item = [
                            'code' => $code ?? 'VALIDATION_ERROR',
                            'message' => (string) $subError,
                        ];
                        if (is_string($key)) {
                            $item['field'] = $key;
                        }
                        $formattedErrors[] = $item;
                    }
                }
            }
        }

        return response()->json([
            'data' => null,
            'meta' => $metaData,
            'errors' => $formattedErrors,
        ], $status, $headers);
    }
}
