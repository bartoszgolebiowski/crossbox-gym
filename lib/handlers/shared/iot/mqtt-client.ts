import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { ISsmValueProvider } from '../ssm/value-provider';

export interface IotMqttClient {
  publish(topic: string, payload: unknown): Promise<void>;
}

export class AwsIotMqttClient implements IotMqttClient {
  private client: IoTDataPlaneClient;

  constructor(private readonly endpointOrProvider: ISsmValueProvider) {}

  private normalizeEndpoint(endpoint: string): string {
    const trimmed = endpoint.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  private async getClient(): Promise<IoTDataPlaneClient> {
    if (this.client) {
      return this.client;
    }
    const endpoint = await this.endpointOrProvider.get();
    if (!endpoint || !endpoint.trim()) {
      throw new Error('IoT endpoint is required to create IoTDataPlaneClient');
    }

    const client = new IoTDataPlaneClient({ endpoint: this.normalizeEndpoint(endpoint) });
    this.client = client;

    return client;
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    const client = await this.getClient();
    await client.send(
      new PublishCommand({
        topic,
        qos: 1,
        payload: Buffer.from(JSON.stringify(payload)),
      })
    );
  }
}
