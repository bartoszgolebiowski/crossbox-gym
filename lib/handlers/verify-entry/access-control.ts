import { AccessService } from '../shared/access';
import { ScannerItem } from '../shared/access/types';
import { IotScanEvent, ScannerAudit } from '../shared/iot';

export type AccessDecision =
  | {
      granted: true;
      scannerId: string;
      entryId: string;
      lockerId: string;
      userId: string;
      locationId: string;
    }
  | {
      granted: false;
      scannerId: string;
      reason: string;
      scanner?: ScannerItem;
    };

export interface VerifyEntryAccessControl {
  authorizeScan(event: IotScanEvent): Promise<AccessDecision>;
}

interface VerifyEntryAccessControlDependencies {
  accessService: Pick<AccessService, 'findActiveScanner' | 'verifyRawData' | 'validateAccess'>;
  scannerAudit: Pick<ScannerAudit, 'recordGranted'>;
}

export class VerifyEntryAccessControlService implements VerifyEntryAccessControl {
  private readonly accessService: Pick<AccessService, 'findActiveScanner' | 'verifyRawData' | 'validateAccess'>;
  private readonly scannerAudit: Pick<ScannerAudit, 'recordGranted'>;

  constructor({ accessService, scannerAudit }: VerifyEntryAccessControlDependencies) {
    this.accessService = accessService;
    this.scannerAudit = scannerAudit;
  }

  async authorizeScan(event: IotScanEvent): Promise<AccessDecision> {
    const scanner = await this.accessService.findActiveScanner(event.client_id);

    const verification = await this.accessService.verifyRawData(event.payload.raw_data);
    if (!verification.success || !verification.credential) {
      const reason = verification.reason || 'verification_failed';
      return { granted: false, scannerId: event.client_id, reason, scanner };
    }

    const validation = await this.accessService.validateAccess(event.client_id, verification.credential);
    if (!validation.success) {
      return { granted: false, scannerId: event.client_id, reason: validation.reason, scanner };
    }

    const commit = await this.scannerAudit.recordGranted({
      scanner: validation.scanner,
      scannerId: event.client_id,
      credential: verification.credential,
    });
    if (commit.outcome !== 'committed' || !commit.entryId) {
      const reason = commit.outcome === 'anti_passback_cooldown' ? commit.outcome : 'transaction_failed';
      return { granted: false, scannerId: event.client_id, reason, scanner: validation.scanner };
    }

    return {
      granted: true,
      scannerId: event.client_id,
      entryId: commit.entryId,
      lockerId: validation.scanner.assigned_locker_id,
      userId: verification.credential.subjectId,
      locationId: validation.scanner.location_id || validation.scanner.PK.replace(/^LOC#/, ''),
    };
  }
}
