<?php

declare(strict_types=1);

namespace App\Domain\Upload\Services;

class MimeValidator
{
    private const PDF_MAGIC = '%PDF-';

    private const PNG_MAGIC = "\x89PNG\r\n\x1a\n";

    private const JPEG_MAGIC = "\xFF\xD8\xFF";

    /**
     * Inspect file bytes using magic signatures and finfo.
     *
     * @return array{valid: bool, mime: ?string, extension: ?string, error: ?string}
     */
    public function inspectBytes(string $bytes): array
    {
        if (strlen($bytes) < 8) {
            return [
                'valid' => false,
                'mime' => null,
                'extension' => null,
                'error' => 'File is too small or empty to be a valid document.',
            ];
        }

        // 1. Check PDF signature
        if (str_starts_with($bytes, self::PDF_MAGIC)) {
            return [
                'valid' => true,
                'mime' => 'application/pdf',
                'extension' => 'pdf',
                'error' => null,
            ];
        }

        // 2. Check PNG signature
        if (str_starts_with($bytes, self::PNG_MAGIC)) {
            return [
                'valid' => true,
                'mime' => 'image/png',
                'extension' => 'png',
                'error' => null,
            ];
        }

        // 3. Check JPEG signature
        if (str_starts_with($bytes, self::JPEG_MAGIC)) {
            return [
                'valid' => true,
                'mime' => 'image/jpeg',
                'extension' => 'jpg',
                'error' => null,
            ];
        }

        // Secondary check using PHP fileinfo
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo ? finfo_buffer($finfo, $bytes) : null;

        if ($detectedMime === 'application/pdf') {
            return ['valid' => true, 'mime' => 'application/pdf', 'extension' => 'pdf', 'error' => null];
        }
        if ($detectedMime === 'image/png') {
            return ['valid' => true, 'mime' => 'image/png', 'extension' => 'png', 'error' => null];
        }
        if ($detectedMime === 'image/jpeg') {
            return ['valid' => true, 'mime' => 'image/jpeg', 'extension' => 'jpg', 'error' => null];
        }

        return [
            'valid' => false,
            'mime' => $detectedMime,
            'extension' => null,
            'error' => 'Unsupported or disguised file format. Only PDF, PNG, and JPEG documents are permitted.',
        ];
    }

    /**
     * Inspect a file from path.
     */
    public function inspectFile(string $filePath): array
    {
        if (! file_exists($filePath) || ! is_readable($filePath)) {
            return [
                'valid' => false,
                'mime' => null,
                'extension' => null,
                'error' => 'File not found or unreadable on storage.',
            ];
        }

        $header = file_get_contents($filePath, false, null, 0, 8192) ?: '';

        return $this->inspectBytes($header);
    }
}
