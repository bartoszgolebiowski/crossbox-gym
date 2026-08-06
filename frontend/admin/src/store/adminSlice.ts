import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { adminApiClient } from '../services/apiClient';

export interface LocationItem {
  PK: string;
  location_id: string;
  name: string;
  address: string;
  status: string;
}

export interface DeviceItem {
  device_id: string;
  location_id?: string;
  name: string;
  type?: 'lock' | 'scanner';
  status?: 'active' | 'inactive';
}

export interface DeviceHealth {
  device_id: string;
  status: 'ONLINE' | 'OFFLINE' | 'CHECKING';
  connected: boolean;
  latency_ms?: number;
  last_seen?: string;
  details?: Record<string, unknown>;
  isLoading?: boolean;
  error?: string;
}

interface DeviceHealthResponse {
  status?: DeviceHealth['status'];
  connected?: boolean;
  latency_ms?: number;
  last_seen?: string;
  details?: Record<string, unknown>;
}

export interface AdminOpsState {
  locationOutput: string | null;
  accessOutput: string | null;
  remoteOutput: string | null;
  overrideOutput: string | null;
  locationsList: LocationItem[];
  devicesList: DeviceItem[];
  deviceHealthMap: Record<string, DeviceHealth>;
}

const initialState: AdminOpsState = {
  locationOutput: null,
  accessOutput: null,
  remoteOutput: null,
  overrideOutput: null,
  locationsList: [],
  devicesList: [],
  deviceHealthMap: {},
};

export const createLocationThunk = createAsyncThunk(
  'adminOps/createLocation',
  async (payload: { name: string; address: string }, { rejectWithValue, dispatch }) => {
    try {
      const data = await adminApiClient.post('/admin/locations', payload);
      dispatch(listLocationsThunk());
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const listLocationsThunk = createAsyncThunk('adminOps/listLocations', async (_, { rejectWithValue }) => {
  try {
    const data = await adminApiClient.get('/admin/locations');
    return JSON.stringify(data, null, 2);
  } catch (err: any) {
    return rejectWithValue(`Error: ${err.message}`);
  }
});

export const fetchDevicesThunk = createAsyncThunk(
  'adminOps/fetchDevices',
  async (locationId: string, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.get(`/admin/locations/${locationId}/devices`);
      return { locationId, devices: (Array.isArray(data) ? data : []) as DeviceItem[] };
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const checkDeviceHealthThunk = createAsyncThunk(
  'adminOps/checkDeviceHealth',
  async (payload: { deviceId: string; locationId?: string }, { rejectWithValue }) => {
    const deviceId = payload.deviceId.trim();
    if (!deviceId) {
      return rejectWithValue({ deviceId, error: 'Device ID is required.' });
    }
    try {
      const data = await adminApiClient.post<DeviceHealthResponse>(`/admin/devices/${deviceId}/health`, {
        location_id: payload.locationId,
      });
      return { deviceId, data };
    } catch (err: any) {
      return rejectWithValue({ deviceId, error: `Error: ${err.message}` });
    }
  }
);

export const remoteUnlockThunk = createAsyncThunk(
  'adminOps/remoteUnlock',
  async (payload: { deviceId: string; locationId?: string; reason?: string }, { rejectWithValue }) => {
    const deviceId = payload.deviceId.trim();
    if (!deviceId) {
      return rejectWithValue('Device ID is required.');
    }

    try {
      const data = await adminApiClient.post(`/admin/devices/${deviceId}/unlock`, {
        location_id: payload.locationId || 'loc_01',
        reason: payload.reason || 'Console Remote Unlock',
      });
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const rotateHMACThunk = createAsyncThunk('adminOps/rotateHMAC', async (_, { rejectWithValue }) => {
  try {
    const data = await adminApiClient.post('/admin/hmac/rotate');
    return JSON.stringify(data, null, 2);
  } catch (err: any) {
    return rejectWithValue(`Error: ${err.message}`);
  }
});

export const memberOverrideThunk = createAsyncThunk(
  'adminOps/memberOverride',
  async (payload: { userId: string; action: string }, { rejectWithValue }) => {
    const userId = payload.userId.trim();
    if (!userId) {
      return rejectWithValue('Member ID is required.');
    }

    try {
      const data = await adminApiClient.post(`/admin/members/${userId}/override`, { action: payload.action });
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

const adminSlice = createSlice({
  name: 'adminOps',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(createLocationThunk.fulfilled, (state, action) => {
        state.locationOutput = action.payload;
      })
      .addCase(createLocationThunk.rejected, (state, action) => {
        state.locationOutput = action.payload as string;
      })
      .addCase(listLocationsThunk.fulfilled, (state, action) => {
        state.locationOutput = action.payload;
        try {
          const parsed = JSON.parse(action.payload);
          if (Array.isArray(parsed)) {
            state.locationsList = parsed;
          }
        } catch {
          state.locationsList = [];
        }
      })
      .addCase(listLocationsThunk.rejected, (state, action) => {
        state.locationOutput = action.payload as string;
      })
      .addCase(fetchDevicesThunk.fulfilled, (state, action) => {
        state.devicesList = action.payload.devices;
      })
      .addCase(checkDeviceHealthThunk.pending, (state, action) => {
        const deviceId = action.meta.arg.deviceId;
        state.deviceHealthMap[deviceId] = {
          device_id: deviceId,
          status: 'CHECKING',
          connected: false,
          isLoading: true,
        };
      })
      .addCase(checkDeviceHealthThunk.fulfilled, (state, action) => {
        const { deviceId, data } = action.payload;
        state.deviceHealthMap[deviceId] = {
          device_id: deviceId,
          status: data.status || 'ONLINE',
          connected: Boolean(data.connected),
          latency_ms: data.latency_ms,
          last_seen: data.last_seen,
          details: data.details,
          isLoading: false,
        };
      })
      .addCase(checkDeviceHealthThunk.rejected, (state, action) => {
        const payload = action.payload as { deviceId: string; error: string };
        const deviceId = payload?.deviceId || action.meta.arg.deviceId;
        state.deviceHealthMap[deviceId] = {
          device_id: deviceId,
          status: 'OFFLINE',
          connected: false,
          isLoading: false,
          error: payload?.error || 'Health check failed',
        };
      })
      .addCase(remoteUnlockThunk.fulfilled, (state, action) => {
        state.remoteOutput = action.payload;
      })
      .addCase(remoteUnlockThunk.rejected, (state, action) => {
        state.remoteOutput = action.payload as string;
      })
      .addCase(rotateHMACThunk.fulfilled, (state, action) => {
        state.remoteOutput = action.payload;
      })
      .addCase(rotateHMACThunk.rejected, (state, action) => {
        state.remoteOutput = action.payload as string;
      })
      .addCase(memberOverrideThunk.fulfilled, (state, action) => {
        state.overrideOutput = action.payload;
      })
      .addCase(memberOverrideThunk.rejected, (state, action) => {
        state.overrideOutput = action.payload as string;
      });
  },
});

export const selectRemoteOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.remoteOutput;
export const selectOverrideOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.overrideOutput;
export const selectLocationsList = (state: { adminOps: AdminOpsState }) => state.adminOps.locationsList;
export const selectDevicesList = (state: { adminOps: AdminOpsState }) => state.adminOps.devicesList;
export const selectDeviceHealthMap = (state: { adminOps: AdminOpsState }) => state.adminOps.deviceHealthMap;

export default adminSlice.reducer;
