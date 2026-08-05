import { IMqttFeedbackPublisher } from '../shared/providers';
import { ILockerClient } from '../shared/providers/lockers';

export interface LockPublisher {
  sendRemoteUnlock(deviceId: string, entryId: string): Promise<void>;
}

export class MqttLockPublisher implements LockPublisher {
  constructor(
    private readonly lockerClient: ILockerClient,
    private readonly feedbackPublisher?: IMqttFeedbackPublisher,
    private readonly lockerResolver?: (deviceId: string) => Promise<string | undefined>
  ) {}

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    const targetLockerId = this.lockerResolver ? (await this.lockerResolver(deviceId)) || deviceId : deviceId;

    await Promise.all([
      this.lockerClient.openLocker(targetLockerId, { toggle_after: 5 }),
      this.feedbackPublisher
        ? this.feedbackPublisher.sendGateUnlockSignal(deviceId, entryId).catch((err) => {
            console.warn(`[MqttLockPublisher] Failed to send feedback to scanner ${deviceId}:`, err);
          })
        : Promise.resolve(),
    ]);
  }
}

export class NoOpLockPublisher implements LockPublisher {
  sentUnlocks: Array<{ deviceId: string; entryId: string }> = [];

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    this.sentUnlocks.push({ deviceId, entryId });
  }
}
