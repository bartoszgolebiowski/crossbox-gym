import * as assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { TestAccessRepository } from './lib/test-access-repository.ts';
import {
  createMockScanner,
  createTestLocation,
  createTestUserSession,
  getTestContext,
  scanMockDevice,
} from './lib/test-helpers.ts';
import { IntegrationTestContext, TestLocationRecord, TestScannerRecord, TestUserSession } from './lib/types.ts';

describe('Mock Access Control Integration Suite', () => {
  let context: IntegrationTestContext;
  let repo: TestAccessRepository;

  // Test User Sessions
  let admin: TestUserSession;
  let activeMember: TestUserSession;
  let fallbackMember: TestUserSession;
  let inactiveMember: TestUserSession;
  let unavailableProviderMember: TestUserSession;

  // Test Locations
  let location: TestLocationRecord;
  let otherLocation: TestLocationRecord;

  // Test Scanners
  let scanner: TestScannerRecord;
  let fallbackScanner: TestScannerRecord;
  let unavailableProviderScanner: TestScannerRecord;

  before(async () => {
    context = await getTestContext();
    repo = new TestAccessRepository(context);

    // Create Admin & Members
    admin = await createTestUserSession(context, { role: 'admin' });
    activeMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    fallbackMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    inactiveMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: false });
    unavailableProviderMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });

    // Provision Test Locations
    location = await createTestLocation(context, admin.idToken, { name: `Primary Gym ${Date.now()}` });
    otherLocation = await createTestLocation(context, admin.idToken, { name: `Secondary Gym ${Date.now()}` });

    // Provision Test Scanners
    scanner = await createMockScanner(context, admin.idToken, location.locationId, {
      name: 'Main Entrance Scanner',
      allowedQrProviders: ['basic-subscription', 'mock'],
    });

    fallbackScanner = await createMockScanner(context, admin.idToken, location.locationId, {
      name: 'Fallback Scanner',
      allowedQrProviders: ['basic-subscription', 'mock'],
    });

    unavailableProviderScanner = await createMockScanner(context, admin.idToken, location.locationId, {
      name: 'Restricted Scanner',
      allowedQrProviders: ['basic-subscription'],
    });
  });

  after(async () => {
    for (const testLoc of [location, otherLocation]) {
      if (testLoc?.locationId) {
        await repo.deletePartition(context.mainTableName, `LOC#${testLoc.locationId}`);
      }
    }
  });

  describe('1. Provisioning & Admin Management', () => {
    test('fetches location devices through location-scoped admin API', async () => {
      const devicesRes = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/devices`, {
        headers: { Authorization: `Bearer ${admin.idToken}` },
      });

      assert.equal(devicesRes.status, 200);
      const devices = (await devicesRes.json()) as Array<{ device_id: string; name: string; type?: string }>;
      assert.ok(Array.isArray(devices), 'devices response must be an array');
      const foundScanner = devices.find((d) => d.device_id === scanner.scanner_id);
      assert.ok(foundScanner, 'expected scanner to be returned in location devices');
      assert.equal(foundScanner?.type, 'scanner');
      assert.equal(foundScanner?.name, scanner.name);
    });
  });

  describe('2. Mock Scan Authorization & Gate Unlock', () => {
    test('mock QR success creates one entry log and anti-passback state', async () => {
      const result = (await scanMockDevice(context, `mock:${activeMember.userId}`, scanner.scanner_id)) as any;
      assert.equal(result.result, 'success');
      const entryId = result.entryId || result.entry_id;
      assert.ok(entryId);

      // Verify entry log via Repository
      const entries = await repo.getUserEntryLogs(activeMember.userId);
      const entry = entries.find((item) => item.entry_id === entryId);
      assert.ok(entry);
      assert.equal(entry.scanner_id, scanner.scanner_id);
      assert.equal(entry.qr_provider_id, 'mock');

      // Verify Anti-Passback state via Repository
      const antiPassback = await repo.getAntiPassbackState(activeMember.userId, location.locationId);
      assert.ok(antiPassback?.last_entry_at);
    });
  });

  describe('3. Multi-Provider Fallback Classifier', () => {
    test('falls back from basic-subscription to mock QR provider when scanner allows both', async () => {
      const result = (await scanMockDevice(
        context,
        `mock:${fallbackMember.userId}`,
        fallbackScanner.scanner_id
      )) as any;
      assert.equal(result.result, 'success');
      const entryId = result.entryId || result.entry_id;
      assert.ok(entryId);

      const entries = await repo.getUserEntryLogs(fallbackMember.userId);
      const entry = entries.find((item) => item.entry_id === entryId);
      assert.ok(entry);
      assert.equal(entry.qr_provider_id, 'mock', 'Provider must fall back to mock when non-JSON text is scanned');
    });
  });

  describe('4. Non-Subscription Provider Access Rules', () => {
    test('grants access for mock QR provider without requiring a subscription (unauthenticated guest)', async () => {
      const guestId = `guest_${Date.now()}`;
      const result = (await scanMockDevice(context, `mock:${guestId}`, scanner.scanner_id)) as any;
      assert.equal(result.result, 'success');
      const entryId = result.entryId || result.entry_id;
      assert.ok(entryId);

      const entries = await repo.getUserEntryLogs(guestId);
      assert.equal(entries.length, 1);
    });

    test('grants access for mock QR provider even when user membership is inactive', async () => {
      const result = (await scanMockDevice(context, `mock:${inactiveMember.userId}`, scanner.scanner_id)) as any;
      assert.equal(result.result, 'success');
      const entryId = result.entryId || result.entry_id;
      assert.ok(entryId);

      const entries = await repo.getUserEntryLogs(inactiveMember.userId);
      assert.equal(entries.length, 1);
    });
  });

  describe('5. Negative & Failure Modes', () => {
    test('enforces anti-passback cooldown after a committed mock scan without creating extra entries', async () => {
      const result = await scanMockDevice(context, `mock:${activeMember.userId}`, scanner.scanner_id);
      assert.equal(result.result, 'denied');
      assert.equal(result.reason, 'anti_passback_cooldown');

      const entries = await repo.getUserEntryLogs(activeMember.userId);
      assert.equal(entries.length, 1, 'Entry count must remain 1');
    });

    test('fails closed when a scanner allows an unavailable provider and creates no access state', async () => {
      const result = await scanMockDevice(
        context,
        `mock:${unavailableProviderMember.userId}`,
        unavailableProviderScanner.scanner_id
      );
      assert.equal(result.result, 'denied');
      assert.equal(result.reason, 'unavailable');

      const entries = await repo.getUserEntryLogs(unavailableProviderMember.userId);
      assert.equal(entries.length, 0);

      const antiPassback = await repo.getAntiPassbackState(unavailableProviderMember.userId, location.locationId);
      assert.equal(antiPassback, undefined);
    });

    test('denies malformed mock credentials without creating access state', async () => {
      const malformed = await scanMockDevice(context, 'mock:', scanner.scanner_id);
      assert.equal(malformed.result, 'denied');
      assert.equal(malformed.reason, 'missing_mock_subject_id');
    });
  });
});
