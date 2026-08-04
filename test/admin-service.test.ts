import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AuditLogger } from '../lib/handlers/admin/audit-logger';
import { LockPublisher } from '../lib/handlers/admin/lock-publisher';
import {
  ActivityAggregation,
  AdminRepository,
  CreateDeviceParams,
  CreateLocationParams,
  CreateScannerParams,
  MemberOverrideParams,
} from '../lib/handlers/admin/repository';
import { AdminService } from '../lib/handlers/admin/service';

class FakeAdminRepository implements AdminRepository {
  locations: Record<string, unknown>[] = [];
  scanners: Record<string, unknown>[] = [];
  devices: Record<string, unknown>[] = [];
  deletedLocations: string[] = [];
  updatedLocations: { locationId: string; name: string; address: string }[] = [];
  members: Record<string, unknown>[] = [];
  memberRecords: Record<string, Record<string, unknown>[]> = {};
  hmacRotations: { currentKey: string; newKey: string }[] = [];
  hmacCurrentKey?: string;
  memberOverrides: MemberOverrideParams[] = [];
  subscriptionsByUser = new Map<string, { PK: string; SK: string }>();

  async listLocations(): Promise<Record<string, unknown>[]> {
    return this.locations;
  }

  async createLocation(params: CreateLocationParams): Promise<Record<string, unknown>> {
    const item = { PK: `LOC#${params.locationId}`, name: params.name, address: params.address };
    this.locations.push(item);
    return item;
  }

  async updateLocation(params: { locationId: string; name: string; address: string }): Promise<void> {
    this.updatedLocations.push(params);
  }

  async deleteLocation(locationId: string): Promise<void> {
    this.deletedLocations.push(locationId);
  }

  async listScanners(): Promise<Record<string, unknown>[]> {
    return this.scanners;
  }

  async createScanner(params: CreateScannerParams): Promise<Record<string, unknown>> {
    const item = {
      PK: `LOC#${params.locationId}`,
      SK: `SCANNER#${params.scannerId}`,
      scanner_id: params.scannerId,
      assigned_locker_id: params.assignedLockerId,
    };
    this.scanners.push(item);
    return item;
  }

  async listDevices(): Promise<Record<string, unknown>[]> {
    return this.devices;
  }

  async createDevice(params: CreateDeviceParams): Promise<Record<string, unknown>> {
    const item = {
      PK: `LOC#${params.locationId}`,
      SK: `DEV#${params.deviceId}`,
      device_id: params.deviceId,
      type: params.type,
    };
    this.devices.push(item);
    return item;
  }

  async getActivity(locationId: string, _scannerId?: string): Promise<ActivityAggregation> {
    return {
      location_id: locationId,
      total_count: 0,
      success_count: 0,
      denied_count: 0,
      hourly_stats: {},
      daily_stats: {},
      weekly_stats: {},
      items: [],
    };
  }

  async listMembers(): Promise<Record<string, unknown>[]> {
    return this.members;
  }

  async getMember(userId: string): Promise<Record<string, unknown>[]> {
    return this.memberRecords[userId] || [];
  }

  async findMemberSubscription(userId: string): Promise<{ PK: string; SK: string } | undefined> {
    return this.subscriptionsByUser.get(userId);
  }

  async overrideMemberSubscription(params: MemberOverrideParams): Promise<void> {
    this.memberOverrides.push(params);
  }

  async rotateHmacKey(currentKey: string, newKey: string): Promise<void> {
    this.hmacRotations.push({ currentKey, newKey });
    this.hmacCurrentKey = newKey;
  }

  async getHmacCurrentKey(): Promise<string | undefined> {
    return this.hmacCurrentKey;
  }
}

class FakeAuditLogger implements AuditLogger {
  logs: Array<{ adminId: string; actionType: string; details: Record<string, unknown> }> = [];

  async log(adminId: string, actionType: string, details: Record<string, unknown>): Promise<void> {
    this.logs.push({ adminId, actionType, details });
  }
}

class FakeLockPublisher implements LockPublisher {
  sentUnlocks: Array<{ deviceId: string; entryId: string }> = [];

  async sendRemoteUnlock(deviceId: string, entryId: string): Promise<void> {
    this.sentUnlocks.push({ deviceId, entryId });
  }
}

