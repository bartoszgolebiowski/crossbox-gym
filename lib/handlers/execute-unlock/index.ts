import { SQSEvent } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/ddb-client';
import { createLockProvider } from '../shared/providers';
import { getMainTableName, getLockProvider } from '../shared/env';

export const handler = async (event: SQSEvent): Promise<void> => {
  const lockProvider = createLockProvider(getLockProvider());
  const mainTable = getMainTableName();

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const { location_id, device_id } = body;

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
