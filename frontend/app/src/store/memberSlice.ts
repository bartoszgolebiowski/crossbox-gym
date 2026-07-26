import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiClient } from '../services/apiClient';

export interface Invoice {
  id: string;
  number?: string;
  createdAt: string;
  total: number;
  tax: number;
  currency: string;
  status: string;
  pdfUrl?: string;
}

export interface DashboardData {
  user?: { email: string };
  subscription?: { status: string };
  locations?: any[];
  message?: string;
}

export interface MemberState {
  dashboard: DashboardData | null;
  dashboardLoading: boolean;
  qrUrl: string | null;
  qrInfo: string;
  invoices: Invoice[];
  invoicesLoading: boolean;
  checkoutStatus: string | null;
}

const initialState: MemberState = {
  dashboard: null,
  dashboardLoading: false,
  qrUrl: null,
  qrInfo: 'Tap "Generate / Refresh Pass QR" to create active entry pass',
  invoices: [],
  invoicesLoading: false,
  checkoutStatus: null,
};

export const fetchDashboardThunk = createAsyncThunk(
  'member/fetchDashboard',
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiClient.get<DashboardData>('/member/dashboard');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to load dashboard.');
    }
  }
);

export const generateQRThunk = createAsyncThunk(
  'member/generateQR',
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ qr_code: string; expires_in: number; message?: string }>('/member/qr');
      if (data?.qr_code) {
        const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.qr_code)}`;
        return {
          qrUrl: qrImage,
          qrInfo: `✅ Signed HMAC Pass Valid (Expires in ${data.expires_in}s)`,
        };
      }
      return rejectWithValue(data?.message || 'Active subscription required for turnstile access');
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to generate QR pass.');
    }
  }
);

export const fetchInvoicesThunk = createAsyncThunk(
  'member/fetchInvoices',
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiClient.get<{ invoices: Invoice[] }>('/member/invoices');
      return data.invoices || [];
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch invoices.');
    }
  }
);

export const createCheckoutSessionThunk = createAsyncThunk(
  'member/createCheckoutSession',
  async (customerEmail: string, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ url: string; message?: string }>('/checkout/session', { customerEmail });
      if (data.url) {
        window.open(data.url, '_blank');
        return 'Checkout Session Created! Redirecting to Stripe...';
      }
      return rejectWithValue(data.message || 'Checkout creation failed.');
    } catch (err: any) {
      return rejectWithValue(err.message || 'Checkout error.');
    }
  }
);

export const createPortalSessionThunk = createAsyncThunk(
  'member/createPortalSession',
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ url: string; message?: string }>('/member/portal-session');
      if (data.url) {
        window.open(data.url, '_blank');
        return data.url;
      }
      return rejectWithValue(data.message || 'Portal session failed.');
    } catch (err: any) {
      return rejectWithValue(err.message || 'Portal session error.');
    }
  }
);

const memberSlice = createSlice({
  name: 'member',
  initialState,
  reducers: {
    clearMemberData: (state) => {
      state.dashboard = null;
      state.qrUrl = null;
      state.qrInfo = 'Tap "Generate / Refresh Pass QR" to create active entry pass';
      state.invoices = [];
      state.checkoutStatus = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardThunk.pending, (state) => {
        state.dashboardLoading = true;
      })
      .addCase(fetchDashboardThunk.fulfilled, (state, action) => {
        state.dashboardLoading = false;
        state.dashboard = action.payload;
      })
      .addCase(fetchDashboardThunk.rejected, (state) => {
        state.dashboardLoading = false;
      })
      .addCase(generateQRThunk.fulfilled, (state, action) => {
        state.qrUrl = action.payload.qrUrl;
        state.qrInfo = action.payload.qrInfo;
      })
      .addCase(generateQRThunk.rejected, (state, action) => {
        state.qrInfo = `⚠️ ${action.payload as string}`;
      })
      .addCase(fetchInvoicesThunk.pending, (state) => {
        state.invoicesLoading = true;
      })
      .addCase(fetchInvoicesThunk.fulfilled, (state, action) => {
        state.invoicesLoading = false;
        state.invoices = action.payload;
      })
      .addCase(fetchInvoicesThunk.rejected, (state) => {
        state.invoicesLoading = false;
      })
      .addCase(createCheckoutSessionThunk.pending, (state) => {
        state.checkoutStatus = 'Generating Stripe Sandbox Checkout Session...';
      })
      .addCase(createCheckoutSessionThunk.fulfilled, (state, action) => {
        state.checkoutStatus = action.payload;
      })
      .addCase(createCheckoutSessionThunk.rejected, (state, action) => {
        state.checkoutStatus = `Checkout Error: ${action.payload as string}`;
      });
  },
});

export const { clearMemberData } = memberSlice.actions;

export const selectMember = (state: { member: MemberState }) => state.member;
export const selectDashboard = (state: { member: MemberState }) => state.member.dashboard;
export const selectQrPass = (state: { member: MemberState }) => ({ qrUrl: state.member.qrUrl, qrInfo: state.member.qrInfo });
export const selectInvoices = (state: { member: MemberState }) => state.member.invoices;
export const selectInvoicesLoading = (state: { member: MemberState }) => state.member.invoicesLoading;
export const selectCheckoutStatus = (state: { member: MemberState }) => state.member.checkoutStatus;

export default memberSlice.reducer;
