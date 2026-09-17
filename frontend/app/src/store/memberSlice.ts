import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import QRCode from 'qrcode';
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
  qrExpiresIn: number;
  qrGeneratedAt: number | null;
  qrLoading: boolean;
  invoices: Invoice[];
  invoicesLoading: boolean;
  checkoutStatus: string | null;
}

export const isMembershipActive = (dashboard: DashboardData | null | undefined): boolean =>
  dashboard?.subscription?.status === 'ACTIVE';

const initialState: MemberState = {
  dashboard: null,
  dashboardLoading: false,
  qrUrl: null,
  qrInfo: 'Zeskanuj kod QR przy bramce wejściowej siłowni 24/7',
  qrExpiresIn: 60,
  qrGeneratedAt: null,
  qrLoading: false,
  invoices: [],
  invoicesLoading: false,
  checkoutStatus: null,
};

export const fetchDashboardThunk = createAsyncThunk('member/fetchDashboard', async (_, { rejectWithValue }) => {
  try {
    const data = await apiClient.get<DashboardData>('/member/dashboard');
    return data;
  } catch (err: any) {
    return rejectWithValue(err.message || 'Failed to load dashboard.');
  }
});

export const generateQRThunk = createAsyncThunk('member/generateQR', async (_, { rejectWithValue }) => {
  try {
    const data = await apiClient.post<{ qr_code: string; expires_in: number; message?: string }>('/member/qr');
    if (data?.qr_code) {
      const qrImage = await QRCode.toDataURL(data.qr_code, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#14111d',
          light: '#ffffff',
        },
      });
      const expiresIn = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 60;
      return {
        qrUrl: qrImage,
        expiresIn,
        generatedAt: Date.now(),
        qrInfo: 'Zeskanuj kod QR przy bramce wejściowej siłowni 24/7',
      };
    }
    return rejectWithValue(data?.message || 'Aktywny karnet jest wymagany do wejścia przez bramkę');
  } catch (err: any) {
    return rejectWithValue(err.message || 'Nie udało się wygenerować kodu QR.');
  }
});

export const fetchInvoicesThunk = createAsyncThunk('member/fetchInvoices', async (_, { rejectWithValue }) => {
  try {
    const data = await apiClient.get<{ invoices: Invoice[] }>('/member/invoices');
    return data.invoices || [];
  } catch (err: any) {
    return rejectWithValue(err.message || 'Failed to fetch invoices.');
  }
});

export interface CreateCheckoutSessionInput {
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  redirectUrl: string;
}

export const createCheckoutSessionThunk = createAsyncThunk(
  'member/createCheckoutSession',
  async (input: CreateCheckoutSessionInput, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ url: string; message?: string; error?: string }>('/checkout/session', input);
      if (data.url) {
        const popup = window.open(data.url, '_blank');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = data.url;
        }
        return 'Checkout Session Created! Redirecting to Stripe...';
      }
      return rejectWithValue(data.message || data.error || 'Checkout creation failed.');
    } catch (err: any) {
      return rejectWithValue(err.message || 'Checkout error.');
    }
  }
);

export const createPortalSessionThunk = createAsyncThunk(
  'member/createPortalSession',
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiClient.post<{ url: string; message?: string; error?: string }>('/member/portal-session');
      if (data.url) {
        const popup = window.open(data.url, '_blank');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = data.url;
        }
        return data.url;
      }
      return rejectWithValue(data.message || data.error || 'Portal session creation failed.');
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
      state.qrInfo = 'Zeskanuj kod QR przy bramce wejściowej siłowni 24/7';
      state.qrExpiresIn = 60;
      state.qrGeneratedAt = null;
      state.qrLoading = false;
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
        if (!isMembershipActive(action.payload)) {
          state.qrUrl = null;
          state.qrInfo = 'Wymagana jest aktywna subskrypcja, aby uzyskać kod dostępu.';
        }
      })
      .addCase(fetchDashboardThunk.rejected, (state) => {
        state.dashboardLoading = false;
      })
      .addCase(generateQRThunk.pending, (state) => {
        state.qrLoading = true;
      })
      .addCase(generateQRThunk.fulfilled, (state, action) => {
        state.qrLoading = false;
        state.qrUrl = action.payload.qrUrl;
        state.qrInfo = action.payload.qrInfo;
        state.qrExpiresIn = action.payload.expiresIn;
        state.qrGeneratedAt = action.payload.generatedAt;
      })
      .addCase(generateQRThunk.rejected, (state, action) => {
        state.qrLoading = false;
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

export const selectDashboard = (state: { member: MemberState }) => state.member.dashboard;
export const selectDashboardLoading = (state: { member: MemberState }) => state.member.dashboardLoading;
export const selectQrUrl = (state: { member: MemberState }) => state.member.qrUrl;
export const selectQrInfo = (state: { member: MemberState }) => state.member.qrInfo;
export const selectQrExpiresIn = (state: { member: MemberState }) => state.member.qrExpiresIn;
export const selectQrGeneratedAt = (state: { member: MemberState }) => state.member.qrGeneratedAt;
export const selectQrLoading = (state: { member: MemberState }) => state.member.qrLoading;
export const selectInvoices = (state: { member: MemberState }) => state.member.invoices;
export const selectInvoicesLoading = (state: { member: MemberState }) => state.member.invoicesLoading;
export const selectCheckoutStatus = (state: { member: MemberState }) => state.member.checkoutStatus;

export default memberSlice.reducer;
