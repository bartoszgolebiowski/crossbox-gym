import { useEffect, useMemo } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
  fetchActivityThunk,
  fetchHardwareDevicesThunk,
  selectHardwareActivityState,
  setSearchFilter,
  setSelectedDeviceId,
  setSelectedLocationId,
  setTimeWindow,
} from '../store/hardwareActivitySlice';

export function HardwareActivityCard() {
  const dispatch = useAdminDispatch();
  const locations = useAdminSelector((state) => state.adminOps.locationsList);
  const { selectedLocationId, scanners, selectedDeviceId, timeWindow, activityData, isLoading, error, searchFilter } =
    useAdminSelector(selectHardwareActivityState);

  // Automatically select first location when available
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      dispatch(setSelectedLocationId(locations[0].PK.replace('LOC#', '')));
    }
  }, [dispatch, locations, selectedLocationId]);

  // Load scanners for selected location
  useEffect(() => {
    if (selectedLocationId) {
      dispatch(fetchHardwareDevicesThunk(selectedLocationId));
    }
  }, [dispatch, selectedLocationId]);

  // Fetch activity audit logs for selected location and hardware filter
  useEffect(() => {
    if (selectedLocationId) {
      dispatch(fetchActivityThunk());
    }
  }, [dispatch, selectedLocationId, selectedDeviceId, timeWindow]);

  // Filter activity items based on search filter text
  const filteredItems = useMemo(() => {
    if (!activityData?.items) return [];
    if (!searchFilter.trim()) return activityData.items;

    const term = searchFilter.toLowerCase();
    return activityData.items.filter(
      (item) =>
        item.user_id?.toLowerCase().includes(term) ||
        item.scanner_id?.toLowerCase().includes(term) ||
        item.device_id?.toLowerCase().includes(term) ||
        item.qr_provider_id?.toLowerCase().includes(term) ||
        item.result?.toLowerCase().includes(term)
    );
  }, [activityData?.items, searchFilter]);

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="p-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </span>
            Hardware Activity & Usage Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track usage metrics and scan/unlock logs for location scanners.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(fetchActivityThunk())}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-md transition cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh Logs
        </button>
      </div>

      {/* Control Bar: Location Selection & Device Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            1. Target Location
          </label>
          <select
            value={selectedLocationId}
            onChange={(e) => dispatch(setSelectedLocationId(e.target.value))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
          >
            <option value="">-- Select Location --</option>
            {locations.map((loc) => {
              const id = loc.PK.replace('LOC#', '');
              return (
                <option key={id} value={id}>
                  {loc.name || id} ({id})
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            2. Select Scanner
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => dispatch(setSelectedDeviceId(e.target.value))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
          >
            <option value="all">All Scanners at Location</option>
            {scanners.map((sc) => (
              <option key={sc.scanner_id} value={sc.scanner_id}>
                {sc.name} ({sc.scanner_id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            3. Time Horizon
          </label>
          <div className="flex bg-white rounded-md border border-slate-300 p-1">
            {(['hourly', 'daily', 'weekly'] as const).map((win) => (
              <button
                key={win}
                type="button"
                onClick={() => dispatch(setTimeWindow(win))}
                className={`flex-1 py-1 text-xs font-semibold capitalize rounded transition cursor-pointer ${
                  timeWindow === win ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {win}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Attempts</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {isLoading ? '...' : activityData?.total_count || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Scans across selected horizon</div>
        </div>
        <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-lg">
          <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Granted Access</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {isLoading ? '...' : activityData?.success_count || 0}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Successful gate unlocks</div>
        </div>
        <div className="bg-rose-50/60 border border-rose-200 p-4 rounded-lg">
          <div className="text-xs font-semibold text-rose-800 uppercase tracking-wider">Denied Access</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {isLoading ? '...' : activityData?.denied_count || 0}
          </div>
          <div className="text-[11px] text-rose-600 mt-0.5">Rejected scans / expired passes</div>
        </div>
      </div>

      {/* Table & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">Scan & Access Audit Stream</h3>
          <input
            type="text"
            placeholder="Filter logs by User, Scanner, or Result..."
            value={searchFilter}
            onChange={(e) => dispatch(setSearchFilter(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 w-full sm:w-72"
          />
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3.5 py-2.5">Timestamp</th>
                <th className="px-3.5 py-2.5">User ID</th>
                <th className="px-3.5 py-2.5">Scanner ID</th>
                <th className="px-3.5 py-2.5">QR Provider</th>
                <th className="px-3.5 py-2.5 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-medium">
                    Loading activity stream...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                    No hardware scan logs found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={item.entry_id || idx} className="hover:bg-slate-50 transition">
                    <td className="px-3.5 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900">{item.user_id}</td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-600">
                      {item.scanner_id || item.device_id || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{item.qr_provider_id || 'basic-subscription'}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                          item.result === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.result}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
