import { LockerAudit } from '../iot';
import { LockerCommandPayload, LockerDeviceThing } from './device-iot';

export interface LockerUnlockCommand {
  lockerId: string;
  scannerId: string;
  userId: string;
  entryId: string;
  locationId: string;
}

export interface LockerFacadeDependencies {
  deviceThing: Pick<LockerDeviceThing, 'unlock'>;
  audit: LockerAudit;
}

export class LockerFacade {
  private readonly deviceThing: Pick<LockerDeviceThing, 'unlock'>;
  private readonly audit: LockerAudit;

  constructor({ deviceThing, audit }: LockerFacadeDependencies) {
    this.deviceThing = deviceThing;
    this.audit = audit;
  }

  async unlock(command: LockerUnlockCommand): Promise<LockerCommandPayload> {
    const payload = await this.deviceThing.unlock(command.lockerId);
    await this.audit.recordUnlockCommandPublished(command);
    return payload;
  }
}
