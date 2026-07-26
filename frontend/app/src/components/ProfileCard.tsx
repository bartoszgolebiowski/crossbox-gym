import React from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { selectDashboard, selectCheckoutStatus, createCheckoutSessionThunk, createPortalSessionThunk } from '../store/memberSlice';

interface ProfileCardProps {
  email: string | null;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ email }) => {
  const dispatch = useAppDispatch();
  const dashboard = useAppSelector(selectDashboard);
  const checkoutStatus = useAppSelector(selectCheckoutStatus);

  const handleCheckout = () => {
    dispatch(createCheckoutSessionThunk(email || 'member@example.com'));
  };

  const handlePortal = () => {
    dispatch(createPortalSessionThunk());
  };

  return (
    <div className="bg-[#fffdf8] border border-stone-300 rounded-lg p-6 shadow-xl shadow-stone-900/5 flex flex-col justify-between h-full">
      <div>
        {/* Title */}
        <div className="flex items-center gap-2.5 font-bold text-base text-stone-900 mb-5">
          <span className="p-2 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
          <span>Member Identity & Status</span>
        </div>

        {/* Dashboard Profile Details */}
        {dashboard ? (
          <div className="space-y-3 bg-stone-100 rounded-md p-4 border border-stone-200">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <span className="text-xs text-stone-500 font-medium">Account email</span>
              <span className="text-xs font-medium text-stone-800">{dashboard.user?.email || email}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-xs text-stone-500 font-medium">Pass status</span>
              {dashboard.subscription?.status === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span> Active Pass
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  {dashboard.subscription?.status || 'Inactive'}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-stone-500 font-medium">Accessible gyms</span>
              <span className="text-xs font-medium text-rose-800">
                {dashboard.locations?.length || 0} Location(s)
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-md bg-stone-100 border border-stone-200 text-xs text-stone-500">
            Loading profile information...
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-5 space-y-2.5">
        <button
          onClick={handleCheckout}
          className="w-full py-2.5 px-4 rounded-md font-medium text-xs text-white bg-rose-800 hover:bg-rose-700 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Subscribe via Stripe Checkout</span>
        </button>

        <button
          onClick={handlePortal}
          className="w-full py-2.5 px-4 rounded-md font-medium text-xs text-stone-700 bg-white hover:bg-stone-100 border border-stone-300 transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
          <span>Manage Customer Billing Portal</span>
        </button>

        {checkoutStatus && (
          <div className="bg-stone-100 rounded-md p-2.5 border border-stone-200 text-[11px] font-mono text-rose-800 truncate">
            {checkoutStatus}
          </div>
        )}
      </div>
    </div>
  );
};
