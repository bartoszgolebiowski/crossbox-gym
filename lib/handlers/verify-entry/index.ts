import { AccessService } from '../shared/providers';
import { MqttFeedbackPublisher } from '../shared/providers/feedback';
import { createLockerClient, ILockerClient } from '../shared/providers/lockers';
import { IotScanEvent } from '../shared/providers/types';

const accessService = new AccessService();
const feedbackPublisher = new MqttFeedbackPublisher();

export function parseIotScanEvent(
  rawEvent: any
): { valid: true; event: IotScanEvent; scannerId: string; lockerId?: string } | { valid: false; reason: string; scannerId?: string } {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return { valid: false, reason: 'invalid_event_structure' };
  }

  const { event_id, client_id, timestamp, payload, scannerId: fallbackScannerId, lockerId: eventLockerId, locker_id: eventLockerIdAlt } = rawEvent;
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

  const lockerId = eventLockerId || eventLockerIdAlt || payload.locker_id || payload.lockerId;

  const iotEvent: IotScanEvent = {
    event_id: event_id.trim(),
    client_id: scannerId,
    timestamp: tsNum,
    payload: {
      raw_data: payload.raw_data,
      encoding: payload.encoding.trim(),
    },
  };

  return { valid: true, event: iotEvent, scannerId, lockerId };
}

export const handler = async (event: any, lockerClientOverride?: ILockerClient) => {
  const lockerClient = lockerClientOverride || createLockerClient();

  const parsed = parseIotScanEvent(event);
  if (!parsed.valid) {
    const scannerId = parsed.scannerId || event?.client_id || event?.scannerId || 'unknown-scanner';
    return feedbackPublisher.sendDenial(scannerId, parsed.reason);
  }

  const { scannerId, event: iotEvent } = parsed;
  const lockerId = parsed.lockerId || scannerId;

  // 1. Verify raw scan payload using provider strategy abstraction
  const verification = await accessService.verifyRawData(iotEvent.payload.raw_data);
  if (!verification.success || !verification.credential) {
    return feedbackPublisher.sendDenial(scannerId, verification.reason);
  }

  // 2. Commit access entry, outbox command, and anti-passback state
  const commit = await accessService.commitAccess(scannerId, verification.credential);
  if (!commit.success || !commit.entryId) {
    return feedbackPublisher.sendDenial(scannerId, commit.reason);
  }

  // 3. Dispatch scanner feedback signal (welcome/grant)
  const [feedbackResult, lockerPayload] = await Promise.all([
    feedbackPublisher.sendGateUnlockSignal(scannerId, commit.entryId),
    lockerClient.openLocker(lockerId),
  ]);

  return {
    ...feedbackResult,
    lockerId,
    lockerPayload,
  };
};
