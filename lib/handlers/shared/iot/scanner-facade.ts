import { ScannerItem } from '../access/types';
import { ScannerAudit } from './audit';
import { ScannerDeviceThing } from './device';
import { MqttFeedbackPayload } from './types';

export interface ScannerFacadeDependencies {
  deviceThing: Pick<ScannerDeviceThing, 'sendDenial' | 'sendGateUnlockSignal'>;
  audit: Pick<ScannerAudit, 'recordDenied'>;
}

export interface GrantedScan {
  status: 'granted';
  scannerId: string;
  entryId: string;
  lockerId: string;
  userId: string;
  locationId: string;
}

export interface DeniedScan {
  status: 'denied';
  feedback: MqttFeedbackPayload;
}

export type ScanProcessingResult = GrantedScan | DeniedScan;

export class ScannerFacade {
  private readonly deviceThing: Pick<ScannerDeviceThing, 'sendDenial' | 'sendGateUnlockSignal'>;
  private readonly audit: Pick<ScannerAudit, 'recordDenied'>;

  constructor({ deviceThing, audit }: ScannerFacadeDependencies) {
    this.deviceThing = deviceThing;
    this.audit = audit;
  }

  async reject(scannerId: string, reason: string, scanner?: ScannerItem): Promise<DeniedScan> {
    await this.audit.recordDenied({
      scannerId,
      reason,
      locationId: scanner?.location_id || scanner?.PK.replace(/^LOC#/, ''),
      lockerId: scanner?.assigned_locker_id,
    });
    return {
      status: 'denied',
      feedback: await this.deviceThing.sendDenial(scannerId, reason),
    };
  }

  async feedback(scan: Pick<GrantedScan, 'scannerId' | 'entryId'>): Promise<MqttFeedbackPayload> {
    return this.deviceThing.sendGateUnlockSignal(scan.scannerId, scan.entryId);
  }
}
