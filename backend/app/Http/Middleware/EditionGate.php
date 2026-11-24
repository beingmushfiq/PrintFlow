<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domain\Tenancy\Edition;
use App\Domain\Tenancy\EditionContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EditionGate
{
    public function __construct(
        private readonly EditionContext $editionContext
    ) {}

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  $requiredEdition  Edition required to access route ('saas' or 'standalone')
     */
    public function handle(Request $request, Closure $next, string $requiredEdition = 'saas'): Response
    {
        $currentEdition = $this->editionContext->current();

        // Server configuration takes precedence: ignore any client-supplied edition header attempting to spoof
        if ($requiredEdition === 'saas' && $currentEdition === Edition::STANDALONE) {
            // Abort with 404 Not Found to prevent route enumeration of dormant SaaS features
            abort(404, 'Resource not found.');
        }

        if ($requiredEdition === 'standalone' && $currentEdition === Edition::SAAS) {
            abort(404, 'Resource not found.');
        }

        return $next($request);
    }
}
