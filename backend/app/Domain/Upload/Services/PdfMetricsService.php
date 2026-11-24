<?php

declare(strict_types=1);

namespace App\Domain\Upload\Services;

use Symfony\Component\Process\Process;

class PdfMetricsService
{
    private const MAX_ALLOWED_PAGES = 100;

    public function __construct(
        private readonly string $pdfInfoPath = 'pdfinfo',
        private readonly string $pdfToPpmPath = 'pdftoppm'
    ) {}

    /**
     * Inspect PDF document metrics, detecting encryption and counting pages.
     *
     * @return array{
     *     page_count: int,
     *     width_px: ?int,
     *     height_px: ?int,
     *     is_encrypted: bool,
     *     preview_path: ?string,
     *     error: ?string
     * }
     */
    public function inspect(string $filePath): array
    {
        if (! file_exists($filePath) || ! is_readable($filePath)) {
            return [
                'page_count' => 0,
                'width_px' => null,
                'height_px' => null,
                'is_encrypted' => false,
                'preview_path' => null,
                'error' => 'File not found or unreadable on storage.',
            ];
        }

        // 1. Check for encryption first
        $isEncrypted = $this->detectEncryption($filePath);
        if ($isEncrypted) {
            return [
                'page_count' => 0,
                'width_px' => null,
                'height_px' => null,
                'is_encrypted' => true,
                'preview_path' => null,
                'error' => 'Password-protected or encrypted PDFs are not supported for walk-in printing. Please unlock the file and re-upload.',
            ];
        }

        // 2. Extract page count and dimensions
        $metrics = $this->extractMetrics($filePath);
        if (! empty($metrics['error']) || ($metrics['page_count'] ?? 0) === 0) {
            return [
                'page_count' => 0,
                'width_px' => null,
                'height_px' => null,
                'is_encrypted' => false,
                'preview_path' => null,
                'error' => $metrics['error'] ?? 'Unable to parse PDF page count: file corrupted or truncated.',
            ];
        }

        // 3. Enforce page count ceiling <= 100
        if ($metrics['page_count'] > self::MAX_ALLOWED_PAGES) {
            return [
                'page_count' => $metrics['page_count'],
                'width_px' => $metrics['width_px'],
                'height_px' => $metrics['height_px'],
                'is_encrypted' => false,
                'preview_path' => null,
                'error' => 'Document exceeds the maximum limit of '.self::MAX_ALLOWED_PAGES." pages (detected: {$metrics['page_count']} pages).",
            ];
        }

        // 4. Generate first-page preview thumbnail
        $previewPath = $this->generateThumbnail($filePath);

        return [
            'page_count' => $metrics['page_count'],
            'width_px' => $metrics['width_px'],
            'height_px' => $metrics['height_px'],
            'is_encrypted' => false,
            'preview_path' => $previewPath,
            'error' => null,
        ];
    }

