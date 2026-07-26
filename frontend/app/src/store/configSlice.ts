import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiClient, AppConfig } from '../services/apiClient';

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

export const bootstrapConfigThunk = createAsyncThunk<AppConfig>(
  'config/bootstrapConfig',
  async (_, { rejectWithValue }) => {
    try {
      const config = await apiClient.fetchConfig();
      return config;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to bootstrap config.');
    }
  }
);

export const retryConfigThunk = createAsyncThunk<AppConfig>(
  'config/retryConfig',
  async (_, { rejectWithValue }) => {
    apiClient.resetConfig();
    try {
      return await apiClient.fetchConfig();
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
      .addCase(bootstrapConfigThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(bootstrapConfigThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isLoaded = true;
        state.apiUrl = action.payload.ApiUrl;
      })
      .addCase(bootstrapConfigThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(retryConfigThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(retryConfigThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isLoaded = true;
        state.apiUrl = action.payload.ApiUrl;
      })
      .addCase(retryConfigThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const selectConfig = (state: { config: ConfigState }) => state.config;
export const selectIsConfigLoaded = (state: { config: ConfigState }) => state.config.isLoaded;

export default configSlice.reducer;
