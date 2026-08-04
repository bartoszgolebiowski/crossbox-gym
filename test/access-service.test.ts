import assert from 'node:assert/strict';
import test from 'node:test';
import { ScannerItem } from '../lib/handlers/shared/access/types';
import { AccessService } from '../lib/handlers/shared/providers/access-service';
import { AccessRepository } from '../lib/handlers/shared/repositories';

const credential = { subjectId: 'member-123', providerId: 'mock' as const };

function scanner(overrides: Partial<ScannerItem> = {}): ScannerItem {
  return {
    PK: 'LOC#site-1',
    SK: 'SCANNER#scanner-1',
    scanner_id: 'scanner-1',
    device_id: 'scanner-1',
    location_id: 'site-1',
    name: 'Front entrance scanner',
    status: 'active',
    reader_adapter: 'mock',
    allowed_qr_providers: ['mock'],
    assigned_locker_id: 'locker-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

class FakeAccessRepository implements AccessRepository {
  activeScanner?: ScannerItem;
  commits = 0;

  async findActiveScanner(): Promise<ScannerItem | undefined> {
    return this.activeScanner;
  }

  async getQrSigningKeys() {
    return { currentKey: 'test-key' };
  }

  async getUserSubscription() {
    return { status: 'ACTIVE' };
  }

  async commitAccess() {
    this.commits += 1;
    return { outcome: 'committed' as const, entryId: 'entry-1' };
  }
}

test('AccessService rejects an unknown scanner without accessing storage writes', async () => {
  const repository = new FakeAccessRepository();
  const service = new AccessService(repository);

  const result = await service.commitAccess('unknown-scanner', credential);

  assert.deepEqual(result, { success: false, reason: 'unknown_or_inactive_scanner' });
  assert.equal(repository.commits, 0);
});

test('AccessService rejects an active scanner without a locker assignment', async () => {
  const repository = new FakeAccessRepository();
  repository.activeScanner = scanner({ assigned_locker_id: '' });
  const service = new AccessService(repository);

  const result = await service.commitAccess('scanner-1', credential);

  assert.deepEqual(result, { success: false, reason: 'scanner_unassigned_locker' });
  assert.equal(repository.commits, 0);
});
