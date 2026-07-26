import React, { useReducer } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import { selectLocationOutput, createLocationThunk, listLocationsThunk } from '../store/adminSlice';
import { locationFormReducer, initialLocationFormState, changeLocationFormField } from '../reducers/locationFormReducer';

const fieldLabelClass = 'mb-2 block text-sm font-medium text-slate-700';
const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-cyan-700 focus:outline-none focus:ring-4 focus:ring-cyan-700/10';

export const LocationManagerCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const locationOutput = useAdminSelector(selectLocationOutput);

  const [formState, dispatchForm] = useReducer(locationFormReducer, initialLocationFormState);
  const { locName, locAddress } = formState;

  const handleFieldChange = (field: 'locName' | 'locAddress', value: string) => {
    dispatchForm(changeLocationFormField(field, value));
  };

  const handleCreate = () => {
    dispatch(createLocationThunk({ name: locName, address: locAddress }));
  };

  const handleList = () => {
    dispatch(listLocationsThunk());
  };

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 flex flex-col justify-between h-full">
      <div>
        {/* Title */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5 font-bold text-base text-slate-900">
            <span className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <span>Location Management</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200">
            Locations API
          </span>
        </div>

        {/* Inputs */}
        <div className="space-y-4 mb-5">
          <div>
            <label className={fieldLabelClass} htmlFor="facility-name">Facility Name</label>
            <input
              id="facility-name"
              type="text"
              placeholder="e.g. CrossBox Downtown Gym"
              className={fieldClass}
              value={locName}
              onChange={(e) => handleFieldChange('locName', e.target.value)}
              autoComplete="organization"
            />
          </div>

          <div>
            <label className={fieldLabelClass} htmlFor="facility-address">Physical Address</label>
            <input
              id="facility-address"
              type="text"
              placeholder="e.g. 100 Main St, Suite 400"
              className={fieldClass}
              value={locAddress}
              onChange={(e) => handleFieldChange('locAddress', e.target.value)}
              autoComplete="street-address"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 mb-2">
          <button
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-teal-700 px-3 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-600"
            onClick={handleCreate}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Facility</span>
          </button>

          <button
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={handleList}
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>List Locations</span>
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      {locationOutput && (
        <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 overflow-hidden text-xs">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Terminal Output</span>
            <span className="text-cyan-700">200 OK</span>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-cyan-800">
            {locationOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
