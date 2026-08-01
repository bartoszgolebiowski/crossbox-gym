/** Identifies the source representation supplied by a scanner reader. */
export type ScanContentKind = 'text' | 'url' | 'image' | 'vendor-payload';

/** Opaque normalized input produced by a scanner reader. */
export interface ScanContent {
  kind: ScanContentKind;
  value: string;
}

/** Scan input accepted by the access-entry boundary. Trusted physical metadata is resolved server-side. */
export interface ScanEnvelope {
  content: ScanContent;
  observed_at: string;
}

/** The lifecycle state of a registered scanner. */
export type ScannerStatus = 'pending-enrollment' | 'active' | 'disabled';

/** The lifecycle state of a registered locker. */
export type LockerStatus = 'configured' | 'active' | 'disabled' | 'unreachable';

/** The known built-in QR provider identifiers; integrations may register additional identifiers. */
export type QrProviderId = 'basic-subscription' | 'mock' | (string & {});

/** The known built-in hardware adapter identifiers; integrations may register additional identifiers. */
export type HardwareAdapterId = 'mock' | (string & {});

/** Scanner registration stored under PK=LOC#<location_id>, SK=SCANNER#<scanner_id>. */
export interface ScannerItem {
  PK: string;
  SK: string;
  scanner_id: string;
  location_id: string;
  name: string;
  status: ScannerStatus;
  reader_adapter: HardwareAdapterId;
  allowed_qr_providers: QrProviderId[];
  assigned_locker_id?: string;
  api_key_hash?: string;
  api_key_last_rotated_at?: string;
  hardware_metadata?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Locker registration stored under PK=LOC#<location_id>, SK=LOCKER#<locker_id>. */
export interface LockerItem {
  PK: string;
  SK: string;
  locker_id: string;
  location_id: string;
  name: string;
  status: LockerStatus;
  lock_adapter: HardwareAdapterId;
  unlock_duration_seconds: number;
  assigned_scanner_id?: string;
  adapter_configuration: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Hashed one-time scanner enrollment code stored under PK=SCANNER_ENROLLMENT#<hash>, SK=ENROLLMENT. */
export interface ScannerEnrollmentItem {
  PK: string;
  SK: string;
  enrollment_code_hash: string;
  scanner_id: string;
  location_id: string;
  created_by_admin_id: string;
  expires_at: string;
  ttl: number;
  consumed_at?: string;
}

/** A provider's externally meaningful subject and non-authoritative attributes. */
export interface AccessCredential {
  provider_id: QrProviderId;
  subject_id: string;
  issued_at?: string;
  expires_at?: string;
  attributes?: Record<string, string>;
}

/** The possible classification outcomes from a QR provider. */
export type QrClassification =
  | { status: 'not-recognized' }
  | { status: 'rejected'; reason: 'expired' | 'invalid' | 'unavailable' }
  | { status: 'recognized'; credential: AccessCredential };

/** The read-only outcome of central access-policy evaluation. */
export type AccessEvaluation =
  | { result: 'denied'; reason: string }
  | { result: 'allowed'; authorization: AccessAuthorization };

/** An eligible access request that has not yet changed anti-passback or entry-log state. */
export interface AccessAuthorization {
  authorization_id: string;
  user_id: string;
  provider_id: QrProviderId;
  location_id: string;
  scanner_id: string;
  locker_id: string;
  unlock_duration_seconds: number;
  scan_fingerprint: string;
  anti_passback_key: string;
  evaluated_at: string;
}

/** The server-created command sent asynchronously to the assigned locker. */
export interface UnlockCommand {
  command_id: string;
  entry_id: string;
  location_id: string;
  scanner_id: string;
  locker_id: string;
  user_id: string;
  provider_id: QrProviderId;
  duration_seconds: number;
  requested_at: string;
}

/** Delivery lifecycle state for an unlock command persisted before asynchronous dispatch. */
export type UnlockOutboxStatus = 'pending' | 'dispatched' | 'retryable-failure' | 'terminal-failure';

/** Pending unlock command stored under PK=OUTBOX#<command_id>, SK=OUTBOX and queried through OutboxStatusIndex. */
export interface UnlockOutboxItem {
  PK: string;
  SK: string;
  command: UnlockCommand;
  status: UnlockOutboxStatus;
  delivery_attempts: number;
  created_at: string;
  dispatched_at?: string;
  last_attempt_at?: string;
  last_error?: string;
  OutboxStatusPK: string;
  OutboxStatusSK: string;
}

/** The atomic persistence payload that creates an anti-passback entry and a pending unlock outbox item together. */
export interface AccessCommit {
  authorization: AccessAuthorization;
  entry_id: string;
  committed_at: string;
  entry_ttl: number;
  unlock_outbox: UnlockOutboxItem;
}

/** Entry-log fields that attribute a decision to the scanner and QR provider. */
export interface AccessDecisionAudit {
  scanner_id: string;
  locker_id?: string;
  qr_provider_id?: QrProviderId;
  scan_fingerprint: string;
  unlock_command_id?: string;
}