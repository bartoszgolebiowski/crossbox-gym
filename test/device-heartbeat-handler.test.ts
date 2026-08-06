import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { handler } from '../lib/handlers/device-heartbeat';
import { ddb } from '../lib/handlers/shared/db';

const baseEnv = {
  MAIN_TABLE_NAME: 'main-table',
  ENTRY_LOGS_TABLE_NAME: 'entry-logs-table',
  AUDIT_LOGS_TABLE_NAME: 'audit-logs-table',
  USER_POOL_ID: 'user-pool',
  USER_POOL_CLIENT_ID: 'user-pool-client',
  PRESENCE_TABLE_NAME: 'presence-table',
};

describe('DeviceHeartbeatHandler', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let sendMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env = { ...process.env, ...baseEnv };
    sendMock = mock.fn(async () => ({}));

    // Replace the shared ddb client send for the duration of the test.
    (ddb as unknown as { send: typeof sendMock }).send = sendMock;
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restoreAll();
  });

  test('writes presence row from topic rule event with thingName', async () => {
    const event = [
      {
        thingName: 'crossbox-qr-scanner-01',
        deviceType: 'HDWR-HD360-QR-Scanner',
        status: 'online',
        timestamp: '2026-08-05T12:34:56.789Z',
      },
    ];

    await handler(event);

    assert.equal(sendMock.mock.calls.length, 1);
    const putCommand = sendMock.mock.calls[0].arguments[0] as {
      input: { TableName: string; Item: Record<string, unknown> };
    };
    assert.equal(putCommand.input.TableName, 'presence-table');
    assert.equal(putCommand.input.Item.thingName, 'crossbox-qr-scanner-01');
    assert.equal(typeof putCommand.input.Item.lastSeen, 'string');
    assert.equal(typeof putCommand.input.Item.ttl, 'number');
  });

  test('extracts thingName from topic when thingName is missing', async () => {
    const event = [
      {
        topic: 'gym/devices/crossbox-locker-relay-01/heartbeat',
        status: 'online',
      },
    ];

    await handler(event);

    assert.equal(sendMock.mock.calls.length, 1);
    const putCommand = sendMock.mock.calls[0].arguments[0] as {
      input: { Item: Record<string, unknown> };
    };
    assert.equal(putCommand.input.Item.thingName, 'crossbox-locker-relay-01');
  });

  test('skips records without a thingName', async () => {
    const event = [
      {
        topic: 'gym/devices/heartbeat',
        status: 'online',
      },
    ];

    await handler(event);

    assert.equal(sendMock.mock.calls.length, 0);
  });

  test('throws when PRESENCE_TABLE_NAME is missing', async () => {
    process.env.PRESENCE_TABLE_NAME = '';
    const event = [{ thingName: 'crossbox-qr-scanner-01' }];

    await assert.rejects(() => handler(event), /PRESENCE_TABLE_NAME is required/);
  });
});
