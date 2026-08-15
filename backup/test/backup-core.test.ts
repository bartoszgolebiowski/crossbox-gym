import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildBackupName, buildRestoredTableName, selectBackupsToDelete } from '../lib/backup-core';

describe('selectBackupsToDelete', () => {
  const now = new Date('2026-08-14T00:00:00Z');

  test('deletes backups older than the retention window', () => {
    const old = {
      BackupName: 'crossbox-gym-MainTable-20260101-000000',
      BackupArn: 'arn:old',
      BackupCreationDateTime: new Date('2026-01-01T00:00:00Z'),
    };
    assert.deepEqual(selectBackupsToDelete([old], 14, now), [old]);
  });

  test('keeps backups within the retention window', () => {
    const recent = {
      BackupName: 'crossbox-gym-MainTable-20260813-020000',
      BackupArn: 'arn:recent',
      BackupCreationDateTime: new Date('2026-08-13T02:00:00Z'),
    };
    assert.deepEqual(selectBackupsToDelete([recent], 14, now), []);
  });

  test('keeps a backup exactly at the retention boundary', () => {
    const boundary = {
      BackupName: 'crossbox-gym-MainTable-boundary',
      BackupArn: 'arn:boundary',
      BackupCreationDateTime: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
    };
    assert.deepEqual(selectBackupsToDelete([boundary], 14, now), []);
  });

  test('ignores backups not created by this project', () => {
    const foreign = {
      BackupName: 'some-other-backup',
      BackupArn: 'arn:foreign',
      BackupCreationDateTime: new Date('2020-01-01T00:00:00Z'),
    };
    assert.deepEqual(selectBackupsToDelete([foreign], 14, now), []);
  });
});

describe('buildBackupName', () => {
  test('includes the table name and a UTC timestamp', () => {
    const name = buildBackupName('MainTable', new Date('2026-08-14T02:00:05Z'));
    assert.equal(name, 'crossbox-gym-MainTable-20260814-020005');
  });
});

describe('buildRestoredTableName', () => {
  test('appends a restore suffix with a UTC timestamp', () => {
    const name = buildRestoredTableName('MainTable', new Date('2026-08-14T02:00:05Z'));
    assert.equal(name, 'MainTable-restore-20260814-020005');
  });
});
