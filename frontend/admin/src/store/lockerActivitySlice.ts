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

export interface LockerActivityState extends ActivityPaginationState {
  lockers: Array<{ locker_id: string; name: string }>;
  activityData: ActivityResponse | null;
}

const initialState: LockerActivityState = {
  selectedLocationId: '',
  lockers: [],
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

export const fetchLockerDevicesThunk = createAsyncThunk(
  'lockerActivity/fetchDevices',
  async (locationId: string, { rejectWithValue }) => {
    try {
      const devicesList = await adminApiClient
        .get<DeviceItem[]>(`/admin/locations/${locationId}/devices`)
        .catch(() => []);
      const mapped = (devicesList || [])
        .filter((d) => d.device_id && d.type === 'lock')
        .map((d) => ({
          locker_id: d.device_id,
          name: d.name || d.device_id,
        }));
      return {
        lockers: mapped,
      };
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch locker devices');
    }
  }
);

export const fetchLockerActivityThunk = createAsyncThunk(
  'lockerActivity/fetchActivity',
  async (payload: { direction?: 'first' | 'next' | 'prev' } | undefined, { getState, rejectWithValue }) => {
    const state = getState() as { lockerActivity: LockerActivityState };
    const { selectedLocationId, timeWindow, selectedDeviceId, pageSize, currentPage, pageTokens } =
      state.lockerActivity;
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
      deviceParamName: 'locker_id',
      nextToken,
    });

    try {
      const data = await adminApiClient.get<ActivityResponse>(queryPath);
      return { data, targetPage };
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch locker activity logs');
    }
  }
);

const lockerActivitySlice = createSlice({
  name: 'lockerActivity',
  initialState,
  reducers: {
    setLockerSelectedLocationId: (state, action: PayloadAction<string>) => {
      state.selectedLocationId = action.payload;
      applyPaginationReset(state);
    },
    setLockerSelectedDeviceId: (state, action: PayloadAction<string>) => {
      state.selectedDeviceId = action.payload;
      applyPaginationReset(state);
    },
    setLockerTimeWindow: (state, action: PayloadAction<ActivityTimeWindow>) => {
      state.timeWindow = action.payload;
      applyPaginationReset(state);
    },
    setLockerSearchFilter: (state, action: PayloadAction<string>) => {
      state.searchFilter = action.payload;
    },
    setLockerPageSize: (state, action: PayloadAction<10 | 20 | 50>) => {
      state.pageSize = action.payload;
      applyPaginationReset(state);
    },
    resetLockerPagination: (state) => {
      state.currentPage = 0;
      state.pageTokens = [undefined];
      state.activityData = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLockerDevicesThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchLockerDevicesThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lockers = action.payload.lockers;
      })
      .addCase(fetchLockerDevicesThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchLockerActivityThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchLockerActivityThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        applyActivityPageResult(state, action.payload);
      })
      .addCase(fetchLockerActivityThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setLockerSelectedLocationId,
  setLockerSelectedDeviceId,
  setLockerTimeWindow,
  setLockerSearchFilter,
  setLockerPageSize,
} = lockerActivitySlice.actions;

export const selectLockerActivityState = (state: { lockerActivity: LockerActivityState }) => state.lockerActivity;

export default lockerActivitySlice.reducer;
