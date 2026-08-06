import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ActivityResponse, ActivityTimeWindow } from '../../../shared/activityTypes';
import { adminApiClient } from '../services/apiClient';
import {
  ActivityPaginationState,
  applyActivityPageResult,
  applyPaginationReset,
  buildActivityQueryPath,
  resolvePaginationTarget,
} from './activityShared';
import { DeviceItem } from './adminSlice';

export interface HardwareActivityState extends ActivityPaginationState {
  scanners: Array<{ scanner_id: string; name: string }>;
  activityData: ActivityResponse | null;
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
    const { targetPage, nextToken } = resolvePaginationTarget(direction, currentPage, pageTokens);
    const queryPath = buildActivityQueryPath({
      locationId: selectedLocationId,
      timeWindow,
      pageSize,
      selectedDeviceId,
      deviceParamName: 'scanner_id',
      nextToken,
    });

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
      applyPaginationReset(state);
    },
    setSelectedDeviceId: (state, action: PayloadAction<string>) => {
      state.selectedDeviceId = action.payload;
      applyPaginationReset(state);
    },
    setTimeWindow: (state, action: PayloadAction<ActivityTimeWindow>) => {
      state.timeWindow = action.payload;
      applyPaginationReset(state);
    },
    setSearchFilter: (state, action: PayloadAction<string>) => {
      state.searchFilter = action.payload;
    },
    setPageSize: (state, action: PayloadAction<10 | 20 | 50>) => {
      state.pageSize = action.payload;
      applyPaginationReset(state);
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
        applyActivityPageResult(state, action.payload);
      })
      .addCase(fetchActivityThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setSelectedLocationId, setSelectedDeviceId, setTimeWindow, setSearchFilter, setPageSize } =
  hardwareActivitySlice.actions;

export const selectHardwareActivityState = (state: { hardwareActivity: HardwareActivityState }) =>
  state.hardwareActivity;

export default hardwareActivitySlice.reducer;
