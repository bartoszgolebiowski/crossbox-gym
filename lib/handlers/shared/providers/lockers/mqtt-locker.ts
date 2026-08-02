import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { ILockerClient, LockerCommandParams, LockerCommandPayload } from './types';

export class MqttLockerClient implements ILockerClient {
  private iotData?: IoTDataPlaneClient;

  constructor(private readonly endpoint?: string) {
    const iotEndpoint = endpoint || process.env.IOT_ENDPOINT;
    if (iotEndpoint) {
      this.iotData = new IoTDataPlaneClient({ endpoint: `https://${iotEndpoint}` });
    }
  }

  private getClient(): IoTDataPlaneClient {
    if (!this.iotData) {
      const endpoint = process.env.IOT_ENDPOINT;
      this.iotData = new IoTDataPlaneClient(endpoint ? { endpoint: `https://${endpoint}` } : {});
    }
    return this.iotData;
  }

  async openLocker(lockerId: string, options?: Partial<LockerCommandParams>): Promise<LockerCommandPayload> {
    if (!lockerId) {
      throw new Error('lockerId is required to open locker');
    }

    const payload: LockerCommandPayload = {
      id: 1,
      method: 'Switch.Set',
      params: {
        id: options?.id ?? 0,
        on: options?.on ?? true,
        toggle_after: options?.toggle_after ?? 5,
      },
    };

    const topic = `gym/lockers/${lockerId}/command`;

    try {
      const client = this.getClient();
      await client.send(
        new PublishCommand({
          topic,
          qos: 1,
          payload: Buffer.from(JSON.stringify(payload)),
        })
      );
      console.log(`[MqttLockerClient] Published unlock command to ${topic}:`, payload);
    } catch (err) {
      console.warn(`[MqttLockerClient] Failed to send MQTT unlock command to locker ${lockerId}:`, err);
      throw err;
    }

    return payload;
  }
}
