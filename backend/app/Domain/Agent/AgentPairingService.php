<?php

declare(strict_types=1);

namespace App\Domain\Agent;

use App\Models\PrintAgent;
use App\Models\Shop;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AgentPairingService
{
    /**
     * Generate a new 6-digit pairing code for an agent in a shop with a 15-minute TTL.
     */
    public function generatePairingCode(Shop $shop, ?string $deviceName = null, bool $regenerate = false): array
    {
        // If not explicitly regenerating, check if this shop already has an active pending pairing code with >60s remaining
        if (! $regenerate) {
            $existing = PrintAgent::withoutTenant()
                ->where('shop_id', $shop->id)
                ->whereNotNull('pairing_code')
                ->where('status', 'offline')
                ->where(function ($q) {
                    $q->where('pairing_code_expires_at', '>', now()->addSeconds(60))
                      ->orWhere('pairing_expires_at', '>', now()->addSeconds(60));
                })
                ->latest()
                ->first();

            if ($existing) {
                $expiresAt = $existing->pairing_code_expires_at ?? $existing->pairing_expires_at;
                $remaining = max(10, (int) now()->diffInSeconds($expiresAt));

                return [
                    'agent_id' => $existing->id,
                    'pairing_code' => $existing->pairing_code,
                    'expires_at' => $expiresAt->toIso8601String(),
                    'expires_in_seconds' => $remaining,
                ];
            }
        }

        // Clean up previous pending offline pairing requests for this shop
        PrintAgent::withoutTenant()
            ->where('shop_id', $shop->id)
            ->whereNotNull('pairing_code')
            ->where('status', 'offline')
            ->delete();

        $code = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $ttlMinutes = 15;
        $expiresAt = now()->addMinutes($ttlMinutes);

        $agent = PrintAgent::create([
            'tenant_id' => $shop->tenant_id,
            'shop_id' => $shop->id,
            'device_name' => $deviceName ?? 'Windows Print Station',
            'device_uuid' => 'pending-' . Str::uuid(),
            'machine_guid' => 'pending-' . Str::random(12),
            'public_key_hash' => 'pending-' . Str::random(12),
            'agent_token_hash' => 'pending-' . Str::random(32),
            'agent_token' => 'pending-' . Str::random(32),
            'status' => 'offline',
            'pairing_code' => $code,
            'pairing_code_expires_at' => $expiresAt,
            'pairing_expires_at' => $expiresAt,
            'metadata' => ['created_via' => 'console_pairing'],
        ]);

        return [
            'agent_id' => $agent->id,
            'pairing_code' => $code,
            'expires_at' => $expiresAt->toIso8601String(),
            'expires_in_seconds' => $ttlMinutes * 60,
        ];
    }

    /**
     * Enroll an agent using a valid pairing code.
     */
    public function enroll(string $pairingCode, array $deviceMetadata, string $publicKeyHash): array
    {
        $cleanCode = trim($pairingCode);

        $agent = PrintAgent::where('pairing_code', $cleanCode)
            ->where(function ($query) {
                $query->where(function ($q) {
                    $q->whereNotNull('pairing_code_expires_at')
                      ->where('pairing_code_expires_at', '>', now());
                })->orWhere(function ($q) {
                    $q->whereNotNull('pairing_expires_at')
                      ->where('pairing_expires_at', '>', now());
                });
            })
            ->first();

        if (! $agent) {
            throw ValidationException::withMessages([
                'pairing_code' => ['The provided pairing code is invalid or has expired.'],
            ]);
        }

        $rawToken = 'pfa_' . Str::random(56);
        $hashedToken = hash('sha256', $rawToken);
        $deviceUuid = $deviceMetadata['device_uuid'] ?? $deviceMetadata['machine_guid'] ?? (string) Str::uuid();

        $agent->update([
            'device_name' => $deviceMetadata['device_name'] ?? $deviceMetadata['hostname'] ?? $agent->device_name,
            'device_uuid' => $deviceUuid,
            'machine_guid' => $deviceUuid,
            'public_key_hash' => $publicKeyHash,
            'agent_token_hash' => $hashedToken,
            'agent_token' => $hashedToken,
            'status' => 'online',
            'last_seen_at' => now(),
            'pairing_code' => null,
            'pairing_code_expires_at' => null,
            'pairing_expires_at' => null,
            'metadata' => array_merge($agent->metadata ?? [], $deviceMetadata),
        ]);

        return [
            'agent_id' => $agent->id,
            'tenant_id' => $agent->tenant_id,
            'shop_id' => $agent->shop_id,
            'device_name' => $agent->device_name,
            'agent_token' => $rawToken,
        ];
    }
}
