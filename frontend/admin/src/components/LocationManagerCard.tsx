import React, { useEffect, useReducer } from 'react';
import { accessFormReducer, initialAccessFormState, updateAccessFormField } from '../reducers/accessFormReducer';
import {
    changeLocationFormField,
    initialLocationFormState,
    locationFormReducer,
} from '../reducers/locationFormReducer';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
    createLocationThunk,
    createScannerThunk,
    fetchScannersThunk,
    listLocationsThunk,
    selectAccessOutput,
    selectLocationsList,
} from '../store/adminSlice';

const fieldLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600';
const fieldClass =
  'w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed';
const selectClass =
  'w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer';

export const LocationManagerCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const accessOutput = useAdminSelector(selectAccessOutput);
  const locationsList = useAdminSelector(selectLocationsList);

  const [accessForm, dispatchAccessForm] = useReducer(accessFormReducer, initialAccessFormState);

  const [formState, dispatchForm] = useReducer(locationFormReducer, initialLocationFormState);
  const { locName, locAddress } = formState;

  // Auto-fetch locations list on mount
  useEffect(() => {
    dispatch(listLocationsThunk());
  }, [dispatch]);

  // Auto-select first location when locationsList updates and none is selected
  useEffect(() => {
    if (locationsList.length > 0 && !accessForm.locationId && !accessForm.isCustomLocation) {
      const firstId = locationsList[0].PK.replace(/^LOC#/, '');
      dispatchAccessForm(updateAccessFormField('locationId', firstId));
    }
  }, [locationsList, accessForm.locationId, accessForm.isCustomLocation]);

  // Auto-fetch scanners when locationId changes
  useEffect(() => {
    if (accessForm.locationId.trim()) {
      dispatch(fetchScannersThunk(accessForm.locationId.trim()));
    }
  }, [dispatch, accessForm.locationId]);

  const handleFieldChange = (field: 'locName' | 'locAddress', value: string) => {
    dispatchForm(changeLocationFormField(field, value));
  };

  const handleCreateLocation = () => {
    dispatch(createLocationThunk({ name: locName, address: locAddress }));
  };

  const handleListLocations = () => {
    dispatch(listLocationsThunk());
  };

  const updateAccessForm = (field: keyof typeof accessForm, value: string | boolean) => {
    dispatchAccessForm(updateAccessFormField(field, value));
  };

  const selectLocationRow = (locId: string) => {
    dispatchAccessForm(updateAccessFormField('locationId', locId));
    dispatchAccessForm(updateAccessFormField('isCustomLocation', false));
  };

  const canCreateLocation = locName.trim().length > 0 && locAddress.trim().length > 0;
  const canAssignScanner =
    accessForm.locationId.trim().length > 0 &&
    accessForm.scannerName.trim().length > 0 &&
    accessForm.assignedLockerId.trim().length > 0;

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 flex flex-col justify-between h-full space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2.5 font-bold text-base text-slate-900">
            <span className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </span>
            <span>Location & Access Control Management</span>
          </div>
          <button
            type="button"
            onClick={handleListLocations}
            className="flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 px-3 py-1.5 rounded-md transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Refresh Database</span>
          </button>
        </div>

        {/* --- 1. DISPLAY LOCATIONS TABLE --- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Registered Gym Locations</span>
              <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                {locationsList.length} Facilities
              </span>
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-3.5 py-2.5">Facility Name</th>
                  <th className="px-3.5 py-2.5">Location ID</th>
                  <th className="px-3.5 py-2.5">Address</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {locationsList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 italic">
                      No locations found in database. Create one below.
                    </td>
                  </tr>
                ) : (
                  locationsList.map((loc) => {
                    const locId = loc.PK.replace(/^LOC#/, '');
                    const isSelected = accessForm.locationId === locId;
                    return (
                      <tr
                        key={locId}
                        className={`transition hover:bg-slate-50 ${isSelected ? 'bg-cyan-50/60 font-medium' : ''}`}
                      >
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900 flex items-center gap-2">
                          <span>{loc.name || 'Unnamed Facility'}</span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-700 text-white font-bold">
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-600">{locId}</td>
                        <td className="px-3.5 py-2.5 text-slate-600 truncate max-w-[180px]">{loc.address || 'N/A'}</td>
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => selectLocationRow(locId)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                              isSelected
                                ? 'bg-cyan-700 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- CREATE NEW LOCATION --- */}
        <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Add New Facility</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={fieldLabelClass} htmlFor="facility-name">
                Facility Name
              </label>
              <input
                id="facility-name"
                type="text"
                placeholder="e.g. CrossBox Downtown Gym"
                className={fieldClass}
                value={locName}
                onChange={(e) => handleFieldChange('locName', e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="facility-address">
                Address
              </label>
              <input
                id="facility-address"
                type="text"
                placeholder="e.g. 100 Main St, Suite 400"
                className={fieldClass}
                value={locAddress}
                onChange={(e) => handleFieldChange('locAddress', e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className={`w-full flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition ${
              canCreateLocation
                ? 'bg-teal-700 hover:bg-teal-600 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
            }`}
            onClick={handleCreateLocation}
            disabled={!canCreateLocation}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Facility Location</span>
          </button>
        </div>

        {/* --- FORM 1: ASSIGN SCANNER TO LOCATION --- */}
        <div className="bg-cyan-50/40 p-4 rounded-lg border border-cyan-200 space-y-3">
          <div className="flex items-center justify-between border-b border-cyan-200 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-700 text-white flex items-center justify-center text-xs">
                1
              </span>
              <span>Assign Scanner to Location</span>
            </span>
            <button
              type="button"
              className="text-[11px] text-cyan-700 hover:underline cursor-pointer"
              onClick={() => updateAccessForm('isCustomLocation', !accessForm.isCustomLocation)}
            >
              {accessForm.isCustomLocation ? 'Select Location from Table' : 'Manual Location ID'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabelClass} htmlFor="form1-location">
                Target Location
              </label>
              {!accessForm.isCustomLocation ? (
                <select
                  id="form1-location"
                  className={selectClass}
                  value={accessForm.locationId}
                  onChange={(e) => updateAccessForm('locationId', e.target.value)}
                >
                  <option value="">-- Select Location --</option>
                  {locationsList.map((loc) => {
                    const id = loc.PK.replace(/^LOC#/, '');
                    return (
                      <option key={id} value={id}>
                        {loc.name || id} ({id})
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  id="form1-custom-location"
                  className={fieldClass}
                  placeholder="Enter Location ID (e.g. loc_01)"
                  value={accessForm.locationId}
                  onChange={(e) => updateAccessForm('locationId', e.target.value)}
                />
              )}
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="form1-scanner-name">
                Scanner Name
              </label>
              <input
                id="form1-scanner-name"
                className={fieldClass}
                placeholder="e.g. Main Entrance Turnstile Reader"
                value={accessForm.scannerName}
                onChange={(e) => updateAccessForm('scannerName', e.target.value)}
                disabled={!accessForm.locationId.trim()}
              />
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="form1-locker-id">
                Assigned Locker Thing
              </label>
              <input
                id="form1-locker-id"
                className={fieldClass}
                placeholder="e.g. crossbox-locker-relay-01"
                value={accessForm.assignedLockerId}
                onChange={(e) => updateAccessForm('assignedLockerId', e.target.value)}
                disabled={!accessForm.locationId.trim()}
              />
            </div>
          </div>

          <button
            type="button"
            className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
              canAssignScanner
                ? 'bg-cyan-700 hover:bg-cyan-600 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
            }`}
            onClick={() =>
              dispatch(
                createScannerThunk({
                  locationId: accessForm.locationId,
                  name: accessForm.scannerName,
                  assignedLockerId: accessForm.assignedLockerId,
                })
              )
            }
            disabled={!canAssignScanner}
            title={
              canAssignScanner
                ? 'Assign scanner hardware and locker to location'
                : 'Select a location, then enter scanner and locker names'
            }
          >
            Assign Scanner to Location
          </button>
        </div>
      </div>

      {/* Terminal Outputs */}
      {accessOutput && (
        <div className="mt-3 rounded-md bg-cyan-50 border border-cyan-200 overflow-hidden text-xs">
          <div className="bg-cyan-100 px-3 py-1.5 border-b border-cyan-200 flex items-center justify-between text-[11px] text-cyan-800 font-mono">
            <span>Hardware Provisioning Output</span>
            <span className="text-cyan-900">200 OK</span>
          </div>
          <pre className="max-h-36 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-cyan-900">
            {accessOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
