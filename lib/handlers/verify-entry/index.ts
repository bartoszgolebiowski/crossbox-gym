import { getDeviceByType, getDeviceTopicTemplate } from '../../config';
import { AccessService } from '../shared/access';
import { ddb, DynamoDbAccessRepository } from '../shared/db';
import {
  AwsIotMqttClient,
  DynamoDbLockerAudit,
  DynamoDbScannerAudit,
  IotScanEvent,
  LockerDeviceThing,
  LockerFacade,
  ScannerDeviceThing,
  ScannerFacade,
} from '../shared/iot';
import { SsmIotEndpointProvider } from '../shared/ssm';
import { VerifyEntryAccessControl, VerifyEntryAccessControlService } from './access-control';
import { loadVerifyEntryEnvironment } from './environment';

export interface VerifyEntryDependencies {
  accessControl: VerifyEntryAccessControl;
  scannerFacade: Pick<ScannerFacade, 'reject' | 'feedback'>;
  lockerFacade: Pick<LockerFacade, 'unlock'>;
}

export function parseIotScanEvent(
  rawEvent: any
): { valid: true; event: IotScanEvent; scannerId: string } | { valid: false; reason: string; scannerId?: string } {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return { valid: false, reason: 'invalid_event_structure' };
  }

  const { event_id, client_id, timestamp, payload, scannerId: fallbackScannerId } = rawEvent;
  const scannerId = (client_id || fallbackScannerId || '').trim();

  if (typeof event_id !== 'string' || !event_id.trim()) {
    return { valid: false, reason: 'missing_or_invalid_event_id', scannerId };
  }

  if (!scannerId) {
    return { valid: false, reason: 'missing_or_invalid_client_id', scannerId };
  }

  const tsNum = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (isNaN(tsNum) || tsNum <= 0) {
    return { valid: false, reason: 'missing_or_invalid_timestamp', scannerId };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'missing_or_invalid_payload', scannerId };
  }

  if (typeof payload.raw_data !== 'string' || !payload.raw_data.trim()) {
    return { valid: false, reason: 'missing_or_invalid_raw_data', scannerId };
  }

  if (typeof payload.encoding !== 'string' || !payload.encoding.trim()) {
    return { valid: false, reason: 'missing_or_invalid_encoding', scannerId };
  }

  const iotEvent: IotScanEvent = {
    event_id: event_id.trim(),
    client_id: scannerId,
    timestamp: tsNum,
    payload: {
      raw_data: payload.raw_data,
      encoding: payload.encoding.trim(),
    },
  };

  return { valid: true, event: iotEvent, scannerId };
}

export function createVerifyEntryHandler(dependencies: VerifyEntryDependencies) {
  const { accessControl, scannerFacade, lockerFacade } = dependencies;
  return async (event: any) => {
    const parsed = parseIotScanEvent(event);
    if (!parsed.valid) {
      const scannerId = parsed.scannerId || event?.client_id || event?.scannerId || 'unknown-scanner';
      const rejected = await scannerFacade.reject(scannerId, parsed.reason);
      return rejected.feedback;
    }

    const decision = await accessControl.authorizeScan(parsed.event);
    if (!decision.granted) {
      const rejected = await scannerFacade.reject(decision.scannerId, decision.reason, decision.scanner);
      return rejected.feedback;
    }

    const [feedback, lockerPayload] = await Promise.all([
      scannerFacade.feedback(decision),
      lockerFacade.unlock(decision),
    ]);

    return {
      ...feedback,
      lockerId: decision.lockerId,
      lockerPayload,
    };
  };
}

export const handler = async (event: any) => {
  const environment = loadVerifyEntryEnvironment();
  const repository = new DynamoDbAccessRepository(ddb, environment.mainTableName, environment.entryLogsTableName);
  const accessService = new AccessService(repository);
  const scannerAudit = new DynamoDbScannerAudit(repository);
  const lockerAudit = new DynamoDbLockerAudit(repository);
  const mqttClient = new AwsIotMqttClient(new SsmIotEndpointProvider({ fallbackValue: '' }));
  const scannerDeviceThing = new ScannerDeviceThing(
    mqttClient,
    getDeviceTopicTemplate(getDeviceByType('scanner'), 'feedback')
  );
  const lockerDeviceThing = new LockerDeviceThing(
    mqttClient,
    getDeviceTopicTemplate(getDeviceByType('locker'), 'command')
  );

  const lockerFacade = new LockerFacade({
    deviceThing: lockerDeviceThing,
    audit: lockerAudit,
  });
  const scannerFacade = new ScannerFacade({
    deviceThing: scannerDeviceThing,
    audit: scannerAudit,
  });
  const accessControl = new VerifyEntryAccessControlService({
    accessService,
    scannerAudit,
  });

  return createVerifyEntryHandler({
    accessControl,
    scannerFacade,
    lockerFacade,
  })(event);
};
