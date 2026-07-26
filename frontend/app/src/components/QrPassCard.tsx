import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { selectAuthEmail } from '../store/authSlice';
import { createCheckoutSessionThunk, generateQRThunk, isMembershipActive, selectDashboard, selectDashboardLoading, selectQrInfo, selectQrUrl } from '../store/memberSlice';

export const QrPassCard: React.FC = () => {
  const dispatch = useAppDispatch();
  const dashboard = useAppSelector(selectDashboard);
  const dashboardLoading = useAppSelector(selectDashboardLoading);
  const qrUrl = useAppSelector(selectQrUrl);
  const qrInfo = useAppSelector(selectQrInfo);
  const email = useAppSelector(selectAuthEmail);
  const membershipActive = isMembershipActive(dashboard);

  useEffect(() => {
    if (membershipActive && !qrUrl) {
      dispatch(generateQRThunk());
    }
  }, [dispatch, membershipActive, qrUrl]);

  const handleRefresh = () => {
    dispatch(generateQRThunk());
  };

  const handleSubscribe = () => {
    dispatch(createCheckoutSessionThunk(email || 'member@example.com'));
  };

  return (
    <div className="bg-[#fffdf8] border border-stone-300 rounded-lg p-6 shadow-xl shadow-stone-900/5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5 font-bold text-base text-stone-900">
            <span className="p-2 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </span>
            <span>Turnstile Access Pass</span>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            membershipActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-stone-100 text-stone-600 border-stone-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${membershipActive ? 'bg-emerald-600' : 'bg-stone-400'}`}></span>
            {membershipActive ? 'Active Token' : 'Membership Required'}
          </span>
        </div>

        {/* QR Display */}
        <div className="my-4 flex flex-col items-center justify-center">
          <div className="p-4 rounded-lg bg-stone-100 border border-stone-200">
            {membershipActive && qrUrl ? (
              <div className="rounded-lg bg-white p-3 shadow-md">
                <img src={qrUrl} alt="Turnstile QR Pass" className="w-44 h-44 object-contain" />
              </div>
            ) : membershipActive ? (
              <div className="w-44 h-44 flex flex-col items-center justify-center text-slate-400 gap-2">
                <svg className="w-6 h-6 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs font-mono">Generating Pass...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubscribe}
                className="w-44 h-44 flex flex-col items-center justify-center text-stone-500 gap-3 text-center px-5 rounded-md transition-colors cursor-pointer hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2"
                title="Subscribe to unlock your turnstile pass"
              >
                <svg className="w-10 h-10 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 11V7a4 4 0 10-8 0v4m-2 0h12a2 2 0 012 2v7a2 2 0 01-2 2H2a2 2 0 01-2-2v-7a2 2 0 012-2z" />
                </svg>
                <span className="text-xs leading-5">{dashboardLoading ? 'Checking membership...' : 'Subscribe to unlock your turnstile pass.'}</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-stone-600 bg-stone-100 py-2.5 px-3 rounded-md border border-stone-200 truncate">
          {membershipActive ? qrInfo || 'Hold QR code in front of turnstile scanner' : 'An active paid membership is required for turnstile access.'}
        </p>
      </div>

      <button
        onClick={handleRefresh}
        disabled={!membershipActive}
        className="mt-5 w-full py-2.5 px-4 rounded-md font-medium text-xs text-stone-700 bg-white hover:bg-stone-100 border border-stone-300 transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{membershipActive ? 'Refresh Pass Token' : 'Membership Required'}</span>
      </button>
    </div>
  );
};