    /**
     * Detect whether the PDF is password-protected/encrypted.
     */
    public function detectEncryption(string $filePath): bool
    {
        // Try Poppler CLI if available
        if ($this->isCommandAvailable($this->pdfInfoPath)) {
            $process = new Process([$this->pdfInfoPath, $filePath]);
            $process->run();
            $output = $process->getOutput();
            $errorOutput = $process->getErrorOutput();

            if (str_contains(strtolower($output), 'encrypted: yes') ||
                str_contains(strtolower($errorOutput), 'incorrect password') ||
                str_contains(strtolower($errorOutput), 'command line error: incorrect password')) {
                return true;
            }
        }

        // Fallback: Byte-level inspection for /Encrypt dictionary
        $contents = file_get_contents($filePath, false, null, 0, 524288) ?: '';
        if (preg_match('/\/Encrypt\s+\d+\s+\d+\s+R/', $contents) || preg_match('/\/Encrypt\b/', $contents)) {
            return true;
        }

        // Also check trailer near the end of file
        $fileSize = filesize($filePath);
        if ($fileSize > 524288) {
            $offset = max(0, $fileSize - 32768);
            $tail = file_get_contents($filePath, false, null, $offset, 32768) ?: '';
            if (preg_match('/\/Encrypt\s+\d+\s+\d+\s+R/', $tail) || preg_match('/\/Encrypt\b/', $tail)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Extract page count and dimensions using pdfinfo or regex fallback.
     *
     * @return array{page_count: int, width_px: ?int, height_px: ?int}
     */
    public function extractMetrics(string $filePath): array
    {
        // Try Poppler CLI
        if ($this->isCommandAvailable($this->pdfInfoPath)) {
            $process = new Process([$this->pdfInfoPath, $filePath]);
            $process->run();
            if ($process->isSuccessful()) {
                $output = $process->getOutput();
                $pageCount = 1;
                $width = null;
                $height = null;

                if (preg_match('/Pages:\s+(\d+)/i', $output, $matches)) {
                    $pageCount = (int) $matches[1];
                }

                if (preg_match('/Page size:\s+([0-9.]+)\s+x\s+([0-9.]+)/i', $output, $matches)) {
                    $width = (int) round((float) $matches[1]);
                    $height = (int) round((float) $matches[2]);
                }

                return [
                    'page_count' => max(1, $pageCount),
                    'width_px' => $width,
                    'height_px' => $height,
                    'error' => null,
                ];
            }
        }

        // Fallback: Pure-PHP PDF parser
        return $this->fallbackParsePdf($filePath);
    }

    /**
     * Fallback pure-PHP PDF page counter.
     *
     * @return array{page_count: int, width_px: ?int, height_px: ?int, error: ?string}
     */
    private function fallbackParsePdf(string $filePath): array
    {
        $content = file_get_contents($filePath) ?: '';

        // Strategy A: Count from /Pages dictionary /Count N
        if (preg_match_all('/\/Type\s*\/Pages\b[^\/]*\/Count\s+(\d+)/s', $content, $matches)) {
            $counts = array_map('intval', $matches[1]);
            if (! empty($counts)) {
                $pageCount = max($counts);

                return [
                    'page_count' => max(1, $pageCount),
                    'width_px' => 595, // Standard A4 points default
                    'height_px' => 842,
                    'error' => null,
                ];
            }
        }

        // Strategy B: Count individual /Type /Page (excluding /Pages)
        if (preg_match_all('/\/Type\s*\/Page\b(?!s)/', $content, $matches)) {
            $pageCount = count($matches[0]);
            if ($pageCount > 0) {
                return [
                    'page_count' => $pageCount,
                    'width_px' => 595,
                    'height_px' => 842,
                    'error' => null,
                ];
            }
        }

        // Before defaulting to Strategy C, verify basic PDF structural markers exist
        if (! str_contains($content, 'obj') && ! str_contains($content, 'trailer') && ! str_contains($content, 'xref')) {
            return [
                'page_count' => 0,
                'width_px' => null,
                'height_px' => null,
                'error' => 'Unable to parse PDF page count: file corrupted or truncated.',
            ];
        }

        // Strategy C: Default single-page fallback
        return [
            'page_count' => 1,
            'width_px' => 595,
            'height_px' => 842,
            'error' => null,
        ];
    }

    /**
     * Generate first-page thumbnail raster preview using pdftoppm or fallback.
     */
    public function generateThumbnail(string $filePath): ?string
    {
        if (! $this->isCommandAvailable($this->pdfToPpmPath)) {
            return null;
        }

        $tempDir = sys_get_temp_dir();
        $outputPrefix = $tempDir.DIRECTORY_SEPARATOR.'thumb_'.uniqid();

        $process = new Process([
            $this->pdfToPpmPath,
            '-png',
            '-f', '1',
            '-l', '1',
            '-r', '150',
            $filePath,
            $outputPrefix,
        ]);
        $process->run();

        $generatedThumb = $outputPrefix.'-1.png';
        if (file_exists($generatedThumb)) {
            return $generatedThumb;
        }

        return null;
    }

    /**
     * Inspect image dimensions (for PNG/JPEG).
     *
     * @return array{page_count: int, width_px: ?int, height_px: ?int, error: ?string}
     */
    public function inspectImage(string $filePath): array
    {
        $imageInfo = @getimagesize($filePath);
        if (! $imageInfo) {
            return [
                'page_count' => 1,
                'width_px' => null,
                'height_px' => null,
                'error' => 'Unable to read image dimensions.',
            ];
        }

        return [
            'page_count' => 1,
            'width_px' => (int) $imageInfo[0],
            'height_px' => (int) $imageInfo[1],
            'error' => null,
        ];
    }

    private function isCommandAvailable(string $command): bool
    {
        $check = PHP_OS_FAMILY === 'Windows'
            ? "where.exe {$command} 2>NUL"
            : "which {$command} 2>/dev/null";

        $output = @shell_exec($check);

        return ! empty($output);
    }
}
