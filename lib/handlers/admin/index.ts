import { IoTClient, DescribeEndpointCommand } from '@aws-sdk/client-iot';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ddb } from '../shared/database';
import { withHandler } from '../shared/http';
import { createMqttPublisher } from '../shared/providers/feedback/mqtt-feedback';
import { createLockerClient } from '../shared/providers/lockers';
import { DynamoDbAuditLogger } from './audit-logger';
import { loadAdminEnvironment } from './environment';
import { MqttLockPublisher, NoOpLockPublisher } from './lock-publisher';
import { AdminRepository, DynamoDbAdminRepository } from './repository';
import { createAdminRouter } from './router';
import { AdminService } from './service';

let cachedIoTEndpoint: string | undefined;

async function resolveIoTEndpoint(envEndpoint?: string): Promise<string | undefined> {
  if (envEndpoint) return envEndpoint;
  if (cachedIoTEndpoint) return cachedIoTEndpoint;
  try {
    const client = new IoTClient({});
    const res = await client.send(new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }));
    cachedIoTEndpoint = res.endpointAddress;
    return cachedIoTEndpoint;
  } catch (err) {
    console.warn('[AdminHandler] Failed to describe IoT endpoint:', err);
    return undefined;
  }
}

function createLockPublisher(iotEndpoint: string | undefined, lockerClientType: string, repository?: AdminRepository) {
  if (lockerClientType === 'mock' || !iotEndpoint) {
    return new NoOpLockPublisher();
  }
  const feedbackPublisher = createMqttPublisher(iotEndpoint);
  const lockerClient = createLockerClient('mqtt', iotEndpoint);
  const lockerResolver = repository ? (deviceId: string) => repository.findAssignedLockerId(deviceId) : undefined;
  return new MqttLockPublisher(lockerClient, feedbackPublisher, lockerResolver);
}

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadAdminEnvironment();
  const iotEndpoint = await resolveIoTEndpoint(environment.iotEndpoint);

  const repository = new DynamoDbAdminRepository(
    ddb as DynamoDBDocumentClient,
    environment.mainTableName,
    environment.entryLogsTableName
  );
  const auditLogger = new DynamoDbAuditLogger(ddb as DynamoDBDocumentClient, environment.auditLogsTableName);
  const service = new AdminService({
    repository,
    auditLogger,
    lockPublisher: createLockPublisher(iotEndpoint, environment.lockerClientType, repository),
  });
  return withHandler(createAdminRouter(service))(event);
};
