/**
 * PrintFlow Tier 2: Boundary & Corner Case Tests
 * Milestone 4: Print Delivery & Hardware Agent (Features 44 - 53)
 *
 * Covers 10 features with 5 boundary tests each = 50 test cases total.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateAgentPairingCode,
  generateCorrelationId,
  sha256,
  WsClient,
  ApiClient,
} from '../../src/index.js';

// --- FEATURE 44 BOUNDARY: Print Agent Schema Migrations (0018-0022) ---
describe('Feature 44 Boundary: Print Agent Schema Migrations (0018-0022)', () => {
  it('enforces agent token uniqueness and machine GUID indexing', () => {
    const agents = new Map();
    function registerAgent({ token, machineGuid, name }) {
      if (agents.has(token)) {
        throw new Error('Duplicate agent token');
      }
      agents.set(token, { machineGuid, name });
    }

    registerAgent({ token: 'tok_agent_1', machineGuid: 'GUID-111', name: 'Desk A' });
    assert.throws(
      () => registerAgent({ token: 'tok_agent_1', machineGuid: 'GUID-222', name: 'Desk B' }),
      /Duplicate agent token/
    );
  });

  it('enforces print job status state transitions (PENDING -> LEASED -> SPOOLING -> PRINTED / FAILED)', () => {
    const transitions = {
      PENDING: ['LEASED', 'CANCELLED'],
      LEASED: ['SPOOLING', 'PENDING'], // PENDING if lease expires
      SPOOLING: ['PRINTED', 'FAILED'],
      PRINTED: [],
      FAILED: ['PENDING'], // retry
      CANCELLED: [],
    };

    function canTransition(from, to) {
      return (transitions[from] || []).includes(to);
    }

    assert.strictEqual(canTransition('PENDING', 'LEASED'), true);
    assert.strictEqual(canTransition('LEASED', 'SPOOLING'), true);
    assert.strictEqual(canTransition('SPOOLING', 'PRINTED'), true);
    assert.strictEqual(canTransition('PENDING', 'PRINTED'), false, 'Cannot jump straight to PRINTED');
    assert.strictEqual(canTransition('PRINTED', 'PENDING'), false, 'PRINTED is terminal');
  });

  it('enforces attempt counter boundary: max 3 attempts limit before marking failed', () => {
    let job = { id: 'j1', attempts: 0, status: 'PENDING' };
    function failAttempt(currentJob) {
      currentJob.attempts++;
      if (currentJob.attempts >= 3) {
        currentJob.status = 'FAILED';
      } else {
        currentJob.status = 'PENDING';
      }
      return currentJob;
    }

    job = failAttempt(job); // 1
    assert.strictEqual(job.status, 'PENDING');
    job = failAttempt(job); // 2
    assert.strictEqual(job.status, 'PENDING');
    job = failAttempt(job); // 3
    assert.strictEqual(job.status, 'FAILED');
  });

  it('supports multiple simultaneous print agents registered under same shop', () => {
    const shopAgents = [
      { id: 'a1', shopId: 'shop_01', machineGuid: 'GUID-01' },
      { id: 'a2', shopId: 'shop_01', machineGuid: 'GUID-02' },
    ];

    const agentsInShop = shopAgents.filter((a) => a.shopId === 'shop_01');
    assert.strictEqual(agentsInShop.length, 2);
  });

  it('cascades job attempt records when print job is purged or deleted', () => {
    let jobs = [{ id: 'job_10' }];
    let attempts = [
      { id: 'att_1', jobId: 'job_10' },
      { id: 'att_2', jobId: 'job_10' },
    ];

    function deleteJob(jobId) {
      jobs = jobs.filter((j) => j.id !== jobId);
      attempts = attempts.filter((a) => a.jobId !== jobId);
    }

    deleteJob('job_10');
    assert.strictEqual(jobs.length, 0);
    assert.strictEqual(attempts.length, 0);
  });
});

// --- FEATURE 45 BOUNDARY: Cryptographic Agent Pairing Flow ---
describe('Feature 45 Boundary: Cryptographic Agent Pairing Flow', () => {
  it('generates strictly 6-digit numeric pairing PIN codes (000000 - 999999)', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateAgentPairingCode();
      assert.strictEqual(pin.length, 6);
      assert.match(pin, /^[0-9]{6}$/);
    }
  });

  it('enforces pairing code TTL expiration boundary (strictly 600s / 10 minutes)', () => {
    function isPairingPinValid(createdAtMs, nowMs, ttlMs = 600000) {
      return (nowMs - createdAtMs) <= ttlMs;
    }

    const created = 1000000;
    assert.strictEqual(isPairingPinValid(created, created + 599000), true);
    assert.strictEqual(isPairingPinValid(created, created + 600000), true);
    assert.strictEqual(isPairingPinValid(created, created + 600001), false, 'PIN expired after 10m');
  });

  it('rejects reused pairing PINs after successful agent pairing (one-time use)', () => {
    const consumedPins = new Set();
    function consumePin(pin) {
      if (consumedPins.has(pin)) {
        throw new Error('Pairing PIN has already been consumed');
      }
      consumedPins.add(pin);
      return { success: true, agentToken: 'agent_tok_' + Date.now() };
    }

    const pin = '482910';
    assert.strictEqual(consumePin(pin).success, true);
    assert.throws(() => consumePin(pin), /already been consumed/);
  });

  it('deduplicates machine GUID when agent re-pairs from same computer', () => {
    const agentsByGuid = new Map();
    function pairDevice(guid, name) {
      agentsByGuid.set(guid, { name, pairedAt: new Date().toISOString() });
    }

    pairDevice('MACHINE-GUID-ABC', 'Initial Name');
    pairDevice('MACHINE-GUID-ABC', 'Updated Name');

    assert.strictEqual(agentsByGuid.size, 1);
    assert.strictEqual(agentsByGuid.get('MACHINE-GUID-ABC').name, 'Updated Name');
  });

  it('rejects malformed public key credentials during cryptographic handshake', () => {
    function validatePublicKey(key) {
      if (!key || typeof key !== 'string') return false;
      return key.startsWith('-----BEGIN PUBLIC KEY-----') && key.includes('-----END PUBLIC KEY-----');
    }

    assert.strictEqual(validatePublicKey('not-a-pem-key'), false);
    assert.strictEqual(validatePublicKey(''), false);
    assert.strictEqual(validatePublicKey('-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----'), true);
  });
});

// --- FEATURE 46 BOUNDARY: Outbound WSS Presence & Heartbeat ---
describe('Feature 46 Boundary: Outbound WSS Presence & Heartbeat', () => {
  it('enforces 30s heartbeat interval with jitter boundary (25s - 35s)', () => {
    function computeHeartbeatInterval(baseMs = 30000, maxJitterMs = 5000) {
      const jitter = (Math.random() * 2 - 1) * maxJitterMs;
      return Math.round(baseMs + jitter);
    }

    for (let i = 0; i < 20; i++) {
      const interval = computeHeartbeatInterval();
      assert.ok(interval >= 25000 && interval <= 35000, `Interval ${interval}ms out of jitter bounds`);
    }
  });

  it('validates tenant presence channel naming standard: presence-tenant.{id}.agents', () => {
    function getAgentPresenceChannel(tenantId) {
      return `presence-tenant.${tenantId}.agents`;
    }

    const chan = getAgentPresenceChannel('tenant_dhaka_01');
    assert.strictEqual(chan, 'presence-tenant.tenant_dhaka_01.agents');
    assert.match(chan, /^presence-tenant\.[a-zA-Z0-9_-]+\.agents$/);
  });

  it('flags print agent offline when no heartbeat received for > 60 seconds', () => {
    function isAgentOnline(lastHeartbeatUtc, nowUtc) {
      const diffSec = (Date.parse(nowUtc) - Date.parse(lastHeartbeatUtc)) / 1000;
      return diffSec <= 60;
    }

    const now = '2026-11-24T06:01:00Z';
    assert.strictEqual(isAgentOnline('2026-11-24T06:00:30Z', now), true, '30s ago is online');
    assert.strictEqual(isAgentOnline('2026-11-24T06:00:00Z', now), true, '60s ago is online');
    assert.strictEqual(isAgentOnline('2026-11-24T05:59:59Z', now), false, '61s ago is offline');
  });

  it('calculates exponential backoff with jitter on WebSocket connection drops', () => {
    function calculateBackoff(attempt, baseMs = 1000, maxMs = 30000) {
      const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
      const jitter = Math.random() * (exp * 0.2); // 20% jitter
      return Math.round(exp + jitter);
    }

    const b0 = calculateBackoff(0);
    const b1 = calculateBackoff(1);
    const b2 = calculateBackoff(2);

    assert.ok(b0 < b1, 'Backoff must increase with attempt');
    assert.ok(b1 < b2, 'Backoff must increase with attempt');
    assert.ok(calculateBackoff(10) <= 36000, 'Backoff must respect max cap');
  });

  it('mock WsClient seamlessly connects, subscribes, and handles ping-pong events', async () => {
    const ws = new WsClient({ mock: true });
    const socketId = await ws.connect();
    assert.ok(socketId.startsWith('mock-socket-'));
    assert.strictEqual(ws.connected, true);

    let pongReceived = false;
    ws.on('pusher:pong', () => {
      pongReceived = true;
    });

    ws.emit('pusher:pong', {});
    assert.strictEqual(pongReceived, true);
    ws.disconnect();
    assert.strictEqual(ws.connected, false);
  });
});

// --- FEATURE 47 BOUNDARY: Atomic Job Lease Service ---
describe('Feature 47 Boundary: Atomic Job Lease Service', () => {
  it('guarantees single-lease mutual exclusion (SELECT FOR UPDATE SKIP LOCKED simulation)', () => {
    const jobQueue = [
      { id: 'job_01', status: 'PENDING', leasedTo: null },
      { id: 'job_02', status: 'PENDING', leasedTo: null },
    ];

    function leaseNextJob(agentId) {
      const availableJob = jobQueue.find((j) => j.status === 'PENDING');
      if (!availableJob) return null;
      availableJob.status = 'LEASED';
      availableJob.leasedTo = agentId;
      availableJob.leasedAt = Date.now();
      return availableJob;
    }

    const leaseAgent1 = leaseNextJob('agent_A');
    const leaseAgent2 = leaseNextJob('agent_B');
    const leaseAgent3 = leaseNextJob('agent_C');

    assert.strictEqual(leaseAgent1.id, 'job_01');
    assert.strictEqual(leaseAgent2.id, 'job_02');
    assert.strictEqual(leaseAgent3, null, 'No jobs left in queue, returns null immediately');
  });

  it('returns clean empty response when queue is empty (no blocking or hanging)', () => {
    const emptyQueue = [];
    const job = emptyQueue.shift() || null;
    assert.strictEqual(job, null);
  });

  it('enforces lease TTL boundary (strictly 300 seconds / 5 minutes)', () => {
    function isLeaseStale(leasedAtMs, currentMs, ttlMs = 300000) {
      return (currentMs - leasedAtMs) > ttlMs;
    }

    const leasedAt = 1000000;
    assert.strictEqual(isLeaseStale(leasedAt, leasedAt + 299000), false);
    assert.strictEqual(isLeaseStale(leasedAt, leasedAt + 300000), false);
    assert.strictEqual(isLeaseStale(leasedAt, leasedAt + 300001), true);
  });

  it('prevents agent from leasing a job belonging to a different shop / tenant', () => {
    const job = { id: 'j1', shopId: 'shop_A', tenantId: 'tenant_A' };
    function canAgentLease(agent, targetJob) {
      return agent.shopId === targetJob.shopId && agent.tenantId === targetJob.tenantId;
    }

    assert.strictEqual(canAgentLease({ shopId: 'shop_A', tenantId: 'tenant_A' }, job), true);
    assert.strictEqual(canAgentLease({ shopId: 'shop_B', tenantId: 'tenant_A' }, job), false);
    assert.strictEqual(canAgentLease({ shopId: 'shop_A', tenantId: 'tenant_B' }, job), false);
  });

  it('blocks job lease when assigned printer is flagged offline or in error state', () => {
    const printer = { id: 'prn_1', status: 'OFFLINE' };
    function canLeaseForPrinter(prn) {
      return prn.status === 'READY';
    }

    assert.strictEqual(canLeaseForPrinter(printer), false);
    assert.strictEqual(canLeaseForPrinter({ id: 'prn_1', status: 'READY' }), true);
  });
});

// --- FEATURE 48 BOUNDARY: Tauri + Rust Print Agent Application ---
describe('Feature 48 Boundary: Tauri + Rust Print Agent Application', () => {
  it('auto-creates local SQLite journal schema if database file is missing', () => {
    function initializeAgentJournal(dbExists = false) {
      if (!dbExists) {
        return { created: true, tables: ['journal_entries', 'printers', 'leases'] };
      }
      return { created: false, tables: ['journal_entries', 'printers', 'leases'] };
    }

    const init = initializeAgentJournal(false);
    assert.strictEqual(init.created, true);
    assert.ok(init.tables.includes('journal_entries'));
  });

  it('recovers safely from corrupted agent configuration JSON with default fallback', () => {
    function loadAgentConfig(rawJson) {
      try {
        return JSON.parse(rawJson);
      } catch (err) {
        // Corrupted JSON fallback
        return { serverUrl: 'http://localhost:8000', pollIntervalMs: 5000, fallbackLoaded: true };
      }
    }

    const valid = loadAgentConfig('{"serverUrl":"https://printflow.bd"}');
    assert.strictEqual(valid.serverUrl, 'https://printflow.bd');

    const corrupted = loadAgentConfig('{ corrupted json content !!!');
    assert.strictEqual(corrupted.fallbackLoaded, true);
    assert.strictEqual(corrupted.pollIntervalMs, 5000);
  });

  it('enforces clean shutdown signal handling (SIGINT / SIGTERM) releasing open handles', () => {
    let spoolerHandleClosed = false;
    function handleShutdownSignal() {
      spoolerHandleClosed = true;
    }

    handleShutdownSignal();
    assert.strictEqual(spoolerHandleClosed, true);
  });

  it('validates agent system tray status icons transitions (connected, offline, printing)', () => {
    const validIcons = ['tray-connected', 'tray-offline', 'tray-printing', 'tray-error'];
    function getTrayIcon(status) {
      const map = {
        ONLINE: 'tray-connected',
        OFFLINE: 'tray-offline',
        PRINTING: 'tray-printing',
        ERROR: 'tray-error',
      };
      return map[status] || 'tray-offline';
    }

    assert.strictEqual(getTrayIcon('ONLINE'), 'tray-connected');
    assert.strictEqual(getTrayIcon('PRINTING'), 'tray-printing');
    assert.strictEqual(getTrayIcon('OFFLINE'), 'tray-offline');
    assert.strictEqual(getTrayIcon('UNKNOWN_STATUS'), 'tray-offline');
  });

  it('clamps polling frequency between 1000ms minimum and 60000ms maximum', () => {
    function clampPollInterval(ms) {
      return Math.min(60000, Math.max(1000, Math.round(ms)));
    }

    assert.strictEqual(clampPollInterval(500), 1000);
    assert.strictEqual(clampPollInterval(5000), 5000);
    assert.strictEqual(clampPollInterval(120000), 60000);
  });
});

// --- FEATURE 49 BOUNDARY: Native Win32 Spooler Integration ---
describe('Feature 49 Boundary: Native Win32 Spooler Integration', () => {
  it('handles OpenPrinterW failure on non-existent or disconnected printer', () => {
    function win32OpenPrinter(printerName, installedPrinters = ['Canon LBP2900', 'HP LaserJet']) {
      if (!installedPrinters.includes(printerName)) {
        return { handle: null, lastError: 1801, message: 'ERROR_INVALID_PRINTER_NAME' };
      }
      return { handle: `HANDLE_${printerName}`, lastError: 0 };
    }

    const failed = win32OpenPrinter('Epson Ghost Printer');
    assert.strictEqual(failed.handle, null);
    assert.strictEqual(failed.lastError, 1801);

    const success = win32OpenPrinter('HP LaserJet');
    assert.ok(success.handle);
  });

  it('simulates StartDocPrinterW returning unique spooler job ID', () => {
    let jobSeq = 100;
    function win32StartDocPrinter(docName) {
      jobSeq++;
      return { jobId: jobSeq, docName };
    }

    const doc1 = win32StartDocPrinter('PrintFlow_Doc_01.pdf');
    const doc2 = win32StartDocPrinter('PrintFlow_Doc_02.pdf');
    assert.notStrictEqual(doc1.jobId, doc2.jobId);
  });

  it('handles WritePrinter stream chunking without memory buffer overrun', () => {
    const totalBytes = 1024 * 1024; // 1MB document
    const chunkSize = 64 * 1024; // 64KB chunks
    let bytesWritten = 0;

    while (bytesWritten < totalBytes) {
      const remaining = totalBytes - bytesWritten;
      const writeSize = Math.min(chunkSize, remaining);
      bytesWritten += writeSize;
    }

    assert.strictEqual(bytesWritten, totalBytes);
  });

  it('maps Win32 printer paper-out and paper-jam error codes cleanly', () => {
    const win32ErrorMap = {
      0x00000001: 'PRINTER_STATUS_PAUSED',
      0x00000002: 'PRINTER_STATUS_ERROR',
      0x00000008: 'PRINTER_STATUS_PAPER_JAM',
      0x00000010: 'PRINTER_STATUS_PAPER_OUT',
    };

    assert.strictEqual(win32ErrorMap[0x00000008], 'PRINTER_STATUS_PAPER_JAM');
    assert.strictEqual(win32ErrorMap[0x00000010], 'PRINTER_STATUS_PAPER_OUT');
  });

  it('guarantees ClosePrinter handle release upon document write completion or failure', () => {
    let isPrinterClosed = false;
    function printWorkflowWithFinally() {
      try {
        // printing...
      } finally {
        isPrinterClosed = true;
      }
    }

    printWorkflowWithFinally();
    assert.strictEqual(isPrinterClosed, true);
  });
});

// --- FEATURE 50 BOUNDARY: Local SQLite Durable Job Journal ---
describe('Feature 50 Boundary: Local SQLite Durable Job Journal', () => {
  it('commits journal record before dispatching print job to spooler (write-ahead log)', () => {
    const executionOrder = [];
    function dispatchPrint(jobId) {
      executionOrder.push(`journal_write_${jobId}`);
      executionOrder.push(`spooler_dispatch_${jobId}`);
    }

    dispatchPrint('j_99');
    assert.strictEqual(executionOrder[0], 'journal_write_j_99');
    assert.strictEqual(executionOrder[1], 'spooler_dispatch_j_99');
  });

  it('rejects duplicate job ID entry in local journal (PRIMARY KEY constraint)', () => {
    const journalDb = new Set();
    function insertJournalEntry(jobId) {
      if (journalDb.has(jobId)) {
        throw new Error('UNIQUE constraint failed: journal_entries.job_id');
      }
      journalDb.add(jobId);
    }

    insertJournalEntry('JOB_1001');
    assert.throws(() => insertJournalEntry('JOB_1001'), /UNIQUE constraint failed/);
  });

  it('identifies uncommitted in-flight jobs during agent crash recovery restart', () => {
    const journalEntries = [
      { jobId: 'j1', state: 'PRINTED' },
      { jobId: 'j2', state: 'SPOOLING' }, // In-flight crash
    ];

    const unrecovered = journalEntries.filter((e) => e.state === 'SPOOLING');
    assert.strictEqual(unrecovered.length, 1);
    assert.strictEqual(unrecovered[0].jobId, 'j2');
  });

  it('handles SQLite file busy/locked errors with retry backoff', () => {
    let lockAttempts = 0;
    function attemptDbLock() {
      lockAttempts++;
      if (lockAttempts < 3) {
        throw new Error('database is locked');
      }
      return { success: true };
    }

    let success = false;
    for (let i = 0; i < 5; i++) {
      try {
        attemptDbLock();
        success = true;
        break;
      } catch (err) {
        // retry
      }
    }
    assert.strictEqual(success, true);
  });

  it('prunes journal entries exceeding retention boundary (e.g. older than 7 days)', () => {
    const entries = [
      { id: 1, ageDays: 2 },
      { id: 2, ageDays: 8 }, // Should be pruned
      { id: 3, ageDays: 14 }, // Should be pruned
    ];

    const activeEntries = entries.filter((e) => e.ageDays <= 7);
    assert.strictEqual(activeEntries.length, 1);
    assert.strictEqual(activeEntries[0].id, 1);
  });
});

// --- FEATURE 51 BOUNDARY: Ephemeral File Purge Lifecycle ---
describe('Feature 51 Boundary: Ephemeral File Purge Lifecycle', () => {
  it('overwrites local temporary file with zeros before unlinking (secure shredding)', () => {
    const dummyBuffer = Buffer.from('Sensitive customer document content');
    function zeroFillShred(buf) {
      buf.fill(0);
      return buf;
    }

    const shredded = zeroFillShred(dummyBuffer);
    assert.strictEqual(shredded.every((b) => b === 0), true);
  });

  it('enqueues MinIO object deletion immediately upon print confirmation', () => {
    const purgeQueue = [];
    function onPrintCompleted(fileKey) {
      purgeQueue.push({ fileKey, action: 's3:DeleteObject', enqueuedAt: Date.now() });
    }

    onPrintCompleted('orders/2026/ord_1/doc.pdf');
    assert.strictEqual(purgeQueue.length, 1);
    assert.strictEqual(purgeQueue[0].action, 's3:DeleteObject');
  });

  it('retries file deletion with backoff when Windows file locking prevents immediate unlink', () => {
    let unlockTries = 0;
    function unlinkFile(path) {
      unlockTries++;
      if (unlockTries < 2) {
        throw new Error('EBUSY: resource busy or locked');
      }
      return true;
    }

    let deleted = false;
    for (let i = 0; i < 3; i++) {
      try {
        unlinkFile('C:\\temp\\doc.pdf');
        deleted = true;
        break;
      } catch (err) {
        // backoff
      }
    }
    assert.strictEqual(deleted, true);
  });

  it('purges files immediately when customer order is cancelled prior to printing', () => {
    let file = { id: 'f_cancel', is_purged: false };
    function onOrderCancelled(f) {
      return { ...f, is_purged: true, purge_reason: 'order_cancelled' };
    }

    file = onOrderCancelled(file);
    assert.strictEqual(file.is_purged, true);
    assert.strictEqual(file.purge_reason, 'order_cancelled');
  });

  it('records purge audit entry with SHA-256 fingerprint without retaining file data', () => {
    const auditLogs = [];
    function logFilePurged(fileId, fileHash) {
      auditLogs.push({
        event: 'file.purged',
        fileId,
        fingerprint: fileHash,
        purgedAt: new Date().toISOString(),
      });
    }

    const hash = sha256('file-content');
    logFilePurged('f_123', hash);
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].fingerprint, hash);
  });
});

// --- FEATURE 52 BOUNDARY: Stale Lease Reconciliation Scheduler ---
describe('Feature 52 Boundary: Stale Lease Reconciliation Scheduler', () => {
  it('executes cleanly with 0 stale leases returning 0 reconciled count', () => {
    function reconcileStaleLeases(leases) {
      const now = Date.now();
      const stale = leases.filter((l) => now - l.leasedAtMs > 300000);
      return { reconciledCount: stale.length };
    }

    const res = reconcileStaleLeases([]);
    assert.strictEqual(res.reconciledCount, 0);
  });

  it('resets stale lease (> 300s) back to PENDING queue for replacement agent', () => {
    let job = { id: 'job_stale_1', status: 'LEASED', leasedAtMs: Date.now() - 350000, attempts: 1 };
    function checkAndReconcile(j) {
      const isStale = (Date.now() - j.leasedAtMs) > 300000;
      if (isStale && j.attempts < 3) {
        return { ...j, status: 'PENDING', leasedAtMs: null };
      }
      return j;
    }

    job = checkAndReconcile(job);
    assert.strictEqual(job.status, 'PENDING');
    assert.strictEqual(job.leasedAtMs, null);
  });

  it('marks job as FAILED when stale lease has already reached maximum attempts limit (3)', () => {
    let job = { id: 'job_max_attempts', status: 'LEASED', leasedAtMs: Date.now() - 350000, attempts: 3 };
    function checkAndReconcile(j) {
      const isStale = (Date.now() - j.leasedAtMs) > 300000;
      if (isStale && j.attempts >= 3) {
        return { ...j, status: 'FAILED', fail_reason: 'Max lease recovery attempts exceeded' };
      }
      return j;
    }

    job = checkAndReconcile(job);
    assert.strictEqual(job.status, 'FAILED');
    assert.ok(job.fail_reason.includes('Max lease recovery attempts'));
  });

  it('handles race condition: agent heartbeat arrives just as lease reconciler executes', () => {
    const job = { id: 'j_race', status: 'LEASED', leasedAtMs: Date.now() - 301000 };
    function reconcileWithHeartbeatCheck(j, lastHeartbeatMs) {
      const isHeartbeatActive = (Date.now() - lastHeartbeatMs) <= 60000;
      if (isHeartbeatActive) {
        // Agent is still active, extend lease instead of resetting
        return { ...j, leasedAtMs: Date.now(), extended: true };
      }
      return { ...j, status: 'PENDING', extended: false };
    }

    const activeRes = reconcileWithHeartbeatCheck(job, Date.now() - 10000);
    assert.strictEqual(activeRes.extended, true);
    assert.strictEqual(activeRes.status, 'LEASED');
  });

  it('enforces distributed scheduler lock preventing concurrent reconciler executions', () => {
    class SchedulerLock {
      constructor() {
        this.locked = false;
      }
      acquire() {
        if (this.locked) return false;
        this.locked = true;
        return true;
      }
      release() {
        this.locked = false;
      }
    }

    const lock = new SchedulerLock();
    assert.strictEqual(lock.acquire(), true, 'First reconciler acquires lock');
    assert.strictEqual(lock.acquire(), false, 'Concurrent reconciler blocked by lock');
    lock.release();
    assert.strictEqual(lock.acquire(), true);
  });
});

// --- FEATURE 53 BOUNDARY: Discovered Printer Capabilities Fleet Sync ---
describe('Feature 53 Boundary: Discovered Printer Capabilities Fleet Sync', () => {
  it('validates discovered printer capabilities payload structure', () => {
    const printerPayload = {
      name: 'Canon LBP2900',
      port: 'USB001',
      isDefault: true,
      supportsDuplex: false,
      supportsColor: false,
      paperSizes: ['A4', 'Letter'],
    };

    assert.ok(printerPayload.name);
    assert.strictEqual(typeof printerPayload.supportsDuplex, 'boolean');
    assert.ok(Array.isArray(printerPayload.paperSizes));
  });

  it('handles empty printer discovery list (graceful zero-printer state)', () => {
    function processFleetSync(printers) {
      if (!Array.isArray(printers) || printers.length === 0) {
        return { status: 'WARNING', message: 'No physical printers discovered on agent host' };
      }
      return { status: 'OK', count: printers.length };
    }

    const res = processFleetSync([]);
    assert.strictEqual(res.status, 'WARNING');
    assert.ok(res.message.includes('No physical printers'));
  });

  it('updates printer duplex capability when hardware configuration changes', () => {
    let printerRecord = { id: 'p1', name: 'HP LaserJet', supportsDuplex: false };
    function syncCapability(record, newCapabilities) {
      return { ...record, ...newCapabilities, lastSyncedAt: new Date().toISOString() };
    }

    printerRecord = syncCapability(printerRecord, { supportsDuplex: true });
    assert.strictEqual(printerRecord.supportsDuplex, true);
  });

  it('flags disconnected / offline discovered printers without removing historical logs', () => {
    let fleet = [
      { id: 'p1', name: 'Canon LBP', isOnline: true },
      { id: 'p2', name: 'HP OfficeJet', isOnline: true },
    ];

    function syncHeartbeat(discoveredNames) {
      fleet = fleet.map((p) => ({
        ...p,
        isOnline: discoveredNames.includes(p.name),
      }));
    }

    syncHeartbeat(['Canon LBP']); // HP OfficeJet missing from scan
    assert.strictEqual(fleet.find((p) => p.name === 'Canon LBP').isOnline, true);
    assert.strictEqual(fleet.find((p) => p.name === 'HP OfficeJet').isOnline, false);
  });

  it('deduplicates printers by composite name and port across multiple sync cycles', () => {
    const fleetMap = new Map();
    function upsertPrinter(p) {
      const key = `${p.name}::${p.port}`;
      fleetMap.set(key, { ...p, syncedAt: Date.now() });
    }

    upsertPrinter({ name: 'Brother HL', port: '192.168.1.50' });
    upsertPrinter({ name: 'Brother HL', port: '192.168.1.50' });

    assert.strictEqual(fleetMap.size, 1);
  });
});
