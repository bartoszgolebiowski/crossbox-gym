import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { adminApiClient } from '../services/apiClient';
import { DeviceItem } from './adminSlice';

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

export interface ActivityResponse {
  location_id: string;
  total_count: number;
  success_count: number;
  denied_count: number;
  hourly_stats: Record<string, number>;
  daily_stats: Record<string, number>;
  weekly_stats: Record<string, number>;
  items: ActivityItem[];
  next_token?: string;
  has_more: boolean;
}

export interface HardwareActivityState {
  selectedLocationId: string;
  scanners: Array<{ scanner_id: string; name: string }>;
  selectedDeviceId: string;
  timeWindow: 'hourly' | 'daily' | 'weekly';
  activityData: ActivityResponse | null;
  isLoading: boolean;
  error: string | null;
  searchFilter: string;
  pageSize: 10 | 20 | 50;
  currentPage: number;
  pageTokens: (string | undefined)[];
}

const initialState: HardwareActivityState = {
  selectedLocationId: '',
  scanners: [],
  selectedDeviceId: 'all',
  timeWindow: 'daily',
  activityData: null,
  isLoading: false,
  error: null,
  searchFilter: '',
  pageSize: 20,
  currentPage: 0,
  pageTokens: [undefined],
};

export const fetchHardwareDevicesThunk = createAsyncThunk(
  'hardwareActivity/fetchDevices',
  async (locationId: string, { rejectWithValue }) => {
    try {
      const devicesList = await adminApiClient
        .get<DeviceItem[]>(`/admin/locations/${locationId}/devices`)
        .catch(() => []);
      const mapped = (devicesList || [])
        .filter((d) => d.device_id && d.type === 'scanner')
        .map((d) => ({
          scanner_id: d.device_id,
          name: d.name || d.device_id,
        }));
      return {
        scanners: mapped,
      };
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch hardware devices');
    }
  }
);

export const fetchActivityThunk = createAsyncThunk(
  'hardwareActivity/fetchActivity',
  async (payload: { direction?: 'first' | 'next' | 'prev' } | undefined, { getState, rejectWithValue }) => {
    const state = getState() as { hardwareActivity: HardwareActivityState };
    const { selectedLocationId, timeWindow, selectedDeviceId, pageSize, currentPage, pageTokens } =
      state.hardwareActivity;
    if (!selectedLocationId) {
      return rejectWithValue('No location selected');
    }

    const direction = payload?.direction || 'first';
    let targetPage = currentPage;
    let nextToken: string | undefined;

    if (direction === 'first') {
      targetPage = 0;
      nextToken = undefined;
    } else if (direction === 'next') {
      targetPage = currentPage + 1;
      nextToken = pageTokens[targetPage];
    } else if (direction === 'prev') {
      targetPage = Math.max(currentPage - 1, 0);
      nextToken = pageTokens[targetPage];
    }

    let queryPath = `/admin/locations/${selectedLocationId}/activity?window=${timeWindow}&limit=${pageSize}`;
    if (selectedDeviceId !== 'all') {
      queryPath += `&scanner_id=${selectedDeviceId}`;
    }
    if (nextToken) {
      queryPath += `&next_token=${encodeURIComponent(nextToken)}`;
    }

    try {
      const data = await adminApiClient.get<ActivityResponse>(queryPath);
      return { data, targetPage };
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch activity logs');
    }
  }
);

const hardwareActivitySlice = createSlice({
  name: 'hardwareActivity',
  initialState,
  reducers: {
    setSelectedLocationId: (state, action: PayloadAction<string>) => {
      state.selectedLocationId = action.payload;
      state.currentPage = 0;
      state.pageTokens = [undefined];
      state.activityData = null;
    },
    setSelectedDeviceId: (state, action: PayloadAction<string>) => {
      state.selectedDeviceId = action.payload;
      state.currentPage = 0;
      state.pageTokens = [undefined];
      state.activityData = null;
    },
    setTimeWindow: (state, action: PayloadAction<'hourly' | 'daily' | 'weekly'>) => {
      state.timeWindow = action.payload;
      state.currentPage = 0;
      state.pageTokens = [undefined];
      state.activityData = null;
    },
    setSearchFilter: (state, action: PayloadAction<string>) => {
      state.searchFilter = action.payload;
    },
    setPageSize: (state, action: PayloadAction<10 | 20 | 50>) => {
      state.pageSize = action.payload;
      state.currentPage = 0;
      state.pageTokens = [undefined];
      state.activityData = null;
    },
    resetPagination: (state) => {
      state.currentPage = 0;
      state.pageTokens = [undefined];
      state.activityData = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHardwareDevicesThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchHardwareDevicesThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.scanners = action.payload.scanners;
      })
      .addCase(fetchHardwareDevicesThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchActivityThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchActivityThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        const { data, targetPage } = action.payload;
        state.activityData = data;
        state.currentPage = targetPage;
        if (data.next_token) {
          state.pageTokens[targetPage + 1] = data.next_token;
        }
      })
      .addCase(fetchActivityThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setSelectedLocationId,
  setSelectedDeviceId,
  setTimeWindow,
  setSearchFilter,
  setPageSize,
  resetPagination,
} = hardwareActivitySlice.actions;

export const selectHardwareActivityState = (state: { hardwareActivity: HardwareActivityState }) =>
  state.hardwareActivity;

export default hardwareActivitySlice.reducer;
