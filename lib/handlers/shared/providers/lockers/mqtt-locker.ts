import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { formatDeviceTopic, getDeviceByType, getDeviceTopicTemplate } from '../../../../config';
import { ILockerConfigProvider } from './ssm-config-provider';
import { ILockerClient, LockerCommandParams, LockerCommandPayload } from './types';

const defaultLockerThingName = getDeviceByType('locker').thingName;
const lockerCommandTopicTemplate = getDeviceTopicTemplate(getDeviceByType('locker'), 'command');

export class MqttLockerClient implements ILockerClient {
  private iotDataClients = new Map<string, IoTDataPlaneClient>();
  private readonly configProvider: ILockerConfigProvider;

  constructor(endpointOrConfigProvider: string | ILockerConfigProvider) {
    if (typeof endpointOrConfigProvider === 'string') {
      const endpointStr = endpointOrConfigProvider;
      this.configProvider = {
        async getConfig() {
          return {
            endpoint: endpointStr,
            lockerThingName: defaultLockerThingName,
          };
        },
      };
    } else {
      this.configProvider = endpointOrConfigProvider;
    }
  }

  async openLocker(lockerId?: string, options?: Partial<LockerCommandParams>): Promise<LockerCommandPayload> {
    const config = await this.configProvider.getConfig();
    const targetLockerId = lockerId && lockerId.trim() ? lockerId.trim() : config.lockerThingName;

    if (!targetLockerId) {
      throw new Error('lockerId or default lockerThingName is required to open locker');
    }

    let client = this.iotDataClients.get(config.endpoint);
    if (!client) {
      client = new IoTDataPlaneClient(config.endpoint ? { endpoint: `https://${config.endpoint}` } : {});
      this.iotDataClients.set(config.endpoint, client);
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

    const topic = formatDeviceTopic(lockerCommandTopicTemplate, targetLockerId);

    try {
      await client.send(
        new PublishCommand({
          topic,
          qos: 1,
          payload: Buffer.from(JSON.stringify(payload)),
        })
      );
      console.log(`[MqttLockerClient] Published unlock command to ${topic}:`, payload);
    } catch (err) {
      console.warn(`[MqttLockerClient] Failed to send MQTT unlock command to locker ${targetLockerId}:`, err);
      throw err;
    }

    return payload;
  }
}
