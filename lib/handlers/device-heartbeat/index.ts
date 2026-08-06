import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { DynamoDbDevicePresenceRepository } from '../admin/repository';
import { ddb } from '../shared/db';

export interface HeartbeatEventRecord {
  thingName?: string;
  topic?: string;
  [key: string]: unknown;
}

const deviceHeartbeatEnvironmentSchema = z.object({
  PRESENCE_TABLE_NAME: z.string().min(1, 'PRESENCE_TABLE_NAME is required'),
});

function extractThingName(record: HeartbeatEventRecord): string | undefined {
  if (record.thingName) {
    return record.thingName;
  }
  if (record.topic) {
    const parts = record.topic.split('/');
    // topic format: gym/devices/{thingName}/heartbeat
    if (parts.length >= 4 && parts[parts.length - 1] === 'heartbeat') {
      const candidate = parts[parts.length - 2];
      if (candidate && candidate !== 'devices') {
        return candidate;
      }
    }
  }
  return undefined;
}

export const handler = async (event: HeartbeatEventRecord[]) => {
  const environment = deviceHeartbeatEnvironmentSchema.parse(process.env);

  const repo = new DynamoDbDevicePresenceRepository(ddb as DynamoDBDocumentClient, environment.PRESENCE_TABLE_NAME);

  const records = Array.isArray(event) ? event : [event];
  for (const record of records) {
    const thingName = extractThingName(record);
    if (!thingName) {
      console.warn('[DeviceHeartbeat] Missing thingName, skipping record:', record);
      continue;
    }
    repo.updatePresence(thingName, new Date().toISOString());
  }
};
