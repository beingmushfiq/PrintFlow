<?php

declare(strict_types=1);

namespace App\Domain\Shop\Services;

use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Output\QRGdImagePNG;
use chillerlan\QRCode\Output\QRMarkupSVG;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Dompdf\Dompdf;
use Dompdf\Options;

class QrCodeGenerator
{
    /**
     * Generate pure SVG QR code string.
     */
    public function generateSvg(string $url): string
    {
        $options = new QROptions([
            'outputInterface' => QRMarkupSVG::class,
            'outputBase64' => false,
            'eccLevel' => EccLevel::H,
            'addQuietzone' => true,
            'scale' => 6,
        ]);

        return (new QRCode($options))->render($url);
    }

    /**
     * Generate 300 DPI high-contrast PNG QR code binary string.
     */
    public function generatePng(string $url, int $scale = 12): string
    {
        $options = new QROptions([
            'outputInterface' => QRGdImagePNG::class,
            'outputBase64' => false,
            'eccLevel' => EccLevel::H,
            'addQuietzone' => true,
            'scale' => $scale,
        ]);

        return (new QRCode($options))->render($url);
    }

    /**
     * Generate styled bilingual A4/A5 PDF placard.
     */
    public function generatePlacardPdf(string $url, string $shopName, string $paperSize = 'a4'): string
    {
        $pngBytes = $this->generatePng($url, 14);
        $base64Qr = base64_encode($pngBytes);

        $paper = strtolower($paperSize) === 'a5' ? 'a5' : 'a4';

        $html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>PrintFlow Counter Placard</title>
    <style>
        @page {
            margin: 20mm;
            size: {$paper} portrait;
        }
        body {
            font-family: 'DejaVu Sans', 'Helvetica', sans-serif;
            margin: 0;
            padding: 0;
            color: #121820;
            text-align: center;
            background-color: #ffffff;
        }
        .placard-container {
            border: 4px solid #245BDB;
            border-radius: 16px;
            padding: 30px 20px;
            height: 92%;
            box-sizing: border-box;
            background-color: #F7F8FA;
        }
        .brand-badge {
            display: inline-block;
            background-color: #245BDB;
            color: #ffffff;
            font-size: 13px;
            font-weight: bold;
            padding: 6px 16px;
            border-radius: 20px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 12px;
        }
        .shop-name {
            font-size: 28px;
            font-weight: bold;
            color: #121820;
            margin: 8px 0 16px 0;
        }
        .instruction-en {
            font-size: 20px;
            font-weight: bold;
            color: #245BDB;
            margin: 10px 0 6px 0;
        }
        .instruction-bn {
            font-size: 17px;
            color: #4A5568;
            margin: 4px 0 20px 0;
        }
        .qr-wrapper {
            background-color: #ffffff;
            display: inline-block;
            padding: 18px;
            border-radius: 16px;
            border: 2px solid #E2E6EC;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            margin: 10px auto;
        }
        .qr-image {
            width: 250px;
            height: 250px;
            display: block;
        }
        .steps-container {
            margin: 24px auto 16px auto;
            max-width: 420px;
            text-align: left;
            background: #ffffff;
            border: 1px solid #E2E6EC;
            border-radius: 12px;
            padding: 14px 20px;
        }
        .step-item {
            font-size: 13px;
            color: #2D3748;
            margin: 6px 0;
            line-height: 1.4;
        }
        .step-num {
            display: inline-block;
            width: 20px;
            height: 20px;
            line-height: 20px;
            background-color: #EAF0FF;
            color: #245BDB;
            border-radius: 50%;
            text-align: center;
            font-weight: bold;
            font-size: 11px;
            margin-right: 8px;
        }
        .url-box {
            margin-top: 16px;
            font-family: monospace;
            font-size: 13px;
            color: #718096;
            word-break: break-all;
        }
        .footer-note {
            margin-top: 14px;
            font-size: 11px;
            color: #A0AEC0;
        }
    </style>
</head>
<body>
    <div class="placard-container">
        <div class="brand-badge">
            <svg style="vertical-align: middle; margin-right: 6px; width: 16px; height: 16px; display: inline-block;" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="64" height="64" rx="15" fill="#FFFFFF"/>
                <path d="M22 13C22 11.8954 22.8954 11 24 11H40C41.1046 11 42 11.8954 42 13V22H22V13Z" fill="#245BDB" fill-opacity="0.85"/>
                <rect x="13" y="21" width="38" height="15" rx="4.5" fill="#0C1427"/>
                <circle cx="18.5" cy="28.5" r="2" fill="#10B981"/>
                <rect x="24" y="27.5" width="21" height="2" rx="1" fill="#FFFFFF" fill-opacity="0.35"/>
                <path d="M17.5 29C17.5 28.4477 17.9477 28 18.5 28H45.5C46.0523 28 46.5 28.4477 46.5 29V44.5C46.5 46.433 44.933 48 43 48H21C19.067 48 17.5 46.433 17.5 44.5V29Z" fill="#245BDB"/>
                <rect x="22" y="33.5" width="20" height="3" rx="1.5" fill="#FFFFFF"/>
                <rect x="22" y="38.5" width="13" height="3" rx="1.5" fill="#00D2FF"/>
            </svg>
            <span>PrintFlow Instant Counter</span>
        </div>
        <div class="shop-name">{$shopName}</div>

        <div class="instruction-en">Scan to upload &amp; print instantly</div>
        <div class="instruction-bn">সহজে আপলোড ও প্রিন্ট করতে স্ক্যান করুন</div>

        <div class="qr-wrapper">
            <img class="qr-image" src="data:image/png;base64,{$base64Qr}" alt="Storefront QR Code" />
        </div>

        <div class="steps-container">
            <div class="step-item"><span class="step-num">1</span> Scan QR code with any phone camera</div>
            <div class="step-item"><span class="step-num">2</span> Enter mobile number &amp; select files (PDF, PNG, JPG)</div>
            <div class="step-item"><span class="step-num">3</span> Confirm instant quote and collect prints at counter</div>
        </div>

        <div class="url-box">{$url}</div>
        <div class="footer-note">No App Required • Secure End-to-End Walk-in Print System</div>
    </div>
</body>
</html>
HTML;

        $options = new Options;
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', true);
        $options->set('defaultFont', 'DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper($paper, 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }
}
