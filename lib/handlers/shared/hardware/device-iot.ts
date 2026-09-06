import { formatDeviceTopic } from '../../../config';
import { IotMqttClient, MqttFeedbackPayload } from '../iot';

export interface LockerCommandPayload {
  id: number;
  src: string;
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
  src?: string;
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
    const durationSeconds = command.toggleAfterSeconds ?? 5.0;
    const payload: LockerCommandPayload = {
      id: command.id ?? Date.now(),
      src: command.src || 'crossbox-api',
      method: 'Switch.Set',
      params: {
        id: 0,
        on: command.on ?? false, // Fail-Secure Inversion: on=false otwiera elektromagnes
        toggle_after: durationSeconds, // Wymagane gdy on=false!
      },
    };
    const topic = formatDeviceTopic(this.commandTopicTemplate, command.lockerId);
    await this.mqttClient.publish(topic, payload);
    return payload;
  }

  async unlock(lockerId: string, src = 'crossbox-api', durationSeconds = 5.0): Promise<LockerCommandPayload> {
    return this.execute({ lockerId, src, on: false, toggleAfterSeconds: durationSeconds });
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
