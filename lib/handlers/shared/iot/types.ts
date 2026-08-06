export interface IotPayload {
  raw_data: string;
  encoding: string;
}

export interface IotScanEvent {
  event_id: string;
  client_id: string;
  timestamp: number;
  payload: IotPayload;
}

export interface MqttFeedbackPayload {
  result: 'success' | 'denied';
  reason?: string;
  feedback?: string;
  entryId?: string;
  action?: 'open_gate' | 'none';
  timestamp: string;
}

export interface LockProvider {
  sendUnlockCommand(params: { ip: string; port?: number; path?: string; durationSeconds: number }): Promise<void>;
}

export interface IMqttFeedbackPublisher {
  sendFeedback(scannerId: string, feedback: MqttFeedbackPayload): Promise<void>;
  sendDenial(scannerId: string, reason?: string): Promise<MqttFeedbackPayload>;
  sendGateUnlockSignal(scannerId: string, entryId: string): Promise<MqttFeedbackPayload>;
}
