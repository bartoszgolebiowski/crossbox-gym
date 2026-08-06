import { ScannerItem } from '../access/types';
import { AccessCommitOutcome, AccessRepository, DeniedAccessParams, LockerUnlockParams } from '../db';
import { VerifiedCredential } from '../qr/types';

export interface ScannerGrantAudit {
  scanner: ScannerItem;
  scannerId: string;
  credential: VerifiedCredential;
}

export interface ScannerAudit {
  recordGranted(event: ScannerGrantAudit): Promise<{ outcome: AccessCommitOutcome; entryId?: string }>;
  recordDenied(event: Omit<DeniedAccessParams, 'timestamp' | 'timestampEpochSeconds'>): Promise<void>;
}

export interface LockerAudit {
  recordUnlockCommandPublished(event: Omit<LockerUnlockParams, 'timestamp' | 'timestampEpochSeconds'>): Promise<void>;
}

export class DynamoDbScannerAudit implements ScannerAudit {
  constructor(
    private readonly repository: AccessRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async recordGranted(event: ScannerGrantAudit): Promise<{ outcome: AccessCommitOutcome; entryId?: string }> {
    const timestamp = this.now();
    return this.repository.commitAccess({
      ...event,
      committedAt: timestamp.toISOString(),
      committedAtEpochSeconds: Math.floor(timestamp.getTime() / 1000),
    });
  }

  async recordDenied(event: Omit<DeniedAccessParams, 'timestamp' | 'timestampEpochSeconds'>): Promise<void> {
    const timestamp = this.now();
    await this.repository.logDeniedAccess({
      ...event,
      timestamp: timestamp.toISOString(),
      timestampEpochSeconds: Math.floor(timestamp.getTime() / 1000),
    });
  }
}

export class DynamoDbLockerAudit implements LockerAudit {
  constructor(
    private readonly repository: AccessRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async recordUnlockCommandPublished(
    event: Omit<LockerUnlockParams, 'timestamp' | 'timestampEpochSeconds'>
  ): Promise<void> {
    const timestamp = this.now();
    await this.repository.logLockerUnlock({
      ...event,
      timestamp: timestamp.toISOString(),
      timestampEpochSeconds: Math.floor(timestamp.getTime() / 1000),
    });
  }
}
