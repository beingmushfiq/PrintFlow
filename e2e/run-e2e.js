#!/usr/bin/env node

/**
 * PrintFlow Unified End-to-End Test Runner
 *
 * Executes test suites across Tier 1 (features), Tier 2 (boundaries),
 * Tier 3 (combinations), Tier 4 (scenarios), and harness smoke checks.
 *
 * CLI Usage:
 *   node run-e2e.js [--tier=1|2|3|4] [--all] [--filter=<pattern>] [--help] [file-path]
 */

import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const E2E_ROOT = __dirname;
const TESTS_ROOT = join(E2E_ROOT, 'tests');
const RESULTS_ROOT = join(E2E_ROOT, 'test-results');
const SUMMARY_FILE = join(RESULTS_ROOT, 'summary.json');

// --- CLI Argument Parsing ---
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: null,
    all: false,
    filter: null,
    help: false,
    customFile: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1].trim();
    } else if (arg === '--tier' || arg === '-t') {
      options.tier = args[++i];
    } else if (/^-t[1-4]$/.test(arg)) {
      options.tier = arg.slice(2);
    } else if (arg.startsWith('--filter=')) {
      options.filter = new RegExp(arg.split('=')[1].trim(), 'i');
    } else if (arg === '--filter' || arg === '-f') {
      options.filter = new RegExp(args[++i], 'i');
    } else if (!arg.startsWith('-')) {
      options.customFile = arg;
    }
  }

  if (!options.tier && !options.customFile) {
    options.all = true;
  }

  return options;
}

function printHelp() {
  console.log(`
PrintFlow Unified E2E Test Runner
=================================

Usage:
  node run-e2e.js [options] [path-to-test]

Options:
  --all                 Execute all test suites across all tiers (default)
  --tier=1, -t 1        Execute Tier 1 Feature Tests (tests/tier1-features/)
  --tier=2, -t 2        Execute Tier 2 Boundary Tests (tests/tier2-boundaries/)
  --tier=3, -t 3        Execute Tier 3 Combination Tests (tests/tier3-combinations/)
  --tier=4, -t 4        Execute Tier 4 Real-World Scenario Tests (tests/tier4-scenarios/)
  --filter=<regex>, -f  Filter test files or names by regular expression
  --help, -h            Show this help message

Outputs:
  Console: Formatted test execution output (node:test spec reporter)
  Report:  ${SUMMARY_FILE}
  Exit:    0 on all pass, 1 on any failure
`);
}

// --- Recursive Test Discovery ---
function discoverTestFiles(dir, fileList = []) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        discoverTestFiles(fullPath, fileList);
      } else if (
        /\.(test|spec)\.(js|mjs|ts)$/.test(entry) &&
        !entry.startsWith('.')
      ) {
        fileList.push(fullPath);
      }
    }
  } catch (err) {
    // Directory might not exist yet
  }
  return fileList;
}

// Determines the tier category from file path
function categorizeTier(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('tier1-features')) return 'tier1';
  if (normalized.includes('tier2-boundaries')) return 'tier2';
  if (normalized.includes('tier3-combinations')) return 'tier3';
  if (normalized.includes('tier4-scenarios')) return 'tier4';
  return 'harness';
}

