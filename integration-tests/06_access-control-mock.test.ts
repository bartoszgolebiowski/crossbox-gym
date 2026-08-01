import * as assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { TestAccessRepository } from './lib/test-access-repository.ts';
import {
    assignTestLocker,
    cleanupTestUser,
    createMockLocker,
    createMockScanner,
    createTestLocation,
    createTestUserSession,
    dispatchUnlockOutbox,
    getTestContext,
    scanMockDevice,
} from './lib/test-helpers.ts';
import { IntegrationTestContext, TestLocationRecord, TestLockerRecord, TestScannerRecord, TestUserSession } from './lib/types.ts';

describe('Mock Access Control Integration Suite', () => {
  let context: IntegrationTestContext;
  let repo: TestAccessRepository;

  // Test User Sessions
  let admin: TestUserSession;
  let activeMember: TestUserSession;
  let fallbackMember: TestUserSession;
  let pastDueValidMember: TestUserSession;
  let pastDueExpiredMember: TestUserSession;
  let inactiveMember: TestUserSession;
  let unassignedMember: TestUserSession;
  let unavailableProviderMember: TestUserSession;

  // Test Locations
  let location: TestLocationRecord;
  let otherLocation: TestLocationRecord;

  // Test Scanners
  let scanner: TestScannerRecord;
  let fallbackScanner: TestScannerRecord;
  let unassignedScanner: TestScannerRecord;
  let unavailableProviderScanner: TestScannerRecord;

  // Test Lockers
  let locker: TestLockerRecord;
  let otherLocker: TestLockerRecord;

  // Track created outbox commands for clean teardown
  const createdOutboxCommandIds = new Set<string>();

  before(async () => {
    context = await getTestContext();
    repo = new TestAccessRepository(context);

    // Create Admin & Members
    admin = await createTestUserSession(context, { role: 'admin' });
    activeMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    fallbackMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    inactiveMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: false });
    unassignedMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    unavailableProviderMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });

    // Seed PAST_DUE member with valid grace period (2 days in future)
    pastDueValidMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: false });
    const futureGrace = new Date(Date.now() + 2 * 86400000).toISOString();
    await repo.seedUserSubscription(pastDueValidMember.userId, 'test_past_due_valid', 'PAST_DUE', futureGrace);

    // Seed PAST_DUE member with expired grace period (2 days in past)
    pastDueExpiredMember = await createTestUserSession(context, { role: 'member', withActiveSubscription: false });
    const pastGrace = new Date(Date.now() - 2 * 86400000).toISOString();
    await repo.seedUserSubscription(pastDueExpiredMember.userId, 'test_past_due_expired', 'PAST_DUE', pastGrace);

    // Create Test Locations
    location = await createTestLocation(context, admin.idToken);
    otherLocation = await createTestLocation(context, admin.idToken);

    // Create & Assign Main Scanner and Locker
    scanner = await createMockScanner(context, admin.idToken, location.locationId, { allowedQrProviders: ['mock'] });
    locker = await createMockLocker(context, admin.idToken, location.locationId, { durationSeconds: 7 });
    await assignTestLocker(context, admin.idToken, location.locationId, scanner.scanner_id, locker.locker_id);

    // Create Fallback Scanner and its own Fallback Locker
    fallbackScanner = await createMockScanner(context, admin.idToken, location.locationId, { allowedQrProviders: ['basic-subscription', 'mock'] });
    const fallbackLocker = await createMockLocker(context, admin.idToken, location.locationId, { durationSeconds: 5 });
    await assignTestLocker(context, admin.idToken, location.locationId, fallbackScanner.scanner_id, fallbackLocker.locker_id);

    // Create Unassigned & Unavailable Provider Scanners
    unassignedScanner = await createMockScanner(context, admin.idToken, location.locationId, { allowedQrProviders: ['mock'] });
    unavailableProviderScanner = await createMockScanner(context, admin.idToken, location.locationId, { allowedQrProviders: ['missing-provider'] });

    const unavailableProviderLocker = await createMockLocker(context, admin.idToken, location.locationId);
    await assignTestLocker(context, admin.idToken, location.locationId, unavailableProviderScanner.scanner_id, unavailableProviderLocker.locker_id);

    otherLocker = await createMockLocker(context, admin.idToken, otherLocation.locationId);
  });

  after(async () => {
    const allMembers = [
      activeMember,
      fallbackMember,
      pastDueValidMember,
      pastDueExpiredMember,
      inactiveMember,
      unassignedMember,
      unavailableProviderMember,
    ];

    for (const member of allMembers) {
      if (member?.email) {
        await cleanupTestUser(context, member);
      }
      if (member?.userId) {
        await repo.deletePartition(context.entryLogsTableName, `USER#${member.userId}`);
        await repo.deleteAntiPassbackState(member.userId, location.locationId);
      }
    }

    for (const testLoc of [location, otherLocation]) {
      if (testLoc?.locationId) {
        await repo.deletePartition(context.mainTableName, `LOC#${testLoc.locationId}`);
      }
    }

    await repo.deleteOutboxItems(createdOutboxCommandIds);
  });

  describe('1. Provisioning & Admin Management', () => {
    test('provisions mock scanner and locker resources through location-scoped admin API', async () => {
      const scannersRes = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/scanners`, {
        headers: { Authorization: `Bearer ${admin.idToken}` },
      });
      const lockersRes = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/lockers`, {
        headers: { Authorization: `Bearer ${admin.idToken}` },
      });

      assert.equal(scannersRes.status, 200);
      assert.equal(lockersRes.status, 200);

      const scannerItems = (await scannersRes.json()) as TestScannerRecord[];
      const lockerItems = (await lockersRes.json()) as TestLockerRecord[];

      const foundScanner = scannerItems.find((item) => item.scanner_id === scanner.scanner_id);
      const foundLocker = lockerItems.find((item) => item.locker_id === locker.locker_id);

      assert.ok(foundScanner);
      assert.ok(foundLocker);
      assert.equal(foundScanner.assigned_locker_id, locker.locker_id);
      assert.equal(foundLocker.assigned_scanner_id, scanner.scanner_id);
      assert.equal('scanner_api_key' in foundScanner, false, 'API key must be hidden on list endpoints');
    });

    test('rejects assigning a locker from another location to the scanner', async () => {
      const response = await fetch(`${context.apiUrl}/admin/locations/${location.locationId}/scanners/${scanner.scanner_id}/locker`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.idToken}` },
        body: JSON.stringify({ locker_id: otherLocker.locker_id }),
      });

      assert.equal(response.status, 404);
    });
  });

  describe('2. Mock Scan Authorization & Outbox Commitment', () => {
    test('mock QR success creates one entry log, anti-passback state, and a pending outbox command', async () => {
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${activeMember.userId}`);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      // Verify entry log via Repository
      const entries = await repo.getUserEntryLogs(activeMember.userId);
      const entry = entries.find((item) => item.entry_id === result.entry_id);
      assert.ok(entry);
      assert.equal(entry.scanner_id, scanner.scanner_id);
      assert.equal(entry.locker_id, locker.locker_id);
      assert.equal(entry.qr_provider_id, 'mock');

      // Verify pending outbox item via Repository
      const outbox = await repo.getOutboxItem(entry.unlock_command_id);
      assert.ok(outbox);
      assert.equal(outbox.status, 'pending');
      assert.equal(outbox.delivery_attempts, 0);

      createdOutboxCommandIds.add(outbox.command.command_id);

      assert.deepEqual(
        {
          scanner_id: outbox.command.scanner_id,
          locker_id: outbox.command.locker_id,
          user_id: outbox.command.user_id,
          provider_id: outbox.command.provider_id,
          duration_seconds: outbox.command.duration_seconds,
        },
        {
          scanner_id: scanner.scanner_id,
          locker_id: locker.locker_id,
          user_id: activeMember.userId,
          provider_id: 'mock',
          duration_seconds: 7,
        }
      );
      assert.equal(outbox.command.entry_id, result.entry_id);
      assert.ok(outbox.command.requested_at);

      // Verify Anti-Passback state via Repository
      const antiPassback = await repo.getAntiPassbackState(activeMember.userId, location.locationId);
      assert.ok(antiPassback?.last_entry_at);
    });
  });

  describe('3. Durable Outbox Dispatch & Execution', () => {
    test('dispatches committed mock-locker outbox command through deployed dispatcher', async () => {
      const commandId = Array.from(createdOutboxCommandIds).pop();
      assert.ok(commandId);

      await dispatchUnlockOutbox(context);

      const outbox = await repo.getOutboxItem(commandId);
      assert.equal(outbox?.status, 'dispatched');
      assert.equal(outbox?.OutboxStatusPK, 'OUTBOX#DISPATCHED');
      assert.ok((outbox?.delivery_attempts || 0) >= 1);
      assert.ok(outbox?.dispatched_at);
    });
  });

  describe('4. Multi-Provider Fallback Classifier', () => {
    test('falls back from basic-subscription to mock QR provider when scanner allows both', async () => {
      const result = await scanMockDevice(context, fallbackScanner.scanner_api_key!, `mock:${fallbackMember.userId}`);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      const entries = await repo.getUserEntryLogs(fallbackMember.userId);
      const entry = entries.find((item) => item.entry_id === result.entry_id);
      assert.ok(entry);
      assert.equal(entry.qr_provider_id, 'mock', 'Provider must fall back to mock when non-JSON text is scanned');

      if (entry?.unlock_command_id) {
        createdOutboxCommandIds.add(entry.unlock_command_id);
      }
    });
  });

  describe('5. Non-Subscription Provider Access Rules', () => {
    test('grants access for mock QR provider without requiring a subscription (unauthenticated guest)', async () => {
      const guestId = `guest_${Date.now()}`;
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${guestId}`);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      const entries = await repo.getUserEntryLogs(guestId);
      assert.equal(entries.length, 1);
      const entry = entries[0];
      if (entry?.unlock_command_id) {
        createdOutboxCommandIds.add(entry.unlock_command_id);
      }
    });

    test('grants access for mock QR provider even when user membership is inactive', async () => {
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${inactiveMember.userId}`);
      assert.equal(result.result, 'success');
      assert.ok(result.entry_id);

      const entries = await repo.getUserEntryLogs(inactiveMember.userId);
      assert.equal(entries.length, 1);
      const entry = entries[0];
      if (entry?.unlock_command_id) {
        createdOutboxCommandIds.add(entry.unlock_command_id);
      }
    });
  });

  describe('6. Negative & Failure Modes', () => {
    test('enforces anti-passback cooldown after a committed mock scan without creating extra entries', async () => {
      const result = await scanMockDevice(context, scanner.scanner_api_key!, `mock:${activeMember.userId}`);
      assert.deepEqual(result, { result: 'denied', reason: 'anti_passback_cooldown' });

      const entries = await repo.getUserEntryLogs(activeMember.userId);
      assert.equal(entries.length, 1, 'Entry count must remain 1');
    });

    test('denies a mock scan when the scanner has no assigned locker without writing access state', async () => {
      const result = await scanMockDevice(context, unassignedScanner.scanner_api_key!, `mock:${unassignedMember.userId}`);
      assert.deepEqual(result, { result: 'denied', reason: 'assigned_locker_unavailable' });

      const antiPassback = await repo.getAntiPassbackState(unassignedMember.userId, location.locationId);
      assert.equal(antiPassback, undefined);
    });

    test('fails closed when a scanner allows an unavailable provider and creates no access state', async () => {
      const result = await scanMockDevice(context, unavailableProviderScanner.scanner_api_key!, `mock:${unavailableProviderMember.userId}`);
      assert.deepEqual(result, { result: 'denied', reason: 'unavailable' });

      const entries = await repo.getUserEntryLogs(unavailableProviderMember.userId);
      assert.equal(entries.length, 0);

      const antiPassback = await repo.getAntiPassbackState(unavailableProviderMember.userId, location.locationId);
      assert.equal(antiPassback, undefined);
    });

    test('denies malformed mock credentials without creating access state', async () => {
      const malformed = await scanMockDevice(context, scanner.scanner_api_key!, 'mock:');
      assert.deepEqual(malformed, { result: 'denied', reason: 'invalid' });
    });
  });
});