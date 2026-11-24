<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Upload;

use App\Domain\Upload\Services\MimeValidator;
use PHPUnit\Framework\TestCase;

class MimeValidatorTest extends TestCase
{
    private MimeValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = new MimeValidator;
    }

    public function test_validates_genuine_pdf_magic_bytes(): void
    {
        $pdfBytes = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF";
        $result = $this->validator->inspectBytes($pdfBytes);

        $this->assertTrue($result['valid']);
        $this->assertSame('application/pdf', $result['mime']);
        $this->assertSame('pdf', $result['extension']);
        $this->assertNull($result['error']);
    }

    public function test_validates_genuine_png_magic_bytes(): void
    {
        $pngBytes = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00";
        $result = $this->validator->inspectBytes($pngBytes);

        $this->assertTrue($result['valid']);
        $this->assertSame('image/png', $result['mime']);
        $this->assertSame('png', $result['extension']);
        $this->assertNull($result['error']);
    }

    public function test_validates_genuine_jpeg_magic_bytes(): void
    {
        $jpegBytes = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00\x60\x00\x60\x00\x00";
        $result = $this->validator->inspectBytes($jpegBytes);

        $this->assertTrue($result['valid']);
        $this->assertSame('image/jpeg', $result['mime']);
        $this->assertSame('jpg', $result['extension']);
        $this->assertNull($result['error']);
    }

    public function test_rejects_disguised_or_malicious_executables(): void
    {
        // Windows PE executable header (MZ)
        $exeBytes = "MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF\x00\x00";
        $result = $this->validator->inspectBytes($exeBytes);

        $this->assertFalse($result['valid']);
        $this->assertNotNull($result['error']);

        // Linux ELF binary
        $elfBytes = "\x7FELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00";
        $result = $this->validator->inspectBytes($elfBytes);

        $this->assertFalse($result['valid']);
    }

    public function test_rejects_empty_or_too_small_payload(): void
    {
        $result = $this->validator->inspectBytes('short');
        $this->assertFalse($result['valid']);
        $this->assertStringContainsString('too small', $result['error']);
    }
}
