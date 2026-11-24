<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domain\Tenancy\TenantContext;
use App\Http\Responses\ApiResponse;
use App\Models\PrintAgent;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateAgent
{
    /**
     * Authenticate desktop print agent requests via Bearer token.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (empty($token)) {
            return ApiResponse::error(
                'Missing agent authorization token',
                Response::HTTP_UNAUTHORIZED,
                [],
                'AGENT_UNAUTHORIZED'
            );
        }

        $tokenHash = hash('sha256', $token);

        /** @var PrintAgent|null $agent */
        $agent = PrintAgent::withoutTenant()
            ->where(function ($query) use ($tokenHash) {
                $query->where('agent_token_hash', $tokenHash)
                      ->orWhere('agent_token', $tokenHash);
            })
            ->first();

        if (! $agent) {
            return ApiResponse::error(
                'Invalid or expired agent credentials',
                Response::HTTP_UNAUTHORIZED,
                [],
                'AGENT_UNAUTHORIZED'
            );
        }

        if ($agent->status === 'revoked') {
            return ApiResponse::error(
                'This agent device has been revoked by shop management',
                Response::HTTP_FORBIDDEN,
                [],
                'AGENT_REVOKED'
            );
        }

        // Bind tenant context for the agent's tenant
        $tenant = $agent->tenant;
        if ($tenant) {
            $tenantContext = TenantContext::fromTenant($tenant);
            app()->instance(TenantContext::class, $tenantContext);
            app()->instance('current_tenant_context', $tenantContext);
        }

        // Store agent in request and container
        $request->attributes->set('agent', $agent);
        app()->instance(PrintAgent::class, $agent);

        return $next($request);
    }
}
