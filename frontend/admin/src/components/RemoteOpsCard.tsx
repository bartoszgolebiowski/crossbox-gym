import React, { useEffect, useMemo, useState } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
  fetchDevicesThunk,
  listLocationsThunk,
  remoteUnlockThunk,
  selectDevicesList,
  selectLocationsList,
  selectRemoteOutput,
} from '../store/adminSlice';

const fieldLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600';
const selectClass = 'w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer';

export const RemoteOpsCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const remoteOutput = useAdminSelector(selectRemoteOutput);
  const locationsList = useAdminSelector(selectLocationsList);
  const devicesList = useAdminSelector(selectDevicesList);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedLockId, setSelectedLockId] = useState<string>('');

  // Fetch locations on mount if empty
  useEffect(() => {
    if (locationsList.length === 0) {
      dispatch(listLocationsThunk());
    }
  }, [dispatch, locationsList.length]);

  // Set default location when list loads
  useEffect(() => {
    if (locationsList.length > 0 && !selectedLocationId) {
      const firstLocId = locationsList[0].PK.replace(/^LOC#/, '');
      setSelectedLocationId(firstLocId);
    }
  }, [locationsList, selectedLocationId]);

  // Fetch devices whenever selected location changes
  useEffect(() => {
    if (selectedLocationId) {
      dispatch(fetchDevicesThunk(selectedLocationId));
    }
  }, [dispatch, selectedLocationId]);

  const availableLocks = useMemo(() => {
    return devicesList
      .filter((d) => !d.type || d.type === 'lock')
      .map((d) => ({
        id: d.device_id,
        name: d.name || `Device ${d.device_id}`,
        type: 'IoT Hardware Relay',
      }));
  }, [devicesList]);

  // Auto-select first lock option when locks list changes
  useEffect(() => {
    if (availableLocks.length > 0) {
      if (!selectedLockId || !availableLocks.some((l) => l.id === selectedLockId)) {
        setSelectedLockId(availableLocks[0].id);
      }
    } else {
      setSelectedLockId('');
    }
  }, [availableLocks, selectedLockId]);

  const canUnlock = selectedLockId.trim().length > 0 && availableLocks.length > 0;

  const handleRemoteUnlock = () => {
    if (canUnlock) {
      dispatch(remoteUnlockThunk({ deviceId: selectedLockId, locationId: selectedLocationId }));
    }
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
            <span>Remote Gate Unlock</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200">
            Hardware Relays
          </span>
        </div>

        {/* Location Selector */}
        {locationsList.length > 0 && (
          <div className="mb-4">
            <label className={fieldLabelClass} htmlFor="remote-location-select">Active Location</label>
            <select
              id="remote-location-select"
              className={selectClass}
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
            >
              {locationsList.map((loc) => {
                const id = loc.PK.replace(/^LOC#/, '');
                return (
                  <option key={id} value={id}>
                    {loc.name} ({id})
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Lock Dropdown Select */}
        <div className="mb-5">
          <label className={fieldLabelClass} htmlFor="turnstile-device-id">Target Lock / Turnstile</label>
          <select
            id="turnstile-device-id"
            className={selectClass}
            value={selectedLockId}
            onChange={(e) => setSelectedLockId(e.target.value)}
            disabled={availableLocks.length === 0}
          >
            {availableLocks.length > 0 ? (
              availableLocks.map((lock) => (
                <option key={lock.id} value={lock.id}>
                  {lock.name} [{lock.id}]
                </option>
              ))
            ) : (
              <option value="" disabled>
                No locks available at this location
              </option>
            )}
          </select>
        </div>

        {/* Action Button */}
        <div className="mb-2">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
            onClick={handleRemoteUnlock}
            disabled={!canUnlock}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <span>Remote Turnstile Unlock Signal</span>
          </button>
        </div>
      </div>

      {/* Output */}
      {remoteOutput && !remoteOutput.includes('HMAC') && (
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
