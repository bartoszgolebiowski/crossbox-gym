import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { adminApiClient } from '../services/apiClient';
import { ScannerItem } from './adminSlice';

export interface ActivityItem {
  entry_id: string;
  timestamp: string;
  user_id: string;
  location_id: string;
  scanner_id?: string;
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
}

export interface HardwareActivityState {
  selectedLocationId: string;
  scanners: ScannerItem[];
  selectedDeviceId: string;
  timeWindow: 'hourly' | 'daily' | 'weekly';
  activityData: ActivityResponse | null;
  isLoading: boolean;
  error: string | null;
  searchFilter: string;
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
};

export const fetchHardwareDevicesThunk = createAsyncThunk(
  'hardwareActivity/fetchDevices',
  async (locationId: string, { rejectWithValue }) => {
    try {
      const scannersList = await adminApiClient.get<ScannerItem[]>(`/admin/locations/${locationId}/scanners`).catch(() => []);
      return {
        scanners: scannersList || [],
      };
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch hardware devices');
    }
  }
);

export const fetchActivityThunk = createAsyncThunk(
  'hardwareActivity/fetchActivity',
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as { hardwareActivity: HardwareActivityState };
    const { selectedLocationId, timeWindow, selectedDeviceId } = state.hardwareActivity;
    if (!selectedLocationId) {
      return rejectWithValue('No location selected');
    }

    let queryPath = `/admin/locations/${selectedLocationId}/activity?window=${timeWindow}`;
    if (selectedDeviceId !== 'all') {
      queryPath += `&scanner_id=${selectedDeviceId}`;
    }

    try {
      const data = await adminApiClient.get<ActivityResponse>(queryPath);
      return data;
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
    },
    setSelectedDeviceId: (state, action: PayloadAction<string>) => {
      state.selectedDeviceId = action.payload;
    },
    setTimeWindow: (state, action: PayloadAction<'hourly' | 'daily' | 'weekly'>) => {
      state.timeWindow = action.payload;
    },
    setSearchFilter: (state, action: PayloadAction<string>) => {
      state.searchFilter = action.payload;
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
        state.activityData = action.payload;
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
} = hardwareActivitySlice.actions;

export const selectHardwareActivityState = (state: { hardwareActivity: HardwareActivityState }) =>
  state.hardwareActivity;

export default hardwareActivitySlice.reducer;
