import React from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import { rotateHMACThunk, selectRemoteOutput } from '../store/adminSlice';

export const HmacRotationCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const remoteOutput = useAdminSelector(selectRemoteOutput);

  const handleRotateHMAC = () => {
    dispatch(rotateHMACThunk());
  };

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 font-bold text-base text-slate-900">
            <span className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </span>
            <span>HMAC Security Keys</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200">
            Key Management
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-600 mb-5 leading-relaxed">
          Rotate cryptographic secret keys used to sign and verify security tokens across access turnstiles.
        </p>

        {/* Action Trigger */}
        <button
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 transition-colors hover:bg-indigo-100 hover:border-indigo-400 active:bg-indigo-200 shadow-sm"
          onClick={handleRotateHMAC}
        >
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Rotate HMAC Secret Keys</span>
        </button>
      </div>

      {/* Output */}
      {remoteOutput && remoteOutput.includes('HMAC') && (
        <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 overflow-hidden text-xs">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Key Rotation Log</span>
            <span className="text-indigo-700">UPDATED</span>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-indigo-900">
            {remoteOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
