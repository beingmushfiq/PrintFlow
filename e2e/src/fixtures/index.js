/**
 * PrintFlow Fixtures Index
 *
 * Provides ready-to-use Buffers, file paths, and generator functions for E2E tests.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createSamplePng,
  createSampleJpeg,
  createPasswordEncryptedPdf,
  createEicarTestString,
  writeAllFixturesToDisk,
} from './fixtureGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const FIXTURES_DIR = join(__dirname, 'files');

// Ensure disk fixtures are present
try {
  writeAllFixturesToDisk(FIXTURES_DIR);
} catch (e) {
  // Ignore if already written
}

export const FIXTURE_PATHS = {
  validSinglePagePdf: join(FIXTURES_DIR, 'valid-single-page.pdf'),
  validMultiPagePdf: join(FIXTURES_DIR, 'valid-multi-page.pdf'),
  corruptedHeaderPdf: join(FIXTURES_DIR, 'corrupted-header.pdf'),
  disguisedFakeExePdf: join(FIXTURES_DIR, 'disguised-fake-exe.pdf'),
  samplePng: join(FIXTURES_DIR, 'sample-image.png'),
  sampleJpg: join(FIXTURES_DIR, 'sample-image.jpg'),
  passwordEncryptedPdf: join(FIXTURES_DIR, 'password-encrypted.pdf'),
  eicarTest: join(FIXTURES_DIR, 'eicar-test.txt'),
};

export {
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createSamplePng,
  createSampleJpeg,
  createPasswordEncryptedPdf,
  createEicarTestString,
  writeAllFixturesToDisk,
};
