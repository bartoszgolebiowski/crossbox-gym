import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { selectAuthEmail } from '../store/authSlice';
import {
  createCheckoutSessionThunk,
  generateQRThunk,
  isMembershipActive,
  selectDashboard,
  selectDashboardLoading,
  selectQrInfo,
  selectQrUrl,
} from '../store/memberSlice';
import { StatuteCheckoutModal } from './StatuteCheckoutModal';

export const QrPassCard: React.FC = () => {
  const dispatch = useAppDispatch();
  const dashboard = useAppSelector(selectDashboard);
  const dashboardLoading = useAppSelector(selectDashboardLoading);
  const qrUrl = useAppSelector(selectQrUrl);
  const qrInfo = useAppSelector(selectQrInfo);
  const email = useAppSelector(selectAuthEmail);
  const membershipActive = isMembershipActive(dashboard);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (membershipActive && !qrUrl) {
      dispatch(generateQRThunk());
    }
  }, [dispatch, membershipActive, qrUrl]);

  const handleRefresh = () => {
    dispatch(generateQRThunk());
  };

  const handleConfirmCheckout = async () => {
    if (!email) {
      console.error('Email is required for checkout session.');
      return;
    }
    setIsSubmitting(true);
    const origin = window.location.origin;
    try {
      await dispatch(
        createCheckoutSessionThunk({
          customerEmail: email,
          successUrl: `${origin}/checkout/success`,
          cancelUrl: `${origin}/checkout/cancel`,
          redirectUrl: `${origin}/checkout/redirect`,
        })
      ).unwrap();
    } catch {
      // Handled via thunk reject / state
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-paper border border-line rounded-card p-6 shadow-card flex flex-col justify-between h-full">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5 font-bold text-base text-ink">
              <span className="p-2 rounded-control bg-primary/10 text-primary border border-primary/30">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
              </span>
              <span>Wejściowy Kod QR</span>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium border ${
                membershipActive
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-line/10 text-ink/70 border-line/60'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${membershipActive ? 'bg-success' : 'bg-muted'}`}></span>
              {membershipActive ? 'Aktywny Karnet' : 'Wymagany Karnet'}
            </span>
          </div>

          {/* QR Display */}
          <div className="my-4 flex flex-col items-center justify-center">
            <div className="p-4 rounded-card bg-line/10 border border-line/60">
              {membershipActive && qrUrl ? (
                <div className="rounded-card bg-paper p-3 shadow-md">
                  <img src={qrUrl} alt="Turnstile QR Pass" className="w-44 h-44 object-contain" />
                </div>
              ) : membershipActive ? (
                <div className="w-44 h-44 flex flex-col items-center justify-center text-ink/40 gap-2">
                  <svg className="w-6 h-6 animate-spin text-info" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="text-xs font-mono">Generowanie Kodu...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="w-44 h-44 flex flex-col items-center justify-center text-muted gap-3 text-center px-5 rounded-control transition-colors cursor-pointer hover:bg-line/20 focus:outline-none focus:ring-2 focus:ring-primary-hover focus:ring-offset-2"
                  title="Aktywuj subskrypcję, aby odblokować wejściowy kod QR"
                >
                  <svg className="w-10 h-10 text-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.75"
                      d="M12 11V7a4 4 0 10-8 0v4m-2 0h12a2 2 0 012 2v7a2 2 0 01-2 2H2a2 2 0 01-2-2v-7a2 2 0 012-2z"
                    />
                  </svg>
                  <span className="text-xs leading-5">
                    {dashboardLoading
                      ? 'Sprawdzanie stanu członkostwa...'
                      : 'Kliknij tutaj, aby aktywować karnet i odblokować kod QR.'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-center text-ink/70 bg-line/10 py-2.5 px-3 rounded-control border border-line/60 truncate">
            {membershipActive
              ? qrInfo || 'Zeskanuj kod QR przy bramce wejściowej siłowni 24/7'
              : 'Aktywna subskrypcja jest wymagana do uzyskania dostępu do siłowni.'}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={!membershipActive}
          className="mt-5 w-full py-2.5 px-4 rounded-control font-medium text-xs text-ink/70 bg-paper hover:bg-line/10 border border-line transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>{membershipActive ? 'Odśwież Kod QR' : 'Wymagany Aktywny Karnet'}</span>
        </button>
      </div>

      <StatuteCheckoutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirmCheckout={handleConfirmCheckout}
        loading={isSubmitting}
      />
    </>
  );
};
