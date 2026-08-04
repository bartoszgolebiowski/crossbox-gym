import { formatDeviceTopic, getDeviceByType, getDeviceTopicTemplate } from '../../../../config';
import { ILockerClient, LockerCommandParams, LockerCommandPayload } from './types';

const lockerCommandTopicTemplate = getDeviceTopicTemplate(getDeviceByType('locker'), 'command');

export class MockLockerClient implements ILockerClient {
  public sentCommands: Array<{ lockerId: string; payload: LockerCommandPayload; topic: string }> = [];

  async openLocker(lockerId: string, options?: Partial<LockerCommandParams>): Promise<LockerCommandPayload> {
    const payload: LockerCommandPayload = {
      id: 1,
      method: 'Switch.Set',
      params: {
        id: options?.id ?? 0,
        on: options?.on ?? true,
        toggle_after: options?.toggle_after ?? 5,
      },
    };

    const topic = formatDeviceTopic(lockerCommandTopicTemplate, lockerId);
    this.sentCommands.push({ lockerId, payload, topic });
    console.log(`[MockLockerClient] Simulated MQTT unlock command sent to ${topic}:`, payload);
    return payload;
  }

  clear(): void {
    this.sentCommands = [];
  }
}
