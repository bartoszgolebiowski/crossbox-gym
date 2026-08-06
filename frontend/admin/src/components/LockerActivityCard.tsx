import { useEffect, useMemo } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
  fetchLockerActivityThunk,
  fetchLockerDevicesThunk,
  selectLockerActivityState,
  setLockerPageSize,
  setLockerSearchFilter,
  setLockerSelectedDeviceId,
  setLockerSelectedLocationId,
  setLockerTimeWindow,
} from '../store/lockerActivitySlice';

export function LockerActivityCard() {
  const dispatch = useAdminDispatch();
  const locations = useAdminSelector((state) => state.adminOps.locationsList);
  const {
    selectedLocationId,
    lockers,
    selectedDeviceId,
    timeWindow,
    activityData,
    isLoading,
    error,
    searchFilter,
    pageSize,
    currentPage,
  } = useAdminSelector(selectLockerActivityState);

  // Automatically select first location when available
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      dispatch(setLockerSelectedLocationId(locations[0].PK.replace('LOC#', '')));
    }
  }, [dispatch, locations, selectedLocationId]);

  // Load lockers for selected location
  useEffect(() => {
    if (selectedLocationId) {
      dispatch(fetchLockerDevicesThunk(selectedLocationId));
    }
  }, [dispatch, selectedLocationId]);

  // Fetch locker activity audit logs for selected location and locker filter
  useEffect(() => {
    if (selectedLocationId) {
      dispatch(fetchLockerActivityThunk({ direction: 'first' }));
    }
  }, [dispatch, selectedLocationId, selectedDeviceId, timeWindow, pageSize]);

  // Filter activity items based on search filter text
  const filteredItems = useMemo(() => {
    if (!activityData?.items) return [];
    if (!searchFilter.trim()) return activityData.items;

    const term = searchFilter.toLowerCase();
    return activityData.items.filter(
      (item) =>
        item.user_id?.toLowerCase().includes(term) ||
        item.locker_id?.toLowerCase().includes(term) ||
        item.scanner_id?.toLowerCase().includes(term) ||
        item.device_id?.toLowerCase().includes(term) ||
        item.result?.toLowerCase().includes(term)
    );
  }, [activityData?.items, searchFilter]);

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </span>
            Locker Door Activity Audit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Track door unlock audit events for location lockers.</p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(fetchLockerActivityThunk({ direction: 'first' }))}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-md transition cursor-pointer"
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
            onChange={(e) => dispatch(setLockerSelectedLocationId(e.target.value))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
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
            2. Select Locker
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => dispatch(setLockerSelectedDeviceId(e.target.value))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
          >
            <option value="all">All Lockers at Location</option>
            {lockers.map((lk) => (
              <option key={lk.locker_id} value={lk.locker_id}>
                {lk.name} ({lk.locker_id})
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
                onClick={() => dispatch(setLockerTimeWindow(win))}
                className={`flex-1 py-1 text-xs font-semibold capitalize rounded transition cursor-pointer ${
                  timeWindow === win ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
          <div className="text-[11px] text-slate-500 mt-0.5">Loaded records on this page</div>
        </div>
        <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-lg">
          <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Granted Access</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {isLoading ? '...' : activityData?.success_count || 0}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Successful door unlocks on page</div>
        </div>
        <div className="bg-rose-50/60 border border-rose-200 p-4 rounded-lg">
          <div className="text-xs font-semibold text-rose-800 uppercase tracking-wider">Denied Access</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {isLoading ? '...' : activityData?.denied_count || 0}
          </div>
          <div className="text-[11px] text-rose-600 mt-0.5">Rejected access attempts on page</div>
        </div>
      </div>

      {/* Table & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-900">Locker Door Unlock Audit Stream</h3>
            <span className="text-[11px] text-slate-500">
              Page {currentPage + 1} · {pageSize} records max
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => dispatch(setLockerPageSize(Number(e.target.value) as 10 | 20 | 50))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
              aria-label="Records per page"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <input
              type="text"
              placeholder="Filter logs by User, Locker, or Result..."
              value={searchFilter}
              onChange={(e) => dispatch(setLockerSearchFilter(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 w-full sm:w-72"
            />
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3.5 py-2.5">Timestamp</th>
                <th className="px-3.5 py-2.5">User ID</th>
                <th className="px-3.5 py-2.5">Locker ID</th>
                <th className="px-3.5 py-2.5">Scanner ID</th>
                <th className="px-3.5 py-2.5 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-medium">
                    Loading locker activity stream...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                    No locker door unlock logs found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={item.entry_id || idx} className="hover:bg-slate-50 transition">
                    <td className="px-3.5 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900">{item.user_id}</td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-600">{item.locker_id || '-'}</td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-600">
                      {item.scanner_id || item.device_id || '-'}
                    </td>
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

        {/* Pagination Controls */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => dispatch(fetchLockerActivityThunk({ direction: 'prev' }))}
            disabled={currentPage === 0 || isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-500">
            {activityData?.items?.length || 0} records loaded ·{' '}
            {activityData?.has_more ? 'more available' : 'end of stream'}
          </span>
          <button
            type="button"
            onClick={() => dispatch(fetchLockerActivityThunk({ direction: 'next' }))}
            disabled={!activityData?.has_more || isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
