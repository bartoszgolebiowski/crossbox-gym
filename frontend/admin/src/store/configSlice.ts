import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { adminApiClient, AdminConfig } from '../services/apiClient';

export interface ConfigState {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  apiUrl: string | null;
}

const initialState: ConfigState = {
  isLoaded: false,
  isLoading: false,
  error: null,
  apiUrl: null,
};

export const bootstrapAdminConfigThunk = createAsyncThunk<AdminConfig>(
  'config/bootstrapAdminConfig',
  async (_, { rejectWithValue }) => {
    try {
      const config = await adminApiClient.fetchConfig();
      return config;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to bootstrap admin config.');
    }
  }
);

export const retryAdminConfigThunk = createAsyncThunk<AdminConfig>(
  'config/retryAdminConfig',
  async (_, { rejectWithValue }) => {
    adminApiClient.resetConfig();
    try {
      return await adminApiClient.fetchConfig();
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to load runtime configuration.');
    }
  }
);

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAdminConfigThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(bootstrapAdminConfigThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isLoaded = true;
        state.apiUrl = action.payload.ApiUrl;
      })
      .addCase(bootstrapAdminConfigThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(retryAdminConfigThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(retryAdminConfigThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isLoaded = true;
        state.apiUrl = action.payload.ApiUrl;
      })
      .addCase(retryAdminConfigThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const selectAdminConfig = (state: { config: ConfigState }) => state.config;

export default configSlice.reducer;
