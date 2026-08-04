import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ddb } from '../shared/database';
import { withHandler } from '../shared/http';
import { createMqttPublisher } from '../shared/providers/feedback';
import { DynamoDbAuditLogger } from './audit-logger';
import { loadAdminEnvironment } from './environment';
import { MqttLockPublisher, NoOpLockPublisher } from './lock-publisher';
import { DynamoDbAdminRepository } from './repository';
import { createAdminRouter } from './router';
import { AdminService } from './service';

function createLockPublisher(iotEndpoint?: string) {
  if (iotEndpoint) {
    return new MqttLockPublisher(createMqttPublisher(iotEndpoint));
  }
  return new NoOpLockPublisher();
}

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadAdminEnvironment();
  const repository = new DynamoDbAdminRepository(
    ddb as DynamoDBDocumentClient,
    environment.mainTableName,
    environment.entryLogsTableName
  );
  const auditLogger = new DynamoDbAuditLogger(ddb as DynamoDBDocumentClient, environment.auditLogsTableName);
  const service = new AdminService({
    repository,
    auditLogger,
    lockPublisher: createLockPublisher(environment.iotEndpoint),
  });
  return withHandler(createAdminRouter(service))(event);
};
