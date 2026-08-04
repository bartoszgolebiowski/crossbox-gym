export interface IdentityProvider {
  ensureUser(userPoolId: string, email: string): Promise<string>;
}

export interface LockProvider {
  sendUnlockCommand(params: { ip: string; port?: number; path?: string; durationSeconds: number }): Promise<void>;
}

export interface PaymentProvider {
  createCheckoutSession(params: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
    enableTax?: boolean;
  }): Promise<{ url: string }>;

  createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  listInvoices(params: { customerId: string }): Promise<
    Array<{
      id: string;
      number: string | null;
      pdfUrl: string | null;
      total: number;
      tax: number;
      currency: string;
      status: string | null;
      createdAt: string;
    }>
  >;
}

export type ProviderId = 'tilde-v1-3-0' | 'basic-subscription' | 'mock' | 'unsupported';

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

export interface RawDataClassification {
  status: 'recognized' | 'unrecognized';
  providerId?: ProviderId;
  rawData: string;
  reason?: string;
}

export interface VerifiedCredential {
  subjectId: string;
  providerId: ProviderId;
  metadata?: Record<string, unknown>;
}

export interface VerificationResult {
  success: boolean;
  credential?: VerifiedCredential;
  reason?: string;
}

export interface CommitResult {
  success: boolean;
  entryId?: string;
  lockerId?: string;
  reason?: string;
}

export interface ParsedTildeV130Data {
  version: string;
  serialNumber: string;
  headerCode: string;
  keyValues: Record<string, string>;
  segments: string[];
  signature?: string;
}

export interface MqttFeedbackPayload {
  result: 'success' | 'denied';
  reason?: string;
  feedback?: string;
  entryId?: string;
  action?: 'open_gate' | 'none';
  timestamp: string;
}

export interface IProvider {
  readonly id: ProviderId;
  canHandle(rawData: string): boolean;
  verify(rawData: string, context?: Record<string, unknown>): Promise<VerificationResult>;
}

export interface IProviderClassifier {
  classify(rawData: string): Promise<RawDataClassification>;
  registerProvider(provider: IProvider): void;
}

export interface IMqttFeedbackPublisher {
  sendFeedback(scannerId: string, feedback: MqttFeedbackPayload): Promise<void>;
  sendDenial(scannerId: string, reason?: string): Promise<MqttFeedbackPayload>;
  sendGateUnlockSignal(scannerId: string, entryId: string): Promise<MqttFeedbackPayload>;
}
