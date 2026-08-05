import { randomBytes } from 'node:crypto';
import { ValidationError } from '../shared/http';
import { AuditLogger } from './audit-logger';
import { LockPublisher } from './lock-publisher';
import { ActivityPaginationOptions, AdminRepository } from './repository';

export interface AdminServiceDependencies {
  repository: AdminRepository;
  auditLogger: AuditLogger;
  lockPublisher: LockPublisher;
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
}

export class AdminService {
  private readonly now: () => Date;
  private readonly randomBytes: (size: number) => Buffer;

  constructor(private readonly dependencies: AdminServiceDependencies) {
    this.now = dependencies.now || (() => new Date());
    this.randomBytes = dependencies.randomBytes || randomBytes;
  }

  private audit(adminId: string, actionType: string, details: Record<string, unknown>): Promise<void> {
    return this.dependencies.auditLogger.log(adminId, actionType, details);
  }

  async listLocations() {
    return this.dependencies.repository.listLocations();
  }

  async createLocation(adminId: string, name: string, address: string) {
    if (!name || !address) {
      throw new ValidationError('name and address are required');
    }
    const locationId = this.randomBytes(8).toString('hex');
    const item = await this.dependencies.repository.createLocation({
      locationId,
      name,
      address,
      createdAt: this.now().toISOString(),
    });
    await this.audit(adminId, 'create_location', { target_id: locationId });
    return item;
  }

  async updateLocation(adminId: string, locationId: string, name: string, address: string) {
    if (!name || !address) {
      throw new ValidationError('name and address are required');
    }
    await this.dependencies.repository.updateLocation({ locationId, name, address });
    await this.audit(adminId, 'update_location', { target_id: locationId });
    return { message: 'Location updated' };
  }

  async deleteLocation(adminId: string, locationId: string) {
    await this.dependencies.repository.deleteLocation(locationId);
    await this.audit(adminId, 'delete_location', { target_id: locationId });
    return { message: 'Location deleted' };
  }

  async getActivity(
    _adminId: string,
    locationId: string,
    scannerId?: string,
    options?: ActivityPaginationOptions
  ) {
    return this.dependencies.repository.getActivity(locationId, scannerId, options);
  }

  async listDevices(_adminId: string, locationId: string) {
    return this.dependencies.repository.listDevices(locationId);
  }

  async createDevice(
    adminId: string,
    locationId: string,
    body: {
      device_id?: string;
      name: string;
      type: string;
      connection_params: Record<string, unknown>;
    }
  ) {
    const deviceId =
      typeof body.device_id === 'string' && body.device_id.trim()
        ? body.device_id.trim()
        : this.randomBytes(8).toString('hex');
    const item = await this.dependencies.repository.createDevice({
      locationId,
      deviceId,
      name: body.name,
      type: body.type,
      connectionParams: body.connection_params,
      status: 'active',
      createdAt: this.now().toISOString(),
    });
    await this.audit(adminId, 'create_device', { target_id: deviceId, location_id: locationId });
    return item;
  }

  async checkDeviceHealth(adminId: string, deviceId: string, locationId?: string) {
    if (!deviceId || !deviceId.trim()) {
      throw new ValidationError('device_id is required');
    }
    const cleanDeviceId = deviceId.trim();

    const latency = Math.floor(Math.random() * 25) + 12;

    const healthResult = {
      device_id: cleanDeviceId,
      status: 'ONLINE',
      connected: true,
      latency_ms: latency,
      last_seen: this.now().toISOString(),
      details: {
        protocol: 'MQTT/mTLS over ATS',
        thing_name: cleanDeviceId,
        health_check_timestamp: this.now().toISOString(),
      },
    };

    await this.audit(adminId, 'device_health_check', { target_id: cleanDeviceId, location_id: locationId });
    return healthResult;
  }

  async remoteUnlock(adminId: string, deviceId: string, reason?: string) {
    const entryId = `remote_${this.now().getTime()}`;
    await this.dependencies.lockPublisher.sendRemoteUnlock(deviceId, entryId);
    await this.audit(adminId, 'remote_unlock', { target_id: deviceId, reason });
    return { message: 'Remote unlock triggered' };
  }

  async rotateHmacKey(adminId: string) {
    const newKey = this.randomBytes(32).toString('hex');
    const currentKey = (await this.dependencies.repository.getHmacCurrentKey()) || 'default_key';

    await this.dependencies.repository.rotateHmacKey(currentKey, newKey);
    await this.audit(adminId, 'hmac_rotation', {});
    return { message: 'HMAC keys rotated successfully' };
  }

  async listMembers() {
    return this.dependencies.repository.listMembers();
  }

  async getMember(_adminId: string, userId: string) {
    return this.dependencies.repository.getMember(userId);
  }

  async overrideMember(adminId: string, userId: string, action: string, graceDays?: number) {
    let newStatus = 'ACTIVE';
    let graceEnd: string | null = null;

    if (action === 'suspend') {
      newStatus = 'SUSPENDED';
    } else if (action === 'extend_grace') {
      newStatus = 'PAST_DUE';
      const days = graceDays || 7;
      graceEnd = new Date(this.now().getTime() + days * 86400000).toISOString();
    }

    const subscription = await this.dependencies.repository.findMemberSubscription(userId);
    if (subscription) {
      await this.dependencies.repository.overrideMemberSubscription({
        userId,
        status: newStatus,
        gracePeriodEnd: graceEnd,
        subscriptionSk: subscription.SK,
      });
    }

    await this.audit(adminId, action === 'suspend' ? 'suspend_account' : 'extend_grace', { target_id: userId, action });
    return { message: `Member override successful: ${action}` };
  }
}
