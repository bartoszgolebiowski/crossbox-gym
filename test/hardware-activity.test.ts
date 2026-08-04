import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

interface ActivityItem {
  entry_id: string;
  timestamp: string;
  scanner_id?: string;
  locker_id?: string;
  result: 'success' | 'denied';
}

function aggregateActivity(items: ActivityItem[]) {
  const hourly_stats: Record<string, number> = {};
  const daily_stats: Record<string, number> = {};
  const weekly_stats: Record<string, number> = {};
  let successCount = 0;
  let deniedCount = 0;

  for (const item of items) {
    if (item.result === 'success') successCount++;
    else deniedCount++;

    const date = new Date(item.timestamp);
    if (isNaN(date.getTime())) continue;

    const hourKey = `${date.toISOString().slice(0, 13)}:00`;
    const dayKey = date.toISOString().slice(0, 10);

    const jan1 = new Date(date.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    const weekKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    hourly_stats[hourKey] = (hourly_stats[hourKey] || 0) + 1;
    daily_stats[dayKey] = (daily_stats[dayKey] || 0) + 1;
    weekly_stats[weekKey] = (weekly_stats[weekKey] || 0) + 1;
  }

  return {
    total_count: items.length,
    success_count: successCount,
    denied_count: deniedCount,
    hourly_stats,
    daily_stats,
    weekly_stats,
  };
}

describe('Hardware activity aggregation unit suite', () => {
  test('aggregates activity logs by hour, day, and week correctly', () => {
    const mockItems: ActivityItem[] = [
      {
        entry_id: '1',
        timestamp: '2026-08-01T10:15:00.000Z',
        scanner_id: 'sc-1',
        locker_id: 'lk-1',
        result: 'success',
      },
      {
        entry_id: '2',
        timestamp: '2026-08-01T10:45:00.000Z',
        scanner_id: 'sc-1',
        locker_id: 'lk-1',
        result: 'success',
      },
      { entry_id: '3', timestamp: '2026-08-01T14:20:00.000Z', scanner_id: 'sc-2', locker_id: 'lk-2', result: 'denied' },
      {
        entry_id: '4',
        timestamp: '2026-07-30T09:00:00.000Z',
        scanner_id: 'sc-1',
        locker_id: 'lk-1',
        result: 'success',
      },
    ];

    const stats = aggregateActivity(mockItems);

    assert.equal(stats.total_count, 4);
    assert.equal(stats.success_count, 3);
    assert.equal(stats.denied_count, 1);

    // Hourly check
    assert.equal(stats.hourly_stats['2026-08-01T10:00'], 2);
    assert.equal(stats.hourly_stats['2026-08-01T14:00'], 1);

    // Daily check
    assert.equal(stats.daily_stats['2026-08-01'], 3);
    assert.equal(stats.daily_stats['2026-07-30'], 1);
  });
});
