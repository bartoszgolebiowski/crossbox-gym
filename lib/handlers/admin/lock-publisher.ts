import { LockerDeviceThing, ScannerDeviceThing } from '../shared/iot';

export interface LockPublisher {
  sendRemoteUnlock(deviceId: string, entryId: string): Promise<void>;
}

export interface LockerTargetResolver {
  resolve(deviceId: string): Promise<string>;
}

export class PassthroughLockerTargetResolver implements LockerTargetResolver {
  async resolve(deviceId: string): Promise<string> {
    return deviceId;
  }
}

export interface LockerAssignmentLookup {
  findAssignedLockerId(deviceId: string): Promise<string | undefined>;
}

export class RepositoryLockerTargetResolver implements LockerTargetResolver {
  constructor(private readonly repository: LockerAssignmentLookup) {}

  async resolve(deviceId: string): Promise<string> {
    const assignedLockerId = await this.repository.findAssignedLockerId(deviceId);
    return assignedLockerId || deviceId;
  }
}

export interface ScannerFeedbackPublisher {
  sendUnlockFeedback(deviceId: string, entryId: string): Promise<void>;
}

export class NoOpScannerFeedbackPublisher implements ScannerFeedbackPublisher {
  async sendUnlockFeedback(_deviceId: string, _entryId: string): Promise<void> {
    return;
  }
}

export class MqttScannerFeedbackPublisher implements ScannerFeedbackPublisher {
  constructor(private readonly scannerThing: Pick<ScannerDeviceThing, 'sendGateUnlockSignal'>) {}

  async sendUnlockFeedback(deviceId: string, entryId: string): Promise<void> {
    try {
      await this.scannerThing.sendGateUnlockSignal(deviceId, entryId);
    } catch (err) {
      console.warn(`[MqttLockPublisher] Failed to send feedback to scanner ${deviceId}:`, err);
    }
  }
}

export interface MqttLockPublisherDependencies {
  lockerThing: Pick<LockerDeviceThing, 'unlock'>;
  targetResolver: LockerTargetResolver;
  feedbackPublisher: ScannerFeedbackPublisher;
}

export class MqttLockPublisher implements LockPublisher {
  constructor(private readonly dependencies: MqttLockPublisherDependencies) {}

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    const targetLockerId = await this.dependencies.targetResolver.resolve(deviceId);

    await Promise.all([
      this.dependencies.lockerThing.unlock(targetLockerId),
      this.dependencies.feedbackPublisher.sendUnlockFeedback(deviceId, entryId),
    ]);
  }
}

export class NoOpLockPublisher implements LockPublisher {
  sentUnlocks: Array<{ deviceId: string; entryId: string }> = [];

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    this.sentUnlocks.push({ deviceId, entryId });
  }
}
