import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { adminApiClient } from '../services/apiClient';

export interface AdminOpsState {
  locationOutput: string | null;
  remoteOutput: string | null;
  overrideOutput: string | null;
}

const initialState: AdminOpsState = {
  locationOutput: null,
  remoteOutput: null,
  overrideOutput: null,
};

export const createLocationThunk = createAsyncThunk(
  'adminOps/createLocation',
  async (payload: { name: string; address: string }, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.post('/admin/locations', payload);
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
      })
      .addCase(listLocationsThunk.rejected, (state, action) => {
        state.locationOutput = action.payload as string;
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
export const selectRemoteOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.remoteOutput;
export const selectOverrideOutput = (state: { adminOps: AdminOpsState }) => state.adminOps.overrideOutput;

export default adminSlice.reducer;
