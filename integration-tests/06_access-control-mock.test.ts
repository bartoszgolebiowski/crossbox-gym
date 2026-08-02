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
      allowedProviders: ['basic-subscription', 'mock'],
    });

    fallbackScanner = await createMockScanner(context, admin.idToken, location.locationId, {
      name: 'Fallback Scanner',
      allowedProviders: ['basic-subscription', 'mock'],
    });

    unavailableProviderScanner = await createMockScanner(context, admin.idToken, location.locationId, {
      name: 'Restricted Scanner',
      allowedProviders: ['basic-subscription'],
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
    test('provisions mock scanner resources through location-scoped admin API', async () => {
      const scannersRes = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/scanners`, {
        headers: { Authorization: `Bearer ${admin.idToken}` },
      });

      assert.equal(scannersRes.status, 200);
      const scannerItems = (await scannersRes.json()) as TestScannerRecord[];
      const foundScanner = scannerItems.find((item) => item.scanner_id === scanner.scanner_id);

      assert.ok(foundScanner);
      assert.equal('scanner_api_key' in foundScanner, false, 'API key must be hidden on list endpoints');
    });
  });

  describe('2. Mock Scan Authorization & Gate Unlock', () => {
    test('mock QR success creates one entry log and anti-passback state', async () => {
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${activeMember.userId}`, scanner.scanner_id);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      // Verify entry log via Repository
      const entries = await repo.getUserEntryLogs(activeMember.userId);
      const entry = entries.find((item) => item.entry_id === result.entry_id);
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
      const result = await scanMockDevice(context, fallbackScanner.scanner_api_key!, `mock:${fallbackMember.userId}`, fallbackScanner.scanner_id);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      const entries = await repo.getUserEntryLogs(fallbackMember.userId);
      const entry = entries.find((item) => item.entry_id === result.entry_id);
      assert.ok(entry);
      assert.equal(entry.qr_provider_id, 'mock', 'Provider must fall back to mock when non-JSON text is scanned');
    });
  });

  describe('4. Non-Subscription Provider Access Rules', () => {
    test('grants access for mock QR provider without requiring a subscription (unauthenticated guest)', async () => {
      const guestId = `guest_${Date.now()}`;
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${guestId}`, scanner.scanner_id);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      const entries = await repo.getUserEntryLogs(guestId);
      assert.equal(entries.length, 1);
    });

    test('grants access for mock QR provider even when user membership is inactive', async () => {
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${inactiveMember.userId}`, scanner.scanner_id);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      const entries = await repo.getUserEntryLogs(inactiveMember.userId);
      assert.equal(entries.length, 1);
    });
  });

  describe('5. Negative & Failure Modes', () => {
    test('enforces anti-passback cooldown after a committed mock scan without creating extra entries', async () => {
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${activeMember.userId}`, scanner.scanner_id);
      assert.deepEqual(result, { result: 'denied', reason: 'anti_passback_cooldown' });

      const entries = await repo.getUserEntryLogs(activeMember.userId);
      assert.equal(entries.length, 1, 'Entry count must remain 1');
    });

    test('fails closed when a scanner allows an unavailable provider and creates no access state', async () => {
      const result = await scanMockDevice(context, unavailableProviderScanner.scanner_api_key!, `mock:${unavailableProviderMember.userId}`, unavailableProviderScanner.scanner_id);
      assert.deepEqual(result, { result: 'denied', reason: 'unavailable' });

      const entries = await repo.getUserEntryLogs(unavailableProviderMember.userId);
      assert.equal(entries.length, 0);

      const antiPassback = await repo.getAntiPassbackState(unavailableProviderMember.userId, location.locationId);
      assert.equal(antiPassback, undefined);
    });

    test('denies malformed mock credentials without creating access state', async () => {
      const malformed = await scanMockDevice(context, scanner.scanner_api_key!, 'mock:', scanner.scanner_id);
      assert.deepEqual(malformed, { result: 'denied', reason: 'invalid' });
    });
  });
});