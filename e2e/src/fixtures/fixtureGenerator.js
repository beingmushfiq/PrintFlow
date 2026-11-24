/**
 * PrintFlow E2E Test Fixtures Generator
 *
 * Generates genuine, byte-accurate sample files for testing file validation,
 * page extraction, encryption detection, and antivirus quarantine pipelines.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a valid single-page PDF binary buffer (A4: 595.28 x 841.89 pt).
 * @returns {Buffer}
 */
export function createValidSinglePagePdf() {
  const content = 'BT /F1 18 Tf 50 780 Td (PrintFlow E2E Valid Single Page Document) Tj ET';
  const streamLength = Buffer.byteLength(content, 'utf8');

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${content}\nendstream\nendobj\n`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offset1 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj1;
  const offset2 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj2;
  const offset3 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj3;
  const offset4 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj4;
  const offset5 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj5;

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n0 6\n';
  pdf += '0000000000 65535 f \n';
  pdf += `${String(offset1).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset2).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset3).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset4).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset5).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

/**
 * Creates a valid multi-page PDF binary buffer with exact page count.
 * Default is 5 pages (for duplex odd-page testing).
 * @param {number} [pageCount=5]
 * @returns {Buffer}
 */
export function createValidMultiPagePdf(pageCount = 5) {
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];

  // obj 1: Catalog
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  // We need page object numbers: pages will be obj 3, 4, 5, ... (2 + pageCount)
  // Font will be obj (3 + pageCount)
  // Content streams will be obj (4 + pageCount) to (3 + 2*pageCount)
  const fontObjNum = 3 + pageCount;
  const pageKids = [];
  for (let i = 0; i < pageCount; i++) {
    pageKids.push(`${3 + i} 0 R`);
  }

  // obj 2: Pages
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += `2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${pageCount} >>\nendobj\n`;

  // Page objects (3 to 2+pageCount)
  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i;
    const contentObjNum = fontObjNum + 1 + i;
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj\n`;
  }

  // Font object
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += `${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  // Content streams
  for (let i = 0; i < pageCount; i++) {
    const contentObjNum = fontObjNum + 1 + i;
    const pageText = `BT /F1 16 Tf 50 780 Td (PrintFlow E2E Multi-Page Test - Page ${i + 1} of ${pageCount}) Tj ET`;
    const streamLen = Buffer.byteLength(pageText, 'utf8');
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${pageText}\nendstream\nendobj\n`;
  }

  const totalObjs = fontObjNum + pageCount;
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${totalObjs + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 0; i < totalObjs; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

/**
 * Creates a corrupted PDF where magic header is damaged/garbage.
 * @returns {Buffer}
 */
export function createCorruptedHeaderPdf() {
  const garbage = '!NOT_A_PDF_MAGIC_BYTES! This file has a .pdf extension but invalid header bytes.\x00\xFF\xFE\xFD';
  return Buffer.from(garbage, 'utf8');
}

/**
 * Creates a disguised Windows PE executable with .pdf extension (Scenario 3).
 * Magic bytes start with 'MZ' (DOS executable).
 * @returns {Buffer}
 */
export function createDisguisedExePdf() {
  const dosHeader = Buffer.alloc(128);
  // 'MZ' magic bytes
  dosHeader[0] = 0x4D;
  dosHeader[1] = 0x5A;
  dosHeader[2] = 0x90;
  dosHeader[3] = 0x00;
  dosHeader[4] = 0x03;
  // Offset to PE signature at 0x3C
  dosHeader.writeUInt32LE(0x80, 0x3C);

  const peHeader = Buffer.from('PE\x00\x00\x4c\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xe0\x00\x02\x01', 'binary');
  const dosStub = Buffer.from('This program cannot be run in DOS mode.\r\r\n$', 'utf8');

  return Buffer.concat([dosHeader, peHeader, dosStub]);
}

/**
 * Creates a valid 1x1 PNG image buffer.
 * Standard PNG signature: 89 50 4E 47 0D 0A 1A 0A
 * @returns {Buffer}
 */
export function createSamplePng() {
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG Header
    // IHDR chunk: 1x1 8-bit RGBA
    0x00, 0x00, 0x00, 0x0D, // Length 13
    0x49, 0x48, 0x44, 0x52, // 'IHDR'
    0x00, 0x00, 0x00, 0x01, // Width 1
    0x00, 0x00, 0x00, 0x01, // Height 1
    0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit, RGBA, deflate, no filter, no interlace
    0x1F, 0x15, 0xC4, 0x89, // CRC
    // IDAT chunk (compressed scanline)
    0x00, 0x00, 0x00, 0x0C, // Length 12
    0x49, 0x44, 0x41, 0x54, // 'IDAT'
    0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A,
    0x2D, 0xB4, 0x3F, 0x0B, // CRC
    // IEND chunk
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44, // 'IEND'
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);
}

/**
 * Creates a valid minimal JPEG image buffer.
 * Standard JPEG SOI: FF D8 FF E0 ... JFIF ... FF D9
 * @returns {Buffer}
 */
export function createSampleJpeg() {
  return Buffer.from([
    0xFF, 0xD8,                         // SOI
    0xFF, 0xE0, 0x00, 0x10,             // APP0 header length 16
    0x4A, 0x46, 0x49, 0x46, 0x00,       // 'JFIF\0'
    0x01, 0x01, 0x01,                   // Version 1.1, unit dpi
    0x00, 0x48, 0x00, 0x48,             // 72 x 72 dpi
    0x00, 0x00,                         // No thumbnail
    0xFF, 0xDB, 0x00, 0x43, 0x00,       // DQT
    ...new Array(64).fill(0x10),
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, // SOF0 (1x1)
    0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, // DHT
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, // SOS
    0xFF, 0xD9                          // EOI
  ]);
}

/**
 * Creates a valid PDF containing an /Encrypt dictionary.
 * Tools like Poppler pdfinfo will flag this as password-protected/encrypted.
 * @returns {Buffer}
 */
export function createPasswordEncryptedPdf() {
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n';
  // Standard PDF Encryption dictionary
  const obj4 = '4 0 obj\n<< /Filter /Standard /V 2 /R 3 /P -3904 /Length 128 /O <246D2967A601BE2694155184B3CF021E246D2967A601BE2694155184B3CF021E> /U <92F9EAE1065191C36675B6310237C39E00000000000000000000000000000000> >>\nendobj\n';

  const offset1 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj1;
  const offset2 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj2;
  const offset3 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj3;
  const offset4 = Buffer.byteLength(pdf, 'utf8');
  pdf += obj4;

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n0 5\n';
  pdf += '0000000000 65535 f \n';
  pdf += `${String(offset1).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset2).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset3).padStart(10, '0')} 00000 n \n`;
  pdf += `${String(offset4).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4> <A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

/**
 * Returns the standard EICAR test string for ClamAV virus detection testing (Scenario 28).
 * @returns {string}
 */
export function createEicarTestString() {
  return 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
}

/**
 * Writes all standard fixture files to disk at the given directory.
 * @param {string} targetDir
 */
export function writeAllFixturesToDisk(targetDir) {
  mkdirSync(targetDir, { recursive: true });

  writeFileSync(join(targetDir, 'valid-single-page.pdf'), createValidSinglePagePdf());
  writeFileSync(join(targetDir, 'valid-multi-page.pdf'), createValidMultiPagePdf(5));
  writeFileSync(join(targetDir, 'corrupted-header.pdf'), createCorruptedHeaderPdf());
  writeFileSync(join(targetDir, 'disguised-fake-exe.pdf'), createDisguisedExePdf());
  writeFileSync(join(targetDir, 'sample-image.png'), createSamplePng());
  writeFileSync(join(targetDir, 'sample-image.jpg'), createSampleJpeg());
  writeFileSync(join(targetDir, 'password-encrypted.pdf'), createPasswordEncryptedPdf());
  writeFileSync(join(targetDir, 'eicar-test.txt'), createEicarTestString());
}
