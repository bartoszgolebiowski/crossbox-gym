import React, { useReducer } from 'react';
import { changeMemberOverrideFormField, initialMemberOverrideFormState, memberOverrideFormReducer } from '../reducers/memberOverrideFormReducer';
import { useAdminDispatch, useAdminSelector } from '../store';
import { memberOverrideThunk, selectOverrideOutput } from '../store/adminSlice';

const fieldLabelClass = 'mb-2 block text-sm font-medium text-slate-700';
const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-700/10';

export const MemberOverrideCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const overrideOutput = useAdminSelector(selectOverrideOutput);

  const [formState, dispatchForm] = useReducer(memberOverrideFormReducer, initialMemberOverrideFormState);
  const { overrideUserId, overrideAction } = formState;
  const canApplyOverride = overrideUserId.trim().length > 0;

  const handleFieldChange = (field: 'overrideUserId' | 'overrideAction', value: string) => {
    dispatchForm(changeMemberOverrideFormField(field, value));
  };

  const handleApplyOverride = () => {
    dispatch(memberOverrideThunk({ userId: overrideUserId, action: overrideAction }));
  };

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5 font-bold text-base text-slate-900">
            <span className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <span>Member Access Overrides</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200">
            Security Controls
          </span>
        </div>

        {/* Inputs */}
        <div className="space-y-4 mb-5">
          <div>
            <label className={fieldLabelClass} htmlFor="member-id">Member Email / User ID</label>
            <input
              id="member-id"
              type="text"
              placeholder="e.g. member@example.com"
              className={fieldClass}
              value={overrideUserId}
              onChange={(e) => handleFieldChange('overrideUserId', e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className={fieldLabelClass} htmlFor="override-action">Override Action</label>
            <select
              id="override-action"
              className={`${fieldClass} cursor-pointer`}
              value={overrideAction}
              onChange={(e) => handleFieldChange('overrideAction', e.target.value)}
            >
              <option value="suspend">Suspend Member Access</option>
              <option value="activate">Re-Activate Member Access</option>
            </select>
          </div>
        </div>

        {/* Action Button */}
        <button
          className={`mb-2 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ${
            overrideAction === 'suspend'
              ? 'bg-rose-600 hover:bg-rose-500'
              : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
          onClick={handleApplyOverride}
          disabled={!canApplyOverride}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Apply {overrideAction === 'suspend' ? 'Access Suspension' : 'Re-Activation'}</span>
        </button>
      </div>

      {/* Terminal Output */}
      {overrideOutput && (
        <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 overflow-hidden text-xs">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Override Result Log</span>
            <span className="text-rose-700">APPLIED</span>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-rose-800">
            {overrideOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
