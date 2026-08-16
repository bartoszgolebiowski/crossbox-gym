import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  createCheckoutSessionThunk,
  createPortalSessionThunk,
  selectCheckoutStatus,
  selectDashboard,
} from '../store/memberSlice';
import { StatuteCheckoutModal } from './StatuteCheckoutModal';

interface ProfileCardProps {
  email: string | null;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ email }) => {
  const dispatch = useAppDispatch();
  const dashboard = useAppSelector(selectDashboard);
  const checkoutStatus = useAppSelector(selectCheckoutStatus);
  const membershipActive = dashboard?.subscription?.status === 'ACTIVE';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handlePortal = () => {
    dispatch(createPortalSessionThunk());
  };

  return (
    <>
      <div className="bg-paper border border-line rounded-card p-6 shadow-card flex flex-col justify-between h-full">
        <div>
          {/* Title */}
          <div className="flex items-center gap-2.5 font-bold text-base text-ink mb-5">
            <span className="p-2 rounded-control bg-primary/10 text-primary border border-primary/30">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </span>
            <span>Tożsamość i Status Klubowicza</span>
          </div>

          {/* Dashboard Profile Details */}
          {dashboard ? (
            <div className="space-y-3 bg-line/10 rounded-control p-4 border border-line/60">
              <div className="flex items-center justify-between pb-2 border-b border-line/60">
                <span className="text-xs text-muted font-medium">E-mail konta</span>
                <span className="text-xs font-medium text-ink/80">{dashboard.user?.email || email}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-line/60">
                <span className="text-xs text-muted font-medium">Status karnetu</span>
                {dashboard.subscription?.status === 'ACTIVE' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success"></span> Karnet Aktywny
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-pill border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    {dashboard.subscription?.status === 'INACTIVE'
                      ? 'Nieaktywny'
                      : dashboard.subscription?.status || 'Nieaktywny'}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-control bg-line/10 border border-line/60 text-xs text-muted">
              Ładowanie danych profilu...
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-5 space-y-2.5">
          {!membershipActive && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-control font-medium text-xs text-white bg-primary hover:bg-primary-hover transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-control"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002 2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>Aktywuj Karnet (139 zł/mies.)</span>
            </button>
          )}

          <button
            onClick={handlePortal}
            className="w-full py-2.5 px-4 rounded-control font-medium text-xs text-ink/70 bg-paper hover:bg-line/10 border border-line transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 text-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
            </svg>
            <span>Zarządzaj Subskrypcją i Płatnościami</span>
          </button>

          {checkoutStatus && (
            <div className="bg-line/10 rounded-control p-2.5 border border-line/60 text-[11px] font-mono text-primary truncate">
              {checkoutStatus}
            </div>
          )}
        </div>
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
