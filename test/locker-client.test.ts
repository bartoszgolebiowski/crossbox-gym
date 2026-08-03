import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessService } from '../lib/handlers/shared/providers';
import { createLockerClient, MockLockerClient, MqttLockerClient, setLockerClientOverride } from '../lib/handlers/shared/providers/lockers';
import { parseIotScanEvent, handler as verifyEntryHandler } from '../lib/handlers/verify-entry';

test('Locker Client Suite - 1. MockLockerClient builds correct payload and topic', async () => {
  const mockClient = new MockLockerClient();
  const lockerId = 'locker-101';

  const payload = await mockClient.openLocker(lockerId);

  assert.deepStrictEqual(payload, {
    id: 1,
    method: 'Switch.Set',
    params: {
      id: 0,
      on: true,
      toggle_after: 5,
    },
  });

  assert.strictEqual(mockClient.sentCommands.length, 1);
  assert.strictEqual(mockClient.sentCommands[0].lockerId, lockerId);
  assert.strictEqual(mockClient.sentCommands[0].topic, 'gym/lockers/locker-101/command');
  assert.deepStrictEqual(mockClient.sentCommands[0].payload, payload);
});

test('Locker Client Suite - 2. MockLockerClient allows custom params', async () => {
  const mockClient = new MockLockerClient();
  const lockerId = 'locker-202';

  const payload = await mockClient.openLocker(lockerId, { id: 2, toggle_after: 10 });

  assert.deepStrictEqual(payload, {
    id: 1,
    method: 'Switch.Set',
    params: {
      id: 2,
      on: true,
      toggle_after: 10,
    },
  });
});

test('Locker Client Suite - 3. createLockerClient factory handles type selection', () => {
  const mockClient = createLockerClient('mock');
  assert.ok(mockClient instanceof MockLockerClient);

  const mqttClient = createLockerClient('mqtt', 'test-endpoint.iot.eu-central-1.amazonaws.com');
  assert.ok(mqttClient instanceof MqttLockerClient);
});

test('Locker Client Suite - 4. parseIotScanEvent extracts lockerId when provided', () => {
  const scanEvent = {
    event_id: 'evt-123',
    client_id: 'scanner-01',
    lockerId: 'locker-777',
    timestamp: 1785672769,
    payload: {
      raw_data: 'mock:user_abc',
      encoding: 'utf-8',
    },
  };

  const parsed = parseIotScanEvent(scanEvent);
  assert.strictEqual(parsed.valid, true);
  if (parsed.valid) {
    assert.strictEqual(parsed.scannerId, 'scanner-01');
    assert.strictEqual(parsed.lockerId, 'locker-777');
  }
});

test('Locker Client Suite - 5. verifyEntryHandler sends feedback to scanner and opens locker via LockerClient', async () => {
  process.env.MAIN_TABLE_NAME = 'TestMainTable';
  process.env.ENTRY_LOGS_TABLE_NAME = 'TestEntryLogsTable';

  const originalCommitAccess = AccessService.prototype.commitAccess;
  AccessService.prototype.commitAccess = async (_scannerId: string, _credential: any) => {
    return { success: true, entryId: 'test-entry-123' };
  };

  try {
    const mockLockerClient = new MockLockerClient();
    setLockerClientOverride(mockLockerClient);

    const scanEvent = {
      event_id: 'evt-456',
      client_id: 'scanner-02',
      lockerId: 'locker-02',
      timestamp: Math.floor(Date.now() / 1000),
      payload: {
        raw_data: 'mock:user_xyz',
        encoding: 'utf-8',
      },
    };

    const result: any = await verifyEntryHandler(scanEvent);

    assert.strictEqual(result.result, 'success');
    assert.strictEqual(result.action, 'open_gate');
    assert.strictEqual(result.lockerId, 'locker-02');
    assert.deepStrictEqual(result.lockerPayload, {
      id: 1,
      method: 'Switch.Set',
      params: {
        id: 0,
        on: true,
        toggle_after: 5,
      },
    });

    assert.strictEqual(mockLockerClient.sentCommands.length, 1);
    assert.strictEqual(mockLockerClient.sentCommands[0].topic, 'gym/lockers/locker-02/command');
  } finally {
    setLockerClientOverride(undefined);
    AccessService.prototype.commitAccess = originalCommitAccess;
  }
});
