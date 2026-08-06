import { formatDeviceTopic } from '../../../config';
import { IotMqttClient, MqttFeedbackPayload } from '../iot';

export interface LockerCommandPayload {
  id: number;
  method: string;
  params: {
    id: number;
    on: boolean;
    toggle_after: number;
  };
}

export interface IDeviceIot<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}

export interface LockerDeviceCommand {
  lockerId: string;
  id?: number;
  on?: boolean;
  toggleAfterSeconds?: number;
}

export interface ScannerFeedbackCommand {
  scannerId: string;
  payload: MqttFeedbackPayload;
}

export class LockerDeviceThing implements IDeviceIot<LockerDeviceCommand, LockerCommandPayload> {
  constructor(
    private readonly mqttClient: IotMqttClient,
    private readonly commandTopicTemplate: string
  ) {}

  async execute(command: LockerDeviceCommand): Promise<LockerCommandPayload> {
    const payload: LockerCommandPayload = {
      id: 1,
      method: 'Switch.Set',
      params: {
        id: command.id ?? 0,
        on: command.on ?? true,
        toggle_after: command.toggleAfterSeconds ?? 5,
      },
    };
    const topic = formatDeviceTopic(this.commandTopicTemplate, command.lockerId);
    await this.mqttClient.publish(topic, payload);
    return payload;
  }

  async unlock(lockerId: string): Promise<LockerCommandPayload> {
    return this.execute({ lockerId });
  }
}

export class ScannerDeviceThing implements IDeviceIot<ScannerFeedbackCommand, void> {
  constructor(
    private readonly mqttClient: IotMqttClient,
    private readonly feedbackTopicTemplate: string
  ) {}

  async execute(command: ScannerFeedbackCommand): Promise<void> {
    const topic = formatDeviceTopic(this.feedbackTopicTemplate, command.scannerId);
    await this.mqttClient.publish(topic, command.payload);
  }

  async sendDenial(scannerId: string, reason?: string): Promise<MqttFeedbackPayload> {
    const payload: MqttFeedbackPayload = {
      result: 'denied',
      reason: reason || 'access_denied',
      action: 'none',
      timestamp: new Date().toISOString(),
    };
    await this.execute({ scannerId, payload });
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
    await this.execute({ scannerId, payload });
    return payload;
  }
}
