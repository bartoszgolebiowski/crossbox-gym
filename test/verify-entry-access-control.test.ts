import assert from 'node:assert/strict';
import test from 'node:test';
import { ScannerItem } from '../lib/handlers/shared/access/types';
import { VerifyEntryAccessControlService } from '../lib/handlers/verify-entry/access-control';

const scanner: ScannerItem = {
  PK: 'LOC#site-1',
  SK: 'SCANNER#scanner-1',
  scanner_id: 'scanner-1',
  device_id: 'scanner-1',
  location_id: 'site-1',
  name: 'Front entrance scanner',
  status: 'active',
  reader_adapter: 'mqtt',
  allowed_qr_providers: ['mock'],
  assigned_locker_id: 'locker-1',
  created_at: '2026-08-05T12:00:00.000Z',
  updated_at: '2026-08-05T12:00:00.000Z',
};

test('VerifyEntryAccessControlService returns granted decision after successful verification and validation', async () => {
  const grantedAuditEvents: unknown[] = [];
  const accessControl = new VerifyEntryAccessControlService({
    accessService: {
      findActiveScanner: async () => scanner,
      verifyRawData: async () => ({ success: true, credential: { subjectId: 'member-1', providerId: 'mock' } }),
      validateAccess: async () => ({ success: true, scanner }),
    },
    scannerAudit: {
      recordGranted: async (event) => {
        grantedAuditEvents.push(event);
        return { outcome: 'committed', entryId: 'entry-1' };
      },
    },
  });

  const decision = await accessControl.authorizeScan({
    event_id: 'scan-1',
    client_id: 'scanner-1',
    timestamp: 1785931200,
    payload: { raw_data: 'mock:member-1', encoding: 'utf-8' },
  });

  assert.deepEqual(decision, {
    granted: true,
    scannerId: 'scanner-1',
    entryId: 'entry-1',
    lockerId: 'locker-1',
    userId: 'member-1',
    locationId: 'site-1',
  });
  assert.deepEqual(grantedAuditEvents, [
    {
      scanner,
      scannerId: 'scanner-1',
      credential: { subjectId: 'member-1', providerId: 'mock' },
    },
  ]);
});

test('VerifyEntryAccessControlService returns denied decision when commit is rejected', async () => {
  const accessControl = new VerifyEntryAccessControlService({
    accessService: {
      findActiveScanner: async () => scanner,
      verifyRawData: async () => ({ success: true, credential: { subjectId: 'member-1', providerId: 'mock' } }),
      validateAccess: async () => ({ success: true, scanner }),
    },
    scannerAudit: {
      recordGranted: async () => ({ outcome: 'anti_passback_cooldown' }),
    },
  });

  const decision = await accessControl.authorizeScan({
    event_id: 'scan-1',
    client_id: 'scanner-1',
    timestamp: 1785931200,
    payload: { raw_data: 'mock:member-1', encoding: 'utf-8' },
  });

  assert.deepEqual(decision, {
    granted: false,
    scannerId: 'scanner-1',
    reason: 'anti_passback_cooldown',
    scanner,
  });
});

test('VerifyEntryAccessControlService returns denied decision when verification fails', async () => {
  const accessControl = new VerifyEntryAccessControlService({
    accessService: {
      findActiveScanner: async () => scanner,
      verifyRawData: async () => ({ success: false, reason: 'verification_failed' }),
      validateAccess: async () => ({ success: true, scanner }),
    },
    scannerAudit: {
      recordGranted: async () => assert.fail('verification failure must not call granted audit'),
    },
  });

  const decision = await accessControl.authorizeScan({
    event_id: 'scan-1',
    client_id: 'scanner-1',
    timestamp: 1785931200,
    payload: { raw_data: 'bad-data', encoding: 'utf-8' },
  });

  assert.deepEqual(decision, {
    granted: false,
    scannerId: 'scanner-1',
    reason: 'verification_failed',
    scanner,
  });
});
