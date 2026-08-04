/**
 * Integration Test Types & Contracts
 */

export interface IntegrationTestContext {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  mainTableName: string;
  entryLogsTableName: string;
  auditLogsTableName: string;
  unlockQueueUrl?: string;
  staticBucketName: string;
  stripeEventBusName?: string;
  unlockOutboxDispatcherFunctionName?: string;
  verifyEntryFunctionName?: string;
  region: string;
}

export interface TestUserSession {
  email: string;
  password: string;
  userId: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  role: 'admin' | 'member';
}

export interface TestLocationInput {
  name: string;
  address: string;
}

export interface TestLocationRecord extends TestLocationInput {
  PK: string;
  SK: string;
  locationId: string;
  created_at: string;
}

export interface TestDeviceInput {
  name: string;
  type: 'lock' | 'scanner';
  connection_params: {
    ip: string;
    port?: number;
    path?: string;
  };
  api_key: string;
}

export interface TestDeviceRecord {
  PK: string;
  SK: string;
  device_id: string;
  name: string;
  type: 'lock' | 'scanner';
  connection_params: { ip: string; port?: number; path?: string };
  api_key_hash: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface TestScannerRecord {
  PK: string;
  SK: string;
  scanner_id: string;
  location_id: string;
  name: string;
  status: 'active' | 'disabled' | 'pending-enrollment';
  reader_adapter: string;
  allowed_qr_providers: string[];
  assigned_locker_id: string;
  api_key_hash: string;
  scanner_api_key?: string;
}

export interface TestLockerRecord {
  PK: string;
  SK: string;
  locker_id: string;
  location_id: string;
  name: string;
  status: 'active' | 'disabled' | 'configured' | 'unreachable';
  lock_adapter: string;
  unlock_duration_seconds: number;
  assigned_scanner_id?: string;
  adapter_configuration: Record<string, string>;
}

export interface TestQRPayload {
  user_id: string;
  timestamp: number;
  hmac: string;
}

export interface VerifyEntryRequest {
  qr_code: string | TestQRPayload;
}

export type VerifyEntryResultStatus = 'success' | 'denied';

export type VerifyDenialReason =
  | 'invalid_device'
  | 'invalid_qr'
  | 'qr_expired'
  | 'invalid_qr_hmac'
  | 'subscription_inactive'
  | 'anti_passback_cooldown';

export interface VerifyEntryResponseBody {
  result: VerifyEntryResultStatus;
  reason?: VerifyDenialReason;
  feedback?: string;
}

export interface CheckoutSessionResponseBody {
  url: string;
}

export interface PortalSessionResponseBody {
  url: string;
}

export interface MemberDashboardResponseBody {
  user?: Record<string, any>;
  subscription?: Record<string, any>;
  locations: Array<Record<string, any>>;
}

export interface MagicLinkVerifyResponseBody {
  verified: boolean;
  email: string;
  message: string;
}

export interface GenericMessageResponseBody {
  message: string;
}
