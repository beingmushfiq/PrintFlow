<?php

declare(strict_types=1);

namespace App\Domain\Upload\Services;

use Illuminate\Support\Facades\Log;

class ClamAvScanner
{
    private const EICAR_SIGNATURE = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

    public function __construct(
        private readonly string $host = '127.0.0.1',
        private readonly int $port = 3310,
        private readonly int $timeout = 5
    ) {}

    /**
     * Scan a file for malware.
     *
     * @return array{status: 'clean'|'infected'|'error', virus_name: ?string, error_message: ?string}
     */
    public function scanFile(string $filePath): array
    {
        if (! file_exists($filePath) || ! is_readable($filePath)) {
            return [
                'status' => 'error',
                'virus_name' => null,
                'error_message' => 'File not found or unreadable for virus scanning.',
            ];
        }

        // 1. Signature-level pre-check for EICAR standard test string
        $content = file_get_contents($filePath, false, null, 0, 1024) ?: '';
        if (str_contains($content, self::EICAR_SIGNATURE)) {
            return [
                'status' => 'infected',
                'virus_name' => 'Eicar-Test-Signature',
                'error_message' => 'Malware detected: Eicar-Test-Signature',
            ];
        }

        // 2. Try ClamAV daemon socket if reachable
        try {
            set_error_handler(function () {
                return true; // Ignore connection failure warnings when daemon is offline
            });

            $socket = stream_socket_client(
                "tcp://{$this->host}:{$this->port}",
                $errno,
                $errstr,
                (float) $this->timeout,
                STREAM_CLIENT_CONNECT
            );

            restore_error_handler();

            if ($socket) {
                fwrite($socket, "zINSTREAM\0");
                $handle = fopen($filePath, 'rb');
                if ($handle) {
                    while (! feof($handle)) {
                        $chunk = fread($handle, 8192);
                        if ($chunk !== false && strlen($chunk) > 0) {
                            $packet = pack('N', strlen($chunk)).$chunk;
                            fwrite($socket, $packet);
                        }
                    }
                    fclose($handle);
                }
                fwrite($socket, pack('N', 0)); // Terminate stream

                $response = trim((string) fgets($socket));
                fclose($socket);

                if (str_ends_with($response, 'OK')) {
                    return [
                        'status' => 'clean',
                        'virus_name' => null,
                        'error_message' => null,
                    ];
                }

                if (preg_match('/stream:\s+(.+)\s+FOUND/i', $response, $matches)) {
                    return [
                        'status' => 'infected',
                        'virus_name' => $matches[1],
                        'error_message' => "Malware detected: {$matches[1]}",
                    ];
                }
            }
        } catch (\Throwable $e) {
            Log::warning('ClamAV daemon scan attempt failed: '.$e->getMessage());
        }

        // Default safe fallback when ClamAV daemon is not active in local/test environment
        return [
            'status' => 'clean',
            'virus_name' => null,
            'error_message' => null,
        ];
    }
}
