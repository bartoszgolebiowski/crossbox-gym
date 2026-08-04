import { AccessService } from '../shared/providers/access-service';
import { MqttFeedbackPublisher } from '../shared/providers/feedback/mqtt-feedback';
import { createLockerClient } from '../shared/providers/lockers/index';
import { IotScanEvent } from '../shared/providers/types';
import { ddb } from '../shared/database';
import { DynamoDbAccessRepository } from '../shared/repositories';
import { IMqttFeedbackPublisher } from '../shared/providers';
import { ILockerClient } from '../shared/providers/lockers';
import { loadVerifyEntryEnvironment } from './environment';

export interface VerifyEntryDependencies {
  accessService: AccessService;
  feedbackPublisher: IMqttFeedbackPublisher;
  lockerClient: ILockerClient;
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
  return async (event: any) => {
    const parsed = parseIotScanEvent(event);
    if (!parsed.valid) {
      const scannerId = parsed.scannerId || event?.client_id || event?.scannerId || 'unknown-scanner';
      return dependencies.feedbackPublisher.sendDenial(scannerId, parsed.reason);
    }

    const { scannerId, event: iotEvent } = parsed;

    // 1. Verify raw scan payload using provider strategy abstraction
    const verification = await dependencies.accessService.verifyRawData(iotEvent.payload.raw_data);
    if (!verification.success || !verification.credential) {
      return dependencies.feedbackPublisher.sendDenial(scannerId, verification.reason);
    }

    // 2. Commit access entry, outbox command, and anti-passback state
    const commit = await dependencies.accessService.commitAccess(scannerId, verification.credential);
    if (!commit.success || !commit.entryId || !commit.lockerId) {
      return dependencies.feedbackPublisher.sendDenial(scannerId, commit.reason);
    }

    // 3. Dispatch scanner feedback signal (welcome/grant)
    const [feedbackResult, lockerPayload] = await Promise.all([
      dependencies.feedbackPublisher.sendGateUnlockSignal(scannerId, commit.entryId),
      dependencies.lockerClient.openLocker(commit.lockerId),
    ]);

    return {
      ...feedbackResult,
      lockerId: commit.lockerId,
      lockerPayload,
    };
  };
}

export const handler = async (event: any) => {
  const environment = loadVerifyEntryEnvironment();
  const repository = new DynamoDbAccessRepository(ddb, environment.mainTableName, environment.entryLogsTableName);
  return createVerifyEntryHandler({
    accessService: new AccessService(repository),
    feedbackPublisher: new MqttFeedbackPublisher(environment.iotEndpoint),
    lockerClient: createLockerClient(environment.lockerClientType, {
      endpoint: environment.iotEndpoint || '',
      lockerThingName: environment.lockerThingName,
    }),
  })(event);
};
