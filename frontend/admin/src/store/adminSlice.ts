import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { adminApiClient } from '../services/apiClient';

export interface LocationItem {
  PK: string;
  SK: string;
  name: string;
  address?: string;
  created_at?: string;
}

export interface ScannerItem {
  scanner_id: string;
  location_id: string;
  name: string;
  assigned_locker_id?: string;
}

export interface LockerItem {
  locker_id: string;
  location_id: string;
  name: string;
  assigned_scanner_id?: string;
}

export interface DeviceItem {
  device_id: string;
  location_id?: string;
  name: string;
  type?: 'lock' | 'scanner';
  status?: 'active' | 'inactive';
}

export interface AdminOpsState {
  locationOutput: string | null;
  accessOutput: string | null;
  remoteOutput: string | null;
  overrideOutput: string | null;
  locationsList: LocationItem[];
  scannersList: ScannerItem[];
  lockersList: LockerItem[];
  devicesList: DeviceItem[];
}

const initialState: AdminOpsState = {
  locationOutput: null,
  accessOutput: null,
  remoteOutput: null,
  overrideOutput: null,
  locationsList: [],
  scannersList: [],
  lockersList: [],
  devicesList: [],
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

export const listLocationsThunk = createAsyncThunk(
  'adminOps/listLocations',
  async (_, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.get('/admin/locations');
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const fetchScannersThunk = createAsyncThunk(
  'adminOps/fetchScanners',
  async (locationId: string, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.get(`/admin/locations/${locationId}/scanners`);
      return { locationId, scanners: (Array.isArray(data) ? data : []) as ScannerItem[] };
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const fetchLockersThunk = createAsyncThunk(
  'adminOps/fetchLockers',
  async (locationId: string, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.get(`/admin/locations/${locationId}/lockers`);
      return { locationId, lockers: (Array.isArray(data) ? data : []) as LockerItem[] };
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

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

export const createScannerThunk = createAsyncThunk(
  'adminOps/createScanner',
  async (payload: { locationId: string; name: string }, { rejectWithValue, dispatch }) => {
    try {
      const data = await adminApiClient.post(`/admin/locations/${payload.locationId}/scanners`, { name: payload.name, reader_adapter: 'mock', allowed_qr_providers: ['basic-subscription', 'mock'] });
      dispatch(fetchScannersThunk(payload.locationId));
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const createLockerThunk = createAsyncThunk(
  'adminOps/createLocker',
  async (payload: { locationId: string; name: string }, { rejectWithValue, dispatch }) => {
    try {
      const data = await adminApiClient.post(`/admin/locations/${payload.locationId}/lockers`, { name: payload.name, lock_adapter: 'mock', unlock_duration_seconds: 5, adapter_configuration: {} });
      dispatch(fetchLockersThunk(payload.locationId));
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const registerAndAssignLockerThunk = createAsyncThunk(
  'adminOps/registerAndAssignLocker',
  async (payload: { locationId: string; scannerId: string; lockerName: string }, { dispatch, rejectWithValue }) => {
    try {
      const lockerRes = await adminApiClient.post(`/admin/locations/${payload.locationId}/lockers`, {
        name: payload.lockerName,
        lock_adapter: 'mock',
        unlock_duration_seconds: 5,
        adapter_configuration: {},
      });
      const lockerId = (lockerRes as any)?.locker_id || (lockerRes as any)?.SK?.replace(/^LOCKER#/, '');
      if (lockerId && payload.scannerId) {
        await adminApiClient.put(`/admin/locations/${payload.locationId}/scanners/${payload.scannerId}/locker`, { locker_id: lockerId });
      }
      dispatch(fetchScannersThunk(payload.locationId));
      dispatch(fetchLockersThunk(payload.locationId));
      return JSON.stringify({ locker: lockerRes, assignedScannerId: payload.scannerId }, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

export const assignLockerThunk = createAsyncThunk(
  'adminOps/assignLocker',
  async (payload: { locationId: string; scannerId: string; lockerId: string }, { rejectWithValue, dispatch }) => {
    try {
      const data = await adminApiClient.put(`/admin/locations/${payload.locationId}/scanners/${payload.scannerId}/locker`, { locker_id: payload.lockerId });
      dispatch(fetchScannersThunk(payload.locationId));
      dispatch(fetchLockersThunk(payload.locationId));
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
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

export const rotateHMACThunk = createAsyncThunk(
  'adminOps/rotateHMAC',
  async (_, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.post('/admin/hmac/rotate');
      return JSON.stringify(data, null, 2);
    } catch (err: any) {
      return rejectWithValue(`Error: ${err.message}`);
    }
  }
);

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
        } catch (e) {}
      })
      .addCase(listLocationsThunk.rejected, (state, action) => {
        state.locationOutput = action.payload as string;
      })
      .addCase(fetchScannersThunk.fulfilled, (state, action) => {
        state.scannersList = action.payload.scanners;
      })
      .addCase(fetchLockersThunk.fulfilled, (state, action) => {
        state.lockersList = action.payload.lockers;
      })
      .addCase(fetchDevicesThunk.fulfilled, (state, action) => {
        state.devicesList = action.payload.devices;
      })
      .addCase(createScannerThunk.fulfilled, (state, action) => {
        state.accessOutput = action.payload;
      })
      .addCase(createScannerThunk.rejected, (state, action) => {
        state.accessOutput = action.payload as string;
      })
      .addCase(createLockerThunk.fulfilled, (state, action) => {
        state.accessOutput = action.payload;
      })
      .addCase(createLockerThunk.rejected, (state, action) => {
        state.accessOutput = action.payload as string;
      })
      .addCase(registerAndAssignLockerThunk.fulfilled, (state, action) => {
        state.accessOutput = action.payload;
      })
      .addCase(registerAndAssignLockerThunk.rejected, (state, action) => {
        state.accessOutput = action.payload as string;
      })
      .addCase(assignLockerThunk.fulfilled, (state, action) => {
        state.accessOutput = action.payload;
      })
      .addCase(assignLockerThunk.rejected, (state, action) => {
        state.accessOutput = action.payload as string;
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

export const selectLocationOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.locationOutput;
export const selectAccessOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.accessOutput;
export const selectRemoteOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.remoteOutput;
export const selectOverrideOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.overrideOutput;
export const selectLocationsList = (state: { adminOps: AdminOpsState }) => state.adminOps.locationsList;
export const selectScannersList = (state: { adminOps: AdminOpsState }) => state.adminOps.scannersList;
export const selectLockersList = (state: { adminOps: AdminOpsState }) => state.adminOps.lockersList;
export const selectDevicesList = (state: { adminOps: AdminOpsState }) => state.adminOps.devicesList;

export default adminSlice.reducer;
