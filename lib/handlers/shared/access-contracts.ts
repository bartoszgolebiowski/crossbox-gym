import {
  AccessAuthorization,
  AccessCommit,
  AccessCredential,
  AccessEvaluation,
  HardwareAdapterId,
  LockerItem,
  QrClassification,
  QrProviderId,
  ScanContent,
  ScanEnvelope,
  ScannerEnrollmentItem,
  ScannerItem,
  UnlockCommand,
} from './access-types';

/** Converts reader-specific hardware output into the scanner-neutral scan envelope. */
export interface ScannerReader {
  readonly id: HardwareAdapterId;
  read(content: ScanContent, observedAt: string): Promise<ScanEnvelope>;
}

/** Recognizes and interprets one QR credential format without making an access decision. */
export interface QrProvider {
  readonly id: QrProviderId;
  classify(scan: ScanEnvelope): Promise<QrClassification>;
}

/** Selects the permitted QR provider that owns a scan and returns its classification. */
export interface QrClassifier {
  classify(scan: ScanEnvelope, allowedProviderIds: QrProviderId[]): Promise<QrClassification>;
}

/** Applies Crossbox access rules to a recognized credential at an authenticated scanner. */
export interface AccessPolicy {
  evaluate(params: {
    credential: AccessCredential;
    scanner: ScannerItem;
    scan: ScanEnvelope;
    locker: LockerItem;
  }): Promise<AccessEvaluation>;
}

/** Atomically creates the anti-passback entry and pending unlock outbox item after read-only evaluation succeeds. */
export interface AccessCommitter {
  commit(params: {
    authorization: AccessAuthorization;
    entryId: string;
    committedAt: string;
    entryTtl: number;
    command: UnlockCommand;
  }): Promise<AccessCommit>;
}

/** Delivers durable pending unlock commands and records their delivery lifecycle. */
export interface UnlockOutboxDispatcher {
  dispatchPending(limit: number): Promise<{
    dispatched: number;
    retryableFailures: number;
    terminalFailures: number;
  }>;
}

/** Opens the locker selected by the server-side scanner registration. */
export interface LockerAdapter {
  readonly id: HardwareAdapterId;
  unlock(locker: LockerItem, command: UnlockCommand): Promise<void>;
}

/** Reads registered scanner and locker state required by runtime access processing. */
export interface AccessDeviceRegistry {
  findActiveScannerByApiKeyHash(apiKeyHash: string): Promise<ScannerItem | undefined>;
  findActiveLocker(locationId: string, lockerId: string): Promise<LockerItem | undefined>;
}

/** Creates and maintains IT-administered scanner and locker registrations. */
export interface AccessProvisioningService {
  createPendingScanner(params: {
    locationId: string;
    name: string;
    readerAdapter: HardwareAdapterId;
    allowedQrProviders: QrProviderId[];
    createdByAdminId: string;
  }): Promise<{ scanner: ScannerItem; enrollment: ScannerEnrollmentItem; enrollmentCode: string }>;

  enrollScanner(params: {
    enrollmentCode: string;
    hardwareMetadata?: Record<string, string>;
  }): Promise<{ scanner: ScannerItem; scannerApiKey: string }>;

  createLocker(params: {
    locationId: string;
    name: string;
    lockAdapter: HardwareAdapterId;
    unlockDurationSeconds: number;
    adapterConfiguration: Record<string, string>;
  }): Promise<LockerItem>;

  assignLocker(params: {
    locationId: string;
    scannerId: string;
    lockerId: string;
  }): Promise<ScannerItem>;

  rotateScannerApiKey(scannerId: string): Promise<{ scanner: ScannerItem; scannerApiKey: string }>;
}

/** Runs the runtime access flow after the scanner has been authenticated. */
export interface AccessEntryService {
  verifyScan(params: {
    scanner: ScannerItem;
    content: ScanContent;
    observedAt: string;
  }): Promise<{ result: 'success'; commit: AccessCommit } | { result: 'denied'; reason: string }>;
}