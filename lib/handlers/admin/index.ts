import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getDeviceByType, getDeviceTopicTemplate } from '../../config';
import { ddb } from '../shared/db';
import { withHandler } from '../shared/http';
import { AwsIotMqttClient, LockerDeviceThing, ScannerDeviceThing } from '../shared/iot';
import { SsmIotEndpointProvider } from '../shared/ssm';
import { DynamoDbAuditLogger } from './audit-logger';
import { loadAdminEnvironment } from './environment';
import {
  MqttLockPublisher,
  MqttScannerFeedbackPublisher,
  NoOpLockPublisher,
  RepositoryLockerTargetResolver,
} from './lock-publisher';
import { AdminRepository, DynamoDbAdminRepository, DynamoDbDevicePresenceRepository } from './repository';
import { createAdminRouter } from './router';
import { AdminService } from './service';

function createLockPublisher(lockerClientType: string, repository: AdminRepository) {
  if (lockerClientType === 'mock') {
    return new NoOpLockPublisher();
  }

  const mqttClient = new AwsIotMqttClient(new SsmIotEndpointProvider({ fallbackValue: '' }));
  const lockerThing = new LockerDeviceThing(mqttClient, getDeviceTopicTemplate(getDeviceByType('locker'), 'command'));
  const scannerThing = new ScannerDeviceThing(
    mqttClient,
    getDeviceTopicTemplate(getDeviceByType('scanner'), 'feedback')
  );
  const targetResolver = new RepositoryLockerTargetResolver(repository);
  const feedbackPublisher = new MqttScannerFeedbackPublisher(scannerThing);

  return new MqttLockPublisher({
    lockerThing,
    targetResolver,
    feedbackPublisher,
  });
}

export const handler = async (event: APIGatewayProxyEventV2) => {
  const environment = loadAdminEnvironment();

  const repository = new DynamoDbAdminRepository(
    ddb as DynamoDBDocumentClient,
    environment.mainTableName,
    environment.entryLogsTableName
  );
  const auditLogger = new DynamoDbAuditLogger(ddb as DynamoDBDocumentClient, environment.auditLogsTableName);
  const presenceRepository = new DynamoDbDevicePresenceRepository(
    ddb as DynamoDBDocumentClient,
    environment.presenceTableName
  );
  const lockPublisher = createLockPublisher(environment.lockerClientType, repository);

  const service = new AdminService({
    repository,
    auditLogger,
    lockPublisher,
    presenceRepository,
    deviceOfflineThresholdMs: environment.deviceOfflineThresholdMs,
  });

  return withHandler(createAdminRouter(service))(event);
};
