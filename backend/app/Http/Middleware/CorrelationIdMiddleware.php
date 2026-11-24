<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class CorrelationIdMiddleware
{
    public const HEADER_NAME = 'X-Correlation-ID';

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $correlationId = $request->header(self::HEADER_NAME);

        if (empty($correlationId) || ! is_string($correlationId)) {
            $correlationId = (string) Str::uuid();
            $request->headers->set(self::HEADER_NAME, $correlationId);
        }

        // Bind into container for application-wide logging and meta resolution
        app()->instance('correlation_id', $correlationId);

        $response = $next($request);

        // Inject header into response
        $response->headers->set(self::HEADER_NAME, $correlationId);

        return $response;
    }
}
