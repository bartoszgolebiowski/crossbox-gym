import { IMqttFeedbackPublisher } from '../shared/providers';

export interface LockPublisher {
  sendRemoteUnlock(deviceId: string, entryId: string): Promise<void>;
}

export class MqttLockPublisher implements LockPublisher {
  constructor(private readonly publisher: IMqttFeedbackPublisher) {}

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    await this.publisher.sendGateUnlockSignal(deviceId, entryId);
  }
}

export class NoOpLockPublisher implements LockPublisher {
  sentUnlocks: Array<{ deviceId: string; entryId: string }> = [];

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    this.sentUnlocks.push({ deviceId, entryId });
  }
}
