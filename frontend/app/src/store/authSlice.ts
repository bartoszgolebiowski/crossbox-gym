import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiClient } from '../services/apiClient';

export interface AuthState {
  token: string | null;
  email: string | null;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
}

const initialState: AuthState = {
  token: localStorage.getItem('cb_member_token'),
  email: localStorage.getItem('cb_member_email'),
  loading: false,
  error: null,
  successMessage: null,
};

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ idToken: string; message?: string }>('/auth/login', payload);
      if (data.idToken) {
        localStorage.setItem('cb_member_token', data.idToken);
        localStorage.setItem('cb_member_email', payload.email);
        return { token: data.idToken, email: payload.email };
      }
      return rejectWithValue(data.message || 'Login failed.');
    } catch (err: any) {
      return rejectWithValue(err.message || 'Login error.');
    }
  }
);

export const registerThunk = createAsyncThunk(
  'auth/register',
  async (payload: { email: string; password: string }, { dispatch, rejectWithValue }) => {
    try {
      await apiClient.post('/auth/register', payload);
      const loginRes = await dispatch(loginThunk(payload)).unwrap();
      return loginRes;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Registration failed.');
    }
  }
);

export const forgotPasswordThunk = createAsyncThunk(
  'auth/forgotPassword',
  async (payload: { email: string }, { rejectWithValue }) => {
    try {
      await apiClient.post('/auth/forgot-password', payload);
      return 'Verification code sent to your email!';
    } catch (err: any) {
      return rejectWithValue(err.message || 'Request failed.');
    }
  }
);

export const confirmForgotPasswordThunk = createAsyncThunk(
  'auth/confirmForgotPassword',
  async (payload: { email: string; code: string; newPassword: string }, { rejectWithValue }) => {
    try {
      await apiClient.post('/auth/confirm-forgot-password', payload);
      return 'Password reset successfully! You can now log in.';
    } catch (err: any) {
      return rejectWithValue(err.message || 'Password reset failed.');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      localStorage.removeItem('cb_member_token');
      localStorage.removeItem('cb_member_email');
      state.token = null;
      state.email = null;
      state.error = null;
      state.successMessage = null;
    },
    clearAuthMessages: (state) => {
      state.error = null;
      state.successMessage = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.successMessage = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.email = action.payload.email;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(registerThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.successMessage = null;
      })
      .addCase(registerThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.email = action.payload.email;
      })
      .addCase(registerThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(forgotPasswordThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.successMessage = null;
      })
      .addCase(forgotPasswordThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = action.payload;
      })
      .addCase(forgotPasswordThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(confirmForgotPasswordThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.successMessage = null;
      })
      .addCase(confirmForgotPasswordThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = action.payload;
      })
      .addCase(confirmForgotPasswordThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logout, clearAuthMessages } = authSlice.actions;

export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectAuthToken = (state: { auth: AuthState }) => state.auth.token;
export const selectAuthEmail = (state: { auth: AuthState }) => state.auth.email;

export default authSlice.reducer;
