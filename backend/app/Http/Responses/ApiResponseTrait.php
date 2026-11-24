<?php

declare(strict_types=1);

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Pagination\LengthAwarePaginator;

trait ApiResponseTrait
{
    /**
     * Return a standardized success response.
     */
    protected function successResponse(
        mixed $data = null,
        array $meta = [],
        int $status = 200,
        array $headers = []
    ): JsonResponse {
        return ApiResponse::success($data, $meta, $status, $headers);
    }

    /**
     * Return a standardized paginated response.
     */
    protected function paginatedResponse(
        LengthAwarePaginator $paginator,
        array $meta = [],
        int $status = 200,
        array $headers = []
    ): JsonResponse {
        return ApiResponse::paginated($paginator, $meta, $status, $headers);
    }

    /**
     * Return a standardized error response.
     */
    protected function errorResponse(
        array|string $errors,
        int $status = 400,
        array $meta = [],
        ?string $code = null,
        array $headers = []
    ): JsonResponse {
        return ApiResponse::error($errors, $status, $meta, $code, $headers);
    }
}
