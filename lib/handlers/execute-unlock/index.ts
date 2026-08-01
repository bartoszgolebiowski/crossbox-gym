import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSEvent } from 'aws-lambda';
import { LockerItem, UnlockCommand } from '../shared/access-types';
import { ddb } from '../shared/ddb-client';
import { getLockProvider, getMainTableName } from '../shared/env';
import { createLockerAdapter, createLockProvider } from '../shared/providers';

export const handler = async (event: SQSEvent): Promise<void> => {
  const lockProvider = createLockProvider(getLockProvider());
  const mainTable = getMainTableName();

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const { location_id, device_id } = body;

      if (typeof body.command_id === 'string' && typeof body.locker_id === 'string') {
        const command = body as UnlockCommand;
        const lockerResult = await ddb.send(new GetCommand({
          TableName: mainTable,
          Key: { PK: `LOC#${command.location_id}`, SK: `LOCKER#${command.locker_id}` },
        }));
        const locker = lockerResult.Item as LockerItem | undefined;
        if (!locker || locker.status !== 'active' || locker.assigned_scanner_id !== command.scanner_id) {
          throw new Error(`Assigned locker unavailable for command ${command.command_id}`);
        }
        await createLockerAdapter(locker.lock_adapter).unlock(locker, command);
        console.log(`Unlock command ${command.command_id} delivered to locker ${command.locker_id}`);
        continue;
      }

      const deviceResult = await ddb.send(new GetCommand({
        TableName: mainTable,
        Key: {
          PK: `LOC#${location_id}`,
          SK: `DEV#${device_id}`
        }
      }));

      const device = deviceResult.Item;
      if (!device) {
        console.error(`Device not found for LOC#${location_id} DEV#${device_id}`);
        continue;
      }

      await lockProvider.sendUnlockCommand({
        ip: device.connection_params.ip,
        port: device.connection_params.port,
        path: device.connection_params.path,
        durationSeconds: 5
      });

      console.log(`Unlock command successfully sent for location ${location_id}, device ${device_id}`);
    } catch (err) {
      console.error('ExecuteUnlock error handling record:', record.body, err);
      throw err; // Rethrow to trigger SQS retry
    }
  }
};
