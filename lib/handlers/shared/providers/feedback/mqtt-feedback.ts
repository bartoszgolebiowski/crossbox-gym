import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { IMqttFeedbackPublisher, MqttFeedbackPayload } from '..';

export class MqttFeedbackPublisher implements IMqttFeedbackPublisher {
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

  async sendFeedback(scannerId: string, feedback: MqttFeedbackPayload): Promise<void> {
    if (!scannerId) return;

    try {
      const client = this.getClient();
      await client.send(
        new PublishCommand({
          topic: `gym/scanners/${scannerId}/feedback`,
          qos: 1,
          payload: Buffer.from(JSON.stringify(feedback)),
        })
      );
      console.log(`[MqttFeedbackPublisher] Successfully published feedback to gym/scanners/${scannerId}/feedback:`, feedback);
    } catch (err) {
      console.warn(`[MqttFeedbackPublisher] Failed to send MQTT feedback to scanner ${scannerId}:`, err);
    }
  }

  async sendDenial(scannerId: string, reason?: string): Promise<MqttFeedbackPayload> {
    const payload: MqttFeedbackPayload = {
      result: 'denied',
      reason: reason || 'access_denied',
      action: 'none',
      timestamp: new Date().toISOString(),
    };
    await this.sendFeedback(scannerId, payload);
    return payload;
  }

  async sendGateUnlockSignal(scannerId: string, entryId: string): Promise<MqttFeedbackPayload> {
    const payload: MqttFeedbackPayload = {
      result: 'success',
      feedback: 'Welcome to CrossBox Gym!',
      entryId,
      action: 'open_gate',
      timestamp: new Date().toISOString(),
    };
    await this.sendFeedback(scannerId, payload);
    return payload;
  }
}

export function createMqttPublisher(endpoint?: string): MqttFeedbackPublisher {
  return new MqttFeedbackPublisher(endpoint);
}
