<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Upload;

use App\Domain\Upload\Services\PdfMetricsService;
use PHPUnit\Framework\TestCase;

class PdfMetricsTest extends TestCase
{
    private PdfMetricsService $service;

    private string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new PdfMetricsService;
        $this->tempDir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'pdf_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $files = glob($this->tempDir.DIRECTORY_SEPARATOR.'*');
        foreach ($files as $file) {
            @unlink($file);
        }
        @rmdir($this->tempDir);
        parent::tearDown();
    }

    public function test_counts_pages_in_multipage_pdf(): void
    {
        $filePath = $this->tempDir.'/multipage.pdf';
        $content = "%PDF-1.4\n"
            ."1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            ."2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n"
            ."3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n"
            ."4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n"
            ."5 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n"
            ."xref\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        file_put_contents($filePath, $content);

        $result = $this->service->inspect($filePath);

        $this->assertNull($result['error']);
        $this->assertSame(3, $result['page_count']);
        $this->assertFalse($result['is_encrypted']);
    }

    public function test_detects_and_rejects_encrypted_pdf(): void
    {
        $filePath = $this->tempDir.'/encrypted.pdf';
        $content = "%PDF-1.4\n"
            ."1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            ."2 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\n"
            ."3 0 obj\n<< /Filter /Standard /V 2 /R 3 /O (hash) /U (hash) >>\nendobj\n"
            ."trailer\n<< /Root 1 0 R /Encrypt 3 0 R >>\n%%EOF";
        file_put_contents($filePath, $content);

        $result = $this->service->inspect($filePath);

        $this->assertTrue($result['is_encrypted']);
        $this->assertNotNull($result['error']);
        $this->assertStringContainsString('encrypted', strtolower($result['error']));
    }

    public function test_enforces_maximum_page_ceiling_of_100_pages(): void
    {
        $filePath = $this->tempDir.'/oversized.pdf';
        $content = "%PDF-1.4\n"
            ."1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            ."2 0 obj\n<< /Type /Pages /Count 105 >>\nendobj\n"
            ."trailer\n<< /Root 1 0 R >>\n%%EOF";
        file_put_contents($filePath, $content);

        $result = $this->service->inspect($filePath);

        $this->assertSame(105, $result['page_count']);
        $this->assertNotNull($result['error']);
        $this->assertStringContainsString('maximum limit of 100 pages', $result['error']);
    }

    public function test_inspects_image_dimensions(): void
    {
        $filePath = $this->tempDir.'/sample.png';
        // Create 200x100 transparent image
        $img = imagecreatetruecolor(200, 100);
        imagepng($img, $filePath);

        $result = $this->service->inspectImage($filePath);

        $this->assertNull($result['error']);
        $this->assertSame(1, $result['page_count']);
        $this->assertSame(200, $result['width_px']);
        $this->assertSame(100, $result['height_px']);
    }

    public function test_rejects_corrupted_pdf_body_missing_structural_markers(): void
    {
        $filePath = $this->tempDir.'/corrupted_body.pdf';
        // Has %PDF- prefix to pass MIME validation, but body contains random garbage without obj/trailer/xref
        $content = "%PDF-1.4\n".random_bytes(256)."\n%%EOF";
        file_put_contents($filePath, $content);

        $result = $this->service->inspect($filePath);

        $this->assertSame(0, $result['page_count']);
        $this->assertNotNull($result['error']);
        $this->assertStringContainsString('corrupted or truncated', strtolower($result['error']));
    }

    public function test_accepts_valid_minimal_pdf_with_structural_markers(): void
    {
        $filePath = $this->tempDir.'/minimal_valid.pdf';
        $content = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        file_put_contents($filePath, $content);

        $result = $this->service->inspect($filePath);

        $this->assertNull($result['error']);
        $this->assertSame(1, $result['page_count']);
    }
}
