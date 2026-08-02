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
  api_key_hash?: string;
  api_key_last_rotated_at?: string;
  hardware_metadata?: Record<string, string>;
  created_at: string;
  updated_at: string;
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
