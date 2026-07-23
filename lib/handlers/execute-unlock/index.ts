import { SQSEvent } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/ddb-client';
import { createLockProvider } from '../shared/providers';

const MAIN_TABLE = process.env.MAIN_TABLE_NAME!;

export const handler = async (event: SQSEvent): Promise<void> => {
  const lockProvider = createLockProvider(process.env.LOCK_PROVIDER || 'mock');

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const { location_id, device_id } = body;

      const deviceResult = await ddb.send(new GetCommand({
        TableName: MAIN_TABLE,
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
