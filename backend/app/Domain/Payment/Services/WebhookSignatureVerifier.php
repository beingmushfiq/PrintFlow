<?php

declare(strict_types=1);

namespace App\Domain\Payment\Services;

class WebhookSignatureVerifier
{
    public const REPLAY_WINDOW_SECONDS = 300; // 5 minutes

    /**
     * Verify raw unparsed payload bytes against HMAC-SHA256 signature in constant time.
     */
    public function verifyRawSignature(string $rawPayload, string $signature, string $secret): bool
    {
        if ($rawPayload === '' || $signature === '' || $secret === '') {
            return false;
        }

        // Clean signature prefix if provided (e.g. 'sha256=...')
        if (str_starts_with($signature, 'sha256=')) {
            $signature = substr($signature, 7);
        }

        $expected = hash_hmac('sha256', $rawPayload, $secret);

        return hash_equals($expected, $signature);
    }

    /**
     * Validate webhook timestamp against replay attacks within window (300 seconds).
     */
    public function isTimestampValid(string $timestampStr, ?int $currentTimestampMs = null): bool
    {
        $payloadTime = strtotime($timestampStr);
        if ($payloadTime === false) {
            return false;
        }

        $currentTime = $currentTimestampMs !== null
            ? (int) ($currentTimestampMs / 1000)
            : time();

        $diff = abs($currentTime - $payloadTime);

        return $diff <= self::REPLAY_WINDOW_SECONDS;
    }
}
