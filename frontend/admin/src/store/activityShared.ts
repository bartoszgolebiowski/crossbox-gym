export type ActivityTimeWindow = 'hourly' | 'daily' | 'weekly';
export type PaginationDirection = 'first' | 'next' | 'prev';

export interface ActivityPaginationState {
  selectedLocationId: string;
  selectedDeviceId: string;
  timeWindow: ActivityTimeWindow;
  activityData: unknown;
  isLoading: boolean;
  error: string | null;
  searchFilter: string;
  pageSize: 10 | 20 | 50;
  currentPage: number;
  pageTokens: (string | undefined)[];
}

export interface PaginationTarget {
  targetPage: number;
  nextToken: string | undefined;
}

export function resolvePaginationTarget(
  direction: PaginationDirection,
  currentPage: number,
  pageTokens: (string | undefined)[]
): PaginationTarget {
  if (direction === 'first') {
    return { targetPage: 0, nextToken: undefined };
  }

  if (direction === 'next') {
    const targetPage = currentPage + 1;
    return { targetPage, nextToken: pageTokens[targetPage] };
  }

  const targetPage = Math.max(currentPage - 1, 0);
  return { targetPage, nextToken: pageTokens[targetPage] };
}

export function buildActivityQueryPath(params: {
  locationId: string;
  timeWindow: ActivityTimeWindow;
  pageSize: number;
  selectedDeviceId: string;
  deviceParamName: 'scanner_id' | 'locker_id';
  nextToken?: string;
}): string {
  const { locationId, timeWindow, pageSize, selectedDeviceId, deviceParamName, nextToken } = params;
  let queryPath = `/admin/locations/${locationId}/activity?window=${timeWindow}&limit=${pageSize}`;

  if (selectedDeviceId !== 'all') {
    queryPath += `&${deviceParamName}=${selectedDeviceId}`;
  }

  if (nextToken) {
    queryPath += `&next_token=${encodeURIComponent(nextToken)}`;
  }

  return queryPath;
}

export function applyPaginationReset<
  T extends { currentPage: number; pageTokens: (string | undefined)[]; activityData: unknown },
>(state: T): void {
  state.currentPage = 0;
  state.pageTokens = [undefined];
  state.activityData = null;
}

export function applyActivityPageResult<
  T extends { activityData: unknown; currentPage: number; pageTokens: (string | undefined)[] },
>(state: T, payload: { data: { next_token?: string }; targetPage: number }): void {
  const { data, targetPage } = payload;
  state.activityData = data;
  state.currentPage = targetPage;
  if (data.next_token) {
    state.pageTokens[targetPage + 1] = data.next_token;
  }
}
