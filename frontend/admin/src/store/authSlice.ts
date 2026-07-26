import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { adminApiClient } from '../services/apiClient';

export interface AuthState {
  token: string | null;
  email: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  token: localStorage.getItem('cb_admin_token'),
  email: localStorage.getItem('cb_admin_email'),
  loading: false,
  error: null,
};

export const adminLoginThunk = createAsyncThunk(
  'auth/adminLogin',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const data = await adminApiClient.post<{ idToken: string; message?: string }>('/auth/login', payload);
      if (data.idToken) {
        localStorage.setItem('cb_admin_token', data.idToken);
        localStorage.setItem('cb_admin_email', payload.email);
        return { token: data.idToken, email: payload.email };
      }
      return rejectWithValue(data.message || 'Login failed.');
    } catch (err: any) {
      return rejectWithValue(err.message || 'Admin Login error.');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    adminLogout: (state) => {
      localStorage.removeItem('cb_admin_token');
      localStorage.removeItem('cb_admin_email');
      state.token = null;
      state.email = null;
      state.error = null;
    },
    clearAdminAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(adminLoginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(adminLoginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.email = action.payload.email;
      })
      .addCase(adminLoginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { adminLogout, clearAdminAuthError } = authSlice.actions;

export const selectAdminAuth = (state: { auth: AuthState }) => state.auth;
export const selectAdminToken = (state: { auth: AuthState }) => state.auth.token;
export const selectAdminEmail = (state: { auth: AuthState }) => state.auth.email;

export default authSlice.reducer;
