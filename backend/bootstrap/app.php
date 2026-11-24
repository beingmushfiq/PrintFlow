<?php

use App\Http\Middleware\AuthenticateAgent;
use App\Http\Middleware\CorrelationIdMiddleware;
use App\Http\Middleware\EditionGate;
use App\Http\Middleware\ResolveTenant;
use App\Http\Responses\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->redirectGuestsTo(fn () => null);
        $middleware->prepend(CorrelationIdMiddleware::class);
        $middleware->append(ResolveTenant::class);
        $middleware->alias([
            'auth.agent' => AuthenticateAgent::class,
            'edition.gate' => EditionGate::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Global JSON exception handling for API and JSON requests
        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                $errors = [];
                foreach ($e->errors() as $field => $messages) {
                    foreach ($messages as $message) {
                        $errors[] = [
                            'code' => 'VALIDATION_ERROR',
                            'field' => $field,
                            'message' => $message,
                        ];
                    }
                }

                return ApiResponse::error($errors, 422);
            }
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return ApiResponse::error([[
                    'code' => 'UNAUTHENTICATED',
                    'message' => 'Unauthenticated.',
                ]], 401);
            }
        });

        $exceptions->render(function (AuthorizationException|AccessDeniedHttpException|InvalidSignatureException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return ApiResponse::error([[
                    'code' => 'FORBIDDEN',
                    'message' => $e->getMessage() ?: 'Forbidden.',
                ]], 403);
            }
        });

        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return ApiResponse::error([[
                    'code' => 'NOT_FOUND',
                    'message' => $e->getMessage() ?: 'The requested resource was not found.',
                ]], 404);
            }
        });

        $exceptions->render(function (HttpException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return ApiResponse::error([[
                    'code' => 'HTTP_ERROR',
                    'message' => $e->getMessage() ?: 'HTTP error.',
                ]], $e->getStatusCode());
            }
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                $message = config('app.debug')
                    ? $e->getMessage()
                    : 'Server error encountered.';

                $error = [
                    'code' => 'INTERNAL_SERVER_ERROR',
                    'message' => $message,
                ];

                if (config('app.debug')) {
                    $error['file'] = $e->getFile();
                    $error['line'] = $e->getLine();
                }

                return ApiResponse::error([$error], 500);
            }
        });
    })->create();
