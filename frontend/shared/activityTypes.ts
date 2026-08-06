export type ActivityTimeWindow = 'hourly' | 'daily' | 'weekly';

export interface ActivitySummaryCounts {
  total_count: number;
  success_count: number;
  unlock_count: number;
  denied_count: number;
}

export interface ActivitySeries {
  hourly_stats: Record<string, number>;
  daily_stats: Record<string, number>;
  weekly_stats: Record<string, number>;
}

export interface ActivityItem {
  entry_id: string;
  timestamp: string;
  user_id: string;
  location_id: string;
  scanner_id?: string;
  locker_id?: string;
  device_id?: string;
  qr_provider_id?: string;
  result: 'success' | 'denied';
}

export interface ActivityResponse extends ActivitySummaryCounts, ActivitySeries {
  location_id: string;
  items: ActivityItem[];
  next_token?: string;
  has_more: boolean;
}