// --- Main Execution ---
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('='.repeat(70));
  console.log(' PrintFlow E2E Test Runner');
  console.log(` Date: ${new Date().toISOString()}`);
  console.log(` Mode: ${options.customFile ? `Custom File (${options.customFile})` : (options.tier ? `Tier ${options.tier}` : 'All Suites')}`);
  console.log('='.repeat(70));

  let testFiles = [];

  if (options.customFile) {
    let resolvedPath = resolve(process.cwd(), options.customFile);
    if (!existsSync(resolvedPath)) {
      resolvedPath = resolve(E2E_ROOT, options.customFile);
    }
    testFiles = [resolvedPath];
  } else {
    const allFiles = discoverTestFiles(TESTS_ROOT);

    if (options.tier) {
      const targetFolder = `tier${options.tier}-`;
      testFiles = allFiles.filter((f) => f.includes(targetFolder));
    } else {
      // --all: includes all tiers and root test files in tests/
      testFiles = allFiles;
    }
  }

  if (options.filter) {
    testFiles = testFiles.filter((f) => options.filter.test(f));
  }

  testFiles.sort();

  console.log(`Discovered ${testFiles.length} test file(s):`);
  for (const f of testFiles) {
    console.log(`  • ${relative(E2E_ROOT, f)}`);
  }
  console.log('-'.repeat(70));

  if (testFiles.length === 0) {
    console.log('\n[NOTICE] No test files found matching criteria.');
    const emptySummary = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      success: true,
      tierBreakdown: {
        tier1: { total: 0, passed: 0, failed: 0 },
        tier2: { total: 0, passed: 0, failed: 0 },
        tier3: { total: 0, passed: 0, failed: 0 },
        tier4: { total: 0, passed: 0, failed: 0 },
        harness: { total: 0, passed: 0, failed: 0 },
      },
      failedTests: [],
      filesRun: [],
    };
    mkdirSync(RESULTS_ROOT, { recursive: true });
    writeFileSync(SUMMARY_FILE, JSON.stringify(emptySummary, null, 2), 'utf8');
    console.log(`Summary written to: ${SUMMARY_FILE}`);
    process.exit(0);
  }

  // Tracking structure
  const testResults = [];
  const failedTests = [];
  const tierBreakdown = {
    tier1: { total: 0, passed: 0, failed: 0 },
    tier2: { total: 0, passed: 0, failed: 0 },
    tier3: { total: 0, passed: 0, failed: 0 },
    tier4: { total: 0, passed: 0, failed: 0 },
    harness: { total: 0, passed: 0, failed: 0 },
  };

  const startTime = Date.now();

  // Run tests with native node:test
  const stream = run({
    files: testFiles,
    concurrency: false, // deterministic order
  });

  // Pipe visual reporter to stdout
  const reporterStream = stream.compose(new spec());
  reporterStream.pipe(process.stdout);

  // Collect test events
  stream.on('test:pass', (data) => {
    // Top-level suite or individual test
    const relFile = data.file ? relative(E2E_ROOT, data.file) : 'unknown';
    const tier = categorizeTier(relFile);
    const duration = data.details?.duration_ms || 0;

    tierBreakdown[tier].total++;
    tierBreakdown[tier].passed++;

    testResults.push({
      name: data.name,
      file: relFile,
      tier,
      status: 'passed',
      durationMs: duration,
    });
  });

  stream.on('test:fail', (data) => {
    const relFile = data.file ? relative(E2E_ROOT, data.file) : 'unknown';
    const tier = categorizeTier(relFile);
    const duration = data.details?.duration_ms || 0;
    const errorDetails = data.details?.error || {};

    tierBreakdown[tier].total++;
    tierBreakdown[tier].failed++;

    const failRecord = {
      name: data.name,
      file: relFile,
      tier,
      status: 'failed',
      durationMs: duration,
      error: {
        message: errorDetails.message || 'Assertion failed',
        code: errorDetails.code || null,
        stack: errorDetails.stack || null,
      },
    };

    testResults.push(failRecord);
    failedTests.push(failRecord);
  });

  // Wait for completion
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
    // If stream finishes via global summary event
    stream.on('test:summary', (data) => {
      if (!data?.file) {
        // Small tick to ensure all events drained
        setTimeout(resolve, 50);
      }
    });
  });

  const durationMs = Date.now() - startTime;
  const totalCount = testResults.length;
  const passCount = testResults.filter((t) => t.status === 'passed').length;
  const failCount = failedTests.length;
  const isSuccess = failCount === 0;

  // Generate JSON Report
  const summaryReport = {
    timestamp: new Date().toISOString(),
    totalTests: totalCount,
    passed: passCount,
    failed: failCount,
    skipped: 0,
    durationMs,
    success: isSuccess,
    tierBreakdown,
    failedTests: failedTests.map((f) => ({
      name: f.name,
      file: f.file,
      tier: f.tier,
      message: f.error?.message,
      stack: f.error?.stack,
    })),
    filesRun: testFiles.map((f) => relative(E2E_ROOT, f)),
    tests: testResults,
  };

  mkdirSync(RESULTS_ROOT, { recursive: true });
  writeFileSync(SUMMARY_FILE, JSON.stringify(summaryReport, null, 2), 'utf8');

  // Print Summary Table
  console.log('\n' + '='.repeat(70));
  console.log(' E2E Test Execution Summary');
  console.log('='.repeat(70));
  console.log(`Total Tests Run:  ${totalCount}`);
  console.log(`Passed:           ${passCount}`);
  console.log(`Failed:           ${failCount}`);
  console.log(`Total Duration:   ${(durationMs / 1000).toFixed(2)}s`);
  console.log('-'.repeat(70));
  console.log('Tier Breakdown:');
  console.log(`  • Harness Smoke Checks : ${tierBreakdown.harness.passed}/${tierBreakdown.harness.total} passed`);
  console.log(`  • Tier 1 (Features)    : ${tierBreakdown.tier1.passed}/${tierBreakdown.tier1.total} passed`);
  console.log(`  • Tier 2 (Boundaries)  : ${tierBreakdown.tier2.passed}/${tierBreakdown.tier2.total} passed`);
  console.log(`  • Tier 3 (Combinations): ${tierBreakdown.tier3.passed}/${tierBreakdown.tier3.total} passed`);
  console.log(`  • Tier 4 (Scenarios)   : ${tierBreakdown.tier4.passed}/${tierBreakdown.tier4.total} passed`);
  console.log('-'.repeat(70));
  console.log(`Report JSON: ${SUMMARY_FILE}`);
  console.log('='.repeat(70));

  if (!isSuccess) {
    console.error(`\n[FAILED] ${failCount} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\n[SUCCESS] All E2E test suites passed cleanly.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN RUNNER]:', err);
  process.exit(1);
});
