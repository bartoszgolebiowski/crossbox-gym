import React, { useReducer } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import { selectRemoteOutput, remoteUnlockThunk, rotateHMACThunk } from '../store/adminSlice';
import { remoteOpsFormReducer, initialRemoteOpsFormState, setUnlockDeviceId } from '../reducers/remoteOpsFormReducer';

const fieldLabelClass = 'mb-2 block text-sm font-medium text-slate-700';
const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3.5 py-3 font-mono text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-700/10';

export const RemoteOpsCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const remoteOutput = useAdminSelector(selectRemoteOutput);

  const [formState, dispatchForm] = useReducer(remoteOpsFormReducer, initialRemoteOpsFormState);
  const { unlockDeviceId } = formState;

  const handleRemoteUnlock = () => {
    dispatch(remoteUnlockThunk({ deviceId: unlockDeviceId }));
  };

  const handleRotateHMAC = () => {
    dispatch(rotateHMACThunk());
  };

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5 font-bold text-base text-slate-900">
            <span className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <span>Remote Operations</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200">
            Hardware Relays
          </span>
        </div>

        {/* Input Field */}
        <div className="mb-5">
          <label className={fieldLabelClass} htmlFor="turnstile-device-id">Target Turnstile Device ID</label>
          <input
            id="turnstile-device-id"
            type="text"
            placeholder="e.g. TURNSTILE-MAIN-01"
            className={fieldClass}
            value={unlockDeviceId}
            onChange={(e) => dispatchForm(setUnlockDeviceId(e.target.value))}
          />
        </div>

        {/* Action Triggers */}
        <div className="space-y-2.5 mb-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-amber-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
            onClick={handleRemoteUnlock}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <span>Remote Turnstile Unlock Signal</span>
          </button>

          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={handleRotateHMAC}
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Rotate HMAC Secret Keys</span>
          </button>
        </div>
      </div>

      {/* Output */}
      {remoteOutput && (
        <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 overflow-hidden text-xs">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Remote Command Log</span>
            <span className="text-amber-700">EXECUTED</span>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-amber-800">
            {remoteOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