describe('AdminService', () => {
  const fixedNow = new Date('2026-01-01T12:00:00.000Z');
  const fixedRandomBytes = Buffer.from('a'.repeat(32), 'ascii');

  function createService() {
    const repository = new FakeAdminRepository();
    const auditLogger = new FakeAuditLogger();
    const lockPublisher = new FakeLockPublisher();
    const service = new AdminService({
      repository,
      auditLogger,
      lockPublisher,
      now: () => fixedNow,
      randomBytes: () => fixedRandomBytes,
    });
    return { service, repository, auditLogger, lockPublisher };
  }

  test('createLocation creates location', async () => {
    const { service, repository, auditLogger } = createService();
    const result = await service.createLocation('admin-1', 'Main Gym', 'Warsaw');

    assert.equal((result as any).name, 'Main Gym');
    assert.equal(repository.locations.length, 1);
    assert.equal(auditLogger.logs[0].actionType, 'create_location');
  });

  test('createLocation requires name and address', async () => {
    const { service } = createService();
    await assert.rejects(() => service.createLocation('admin-1', '', 'Warsaw'), /name and address are required/);
  });

  test('updateLocation updates location', async () => {
    const { service, repository } = createService();
    await service.updateLocation('admin-1', 'loc-1', 'New Name', 'New Address');

    assert.equal(repository.updatedLocations.length, 1);
  });

  test('deleteLocation deletes location', async () => {
    const { service, repository } = createService();
    await service.deleteLocation('admin-1', 'loc-1');

    assert.deepEqual(repository.deletedLocations, ['loc-1']);
  });

  test('createScanner requires assigned_locker_id', async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createScanner('admin-1', 'loc-1', { assigned_locker_id: '' } as any),
      /assigned_locker_id is required when registering a scanner/
    );
  });

  test('createScanner creates scanner and audits', async () => {
    const { service, repository, auditLogger } = createService();
    const result = await service.createScanner('admin-1', 'loc-1', {
      assigned_locker_id: 'locker-1',
      name: 'Scanner 1',
    });

    assert.equal((result as any).assigned_locker_id, 'locker-1');
    assert.ok((result as any).scanner_api_key);
    assert.equal(repository.scanners.length, 1);
    assert.equal(auditLogger.logs[0].actionType, 'create_scanner');
  });

  test('createDevice creates device and audits', async () => {
    const { service, repository, auditLogger } = createService();
    const result = await service.createDevice('admin-1', 'loc-1', {
      name: 'Main Door',
      type: 'lock',
      connection_params: { ip: '10.0.0.1' },
    });

    assert.equal((result as any).type, 'lock');
    assert.equal(repository.devices.length, 1);
    assert.equal(auditLogger.logs[0].actionType, 'create_device');
  });

  test('remoteUnlock publishes unlock and audits', async () => {
    const { service, lockPublisher, auditLogger } = createService();
    const result = await service.remoteUnlock('admin-1', 'device-1', 'member locked out');

    assert.equal(result.message, 'Remote unlock triggered');
    assert.equal(lockPublisher.sentUnlocks.length, 1);
    assert.equal(lockPublisher.sentUnlocks[0].deviceId, 'device-1');
    assert.equal(auditLogger.logs[0].actionType, 'remote_unlock');
  });

  test('rotateHmacKey rotates keys and audits', async () => {
    const { service, repository, auditLogger } = createService();
    const result = await service.rotateHmacKey('admin-1');

    assert.equal(result.message, 'HMAC keys rotated successfully');
    assert.equal(repository.hmacRotations.length, 1);
    assert.equal(auditLogger.logs[0].actionType, 'hmac_rotation');
  });

  test('overrideMember suspends subscription', async () => {
    const { service, repository, auditLogger } = createService();
    repository.subscriptionsByUser.set('user-1', { PK: 'USER#user-1', SK: 'SUB#sub-1' });

    const result = await service.overrideMember('admin-1', 'user-1', 'suspend');

    assert.equal(result.message, 'Member override successful: suspend');
    assert.equal(repository.memberOverrides.length, 1);
    assert.equal(repository.memberOverrides[0].status, 'SUSPENDED');
    assert.equal(auditLogger.logs[0].actionType, 'suspend_account');
  });

  test('overrideMember extends grace period', async () => {
    const { service, repository, auditLogger } = createService();
    repository.subscriptionsByUser.set('user-1', { PK: 'USER#user-1', SK: 'SUB#sub-1' });

    await service.overrideMember('admin-1', 'user-1', 'extend_grace', 3);

    assert.equal(repository.memberOverrides[0].status, 'PAST_DUE');
    assert.ok(repository.memberOverrides[0].gracePeriodEnd);
    assert.equal(auditLogger.logs[0].actionType, 'extend_grace');
  });
});
