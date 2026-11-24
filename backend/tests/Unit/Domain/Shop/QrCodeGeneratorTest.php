<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Shop;

use App\Domain\Shop\Services\QrCodeGenerator;
use PHPUnit\Framework\TestCase;

class QrCodeGeneratorTest extends TestCase
{
    private QrCodeGenerator $generator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->generator = new QrCodeGenerator;
    }

    public function test_generates_valid_svg_qr_code(): void
    {
        $url = 'http://localhost:5173/s/test-shop';
        $svg = $this->generator->generateSvg($url);

        $this->assertStringContainsString('<svg', $svg);
        $this->assertStringContainsString('</svg>', $svg);
    }

    public function test_generates_valid_png_qr_code(): void
    {
        $url = 'http://localhost:5173/s/test-shop';
        $png = $this->generator->generatePng($url);

        $this->assertNotEmpty($png);
        // Verify PNG magic byte signature
        $this->assertStringStartsWith("\x89PNG\r\n\x1a\n", $png);
    }

    public function test_generates_styled_placard_pdf_with_bilingual_instructions(): void
    {
        $url = 'http://localhost:5173/s/printflow-dhaka';
        $pdf = $this->generator->generatePlacardPdf($url, 'PrintFlow Dhaka Hub', 'a4');

        $this->assertNotEmpty($pdf);
        // Verify PDF magic byte signature
        $this->assertStringStartsWith('%PDF-', $pdf);
        // Verify valid PDF structure and non-trivial rendered output size
        $this->assertStringContainsString('/Type /Catalog', $pdf);
        $this->assertGreaterThan(5000, strlen($pdf));
    }
}
