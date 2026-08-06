export type ProviderId = 'tilde-v1-3-0' | 'basic-subscription' | 'mock' | 'unsupported';

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

export interface IProvider {
  readonly id: ProviderId;
  canHandle(rawData: string): boolean;
  verify(rawData: string, context?: Record<string, unknown>): Promise<VerificationResult>;
}

export interface IProviderClassifier {
  classify(rawData: string): Promise<RawDataClassification>;
  registerProvider(provider: IProvider): void;
}
