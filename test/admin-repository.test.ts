import assert from 'node:assert/strict';
import test from 'node:test';
import { DynamoDbAdminRepository } from '../lib/handlers/admin/repository';

test('DynamoDbAdminRepository queries location activity through LocationIndex', async () => {
  let request: unknown;
  const client = {
    send: async (command: { input: unknown }) => {
      request = command.input;
      return {
        Items: [
          {
            entry_id: 'entry-1',
            timestamp: '2026-08-05T12:00:00.000Z',
            result: 'success',
            scanner_id: 'scanner-1',
            locker_id: 'locker-1',
          },
          {
            entry_id: 'entry-1',
            timestamp: '2026-08-05T12:00:01.000Z',
            result: 'unlock',
            scanner_id: 'scanner-1',
            locker_id: 'locker-1',
          },
        ],
      };
    },
  };
  const repository = new DynamoDbAdminRepository(client as never, 'main-table', 'entry-logs-table');

  const activity = await repository.getActivity('site-1', 'scanner-1', 'locker-1', { limit: 20 });

  assert.deepEqual(request, {
    TableName: 'entry-logs-table',
    IndexName: 'LocationIndex',
    KeyConditionExpression: 'location_id = :locId',
    FilterExpression: '(scanner_id = :scannerId OR device_id = :scannerId) AND locker_id = :lockerId',
    ExpressionAttributeValues: {
      ':locId': 'site-1',
      ':scannerId': 'scanner-1',
      ':lockerId': 'locker-1',
    },
    ScanIndexForward: false,
    Limit: 20,
    ExclusiveStartKey: undefined,
  });
  assert.equal(activity.total_count, 2);
  assert.equal(activity.success_count, 1);
  assert.equal(activity.unlock_count, 1);
  assert.equal(activity.denied_count, 0);
});
