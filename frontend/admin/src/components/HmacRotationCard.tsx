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
    <div className="bg-paper border border-line rounded-card p-6 shadow-card flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 font-bold text-base text-ink">
            <span className="rounded-card border border-info/30 bg-info/10 p-2 text-info">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </span>
            <span>Klucze Szyfrujące HMAC</span>
          </div>
          <span className="px-2 py-0.5 rounded-pill text-xs font-medium text-info bg-info/10 border border-info/30">
            Zarządzanie Kluczami
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-ink/70 mb-5 leading-relaxed">
          Rotacja kryptograficznych kluczy tajnych służących do generowania i weryfikacji kodów QR przy bramkach.
        </p>

        {/* Action Trigger */}
        <button
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-info/40 bg-info/10 px-4 py-3 text-sm font-semibold text-info transition-colors hover:bg-info/20 hover:border-info/60 active:bg-info/25 shadow-control"
          onClick={handleRotateHMAC}
        >
          <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Wykonaj Rotację Kluczy HMAC</span>
        </button>
      </div>

      {/* Output */}
      {remoteOutput && remoteOutput.includes('HMAC') && (
        <div className="mt-4 rounded-control bg-line/10 border border-line/60 overflow-hidden text-xs">
          <div className="bg-line/20 px-3 py-1.5 border-b border-line/60 flex items-center justify-between text-[11px] text-muted font-mono">
            <span>Rejestr Rotacji Kluczy</span>
            <span className="text-info">ZAKTUALIZOWANO</span>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-info">
            {remoteOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
