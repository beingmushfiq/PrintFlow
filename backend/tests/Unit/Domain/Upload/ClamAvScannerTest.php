<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Upload;

use App\Domain\Upload\Services\ClamAvScanner;
use PHPUnit\Framework\TestCase;

class ClamAvScannerTest extends TestCase
{
    private ClamAvScanner $scanner;

    private string $tempFile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scanner = new ClamAvScanner;
        $this->tempFile = tempnam(sys_get_temp_dir(), 'clam_');
    }

    protected function tearDown(): void
    {
        if (file_exists($this->tempFile)) {
            @unlink($this->tempFile);
        }
        parent::tearDown();
    }

    public function test_scans_clean_file_as_clean(): void
    {
        file_put_contents($this->tempFile, 'This is a safe and benign document.');

        $result = $this->scanner->scanFile($this->tempFile);

        $this->assertSame('clean', $result['status']);
        $this->assertNull($result['virus_name']);
        $this->assertNull($result['error_message']);
    }

    public function test_detects_eicar_standard_antivirus_signature(): void
    {
        $eicarString = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
        file_put_contents($this->tempFile, $eicarString);

        $result = $this->scanner->scanFile($this->tempFile);

        $this->assertSame('infected', $result['status']);
        $this->assertSame('Eicar-Test-Signature', $result['virus_name']);
        $this->assertStringContainsString('Malware detected', $result['error_message']);
    }
}
