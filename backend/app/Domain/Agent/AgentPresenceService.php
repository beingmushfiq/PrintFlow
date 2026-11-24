<?php

declare(strict_types=1);

namespace App\Domain\Agent;

use App\Models\PrintAgent;

class AgentPresenceService
{
    /**
     * Update agent heartbeat timestamp and mark online.
     */
    public function recordHeartbeat(PrintAgent $agent, ?array $metrics = null): PrintAgent
    {
        $agent->update([
            'status' => 'online',
            'last_seen_at' => now(),
            'metadata' => $metrics ? array_merge($agent->metadata ?? [], ['latest_metrics' => $metrics]) : $agent->metadata,
        ]);

        return $agent;
    }

    /**
     * Check if agent is currently online (seen within last 90 seconds).
     */
    public function isOnline(PrintAgent $agent): bool
    {
        if (! in_array($agent->status, ['online', 'active', 'busy'], true) || ! $agent->last_seen_at) {
            return false;
        }

        return $agent->last_seen_at->greaterThan(now()->subSeconds(90));
    }
}
