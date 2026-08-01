import { useEffect, useMemo } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
  fetchActivityThunk,
  fetchHardwareDevicesThunk,
  selectHardwareActivityState,
  setDeviceType,
  setSearchFilter,
  setSelectedDeviceId,
  setSelectedLocationId,
  setTimeWindow,
} from '../store/hardwareActivitySlice';

export function HardwareActivityCard() {
  const dispatch = useAdminDispatch();
  const locations = useAdminSelector((state) => state.adminOps.locationsList);
  const {
    selectedLocationId,
    deviceType,
    scanners,
    lockers,
    selectedDeviceId,
    timeWindow,
    activityData,
    isLoading,
    error,
    searchFilter,
  } = useAdminSelector(selectHardwareActivityState);

  // Automatically select first location when available
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      dispatch(setSelectedLocationId(locations[0].PK.replace('LOC#', '')));
    }
  }, [dispatch, locations, selectedLocationId]);

  // Load scanners and lockers for selected location
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
  }, [dispatch, selectedLocationId, deviceType, selectedDeviceId, timeWindow]);

  const handleRefresh = () => {
    if (selectedLocationId) {
      dispatch(fetchActivityThunk());
    }
  };

  // Filter items by client search input
  const filteredItems = useMemo(() => {
    if (!activityData?.items) return [];
    if (!searchFilter.trim()) return activityData.items;

    const term = searchFilter.toLowerCase();
    return activityData.items.filter(
      (item) =>
        item.user_id?.toLowerCase().includes(term) ||
        item.scanner_id?.toLowerCase().includes(term) ||
        item.locker_id?.toLowerCase().includes(term) ||
        item.qr_provider_id?.toLowerCase().includes(term) ||
        item.result?.toLowerCase().includes(term)
    );
  }, [activityData, searchFilter]);

  // Usage aggregation breakdown for selected time window
  const activeStats = useMemo(() => {
    if (!activityData) return [];
    const source =
      timeWindow === 'hourly'
        ? activityData.hourly_stats
        : timeWindow === 'daily'
        ? activityData.daily_stats
        : activityData.weekly_stats;

    return Object.entries(source || {})
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 10);
  }, [activityData, timeWindow]);

  return (
    <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-teal-700 text-xs font-semibold uppercase tracking-wider">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Audit & Analytics
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Hardware Activity Audit</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track usage metrics and scan/unlock logs for location scanners & lockers.</p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading || !selectedLocationId}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 shrink-0 cursor-pointer"
        >
          <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isLoading ? 'Refreshing...' : 'Refresh Activity'}
        </button>
      </div>

      {/* Location & Device Type Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            1. Select Location
          </label>
          <select
            value={selectedLocationId}
            onChange={(e) => {
              dispatch(setSelectedLocationId(e.target.value));
              dispatch(setSelectedDeviceId('all'));
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
          >
            {locations.length === 0 && <option value="">No locations available</option>}
            {locations.map((loc) => {
              const locId = loc.PK.replace('LOC#', '');
              return (
                <option key={locId} value={locId}>
                  {loc.name} ({locId})
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            2. Hardware Type
          </label>
          <div className="flex rounded-md border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => {
                dispatch(setDeviceType('scanners'));
                dispatch(setSelectedDeviceId('all'));
              }}
              className={`flex-1 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                deviceType === 'scanners' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scanners ({scanners.length})
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch(setDeviceType('lockers'));
                dispatch(setSelectedDeviceId('all'));
              }}
              className={`flex-1 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                deviceType === 'lockers' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lockers ({lockers.length})
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            3. Select Particular Device
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => dispatch(setSelectedDeviceId(e.target.value))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
          >
            <option value="all">
              All {deviceType === 'scanners' ? 'Scanners' : 'Lockers'} at Location
            </option>
            {deviceType === 'scanners'
              ? scanners.map((sc) => (
                  <option key={sc.scanner_id} value={sc.scanner_id}>
                    {sc.name} ({sc.scanner_id})
                  </option>
                ))
              : lockers.map((lk) => (
                  <option key={lk.locker_id} value={lk.locker_id}>
                    {lk.name} ({lk.locker_id})
                  </option>
                ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700 font-medium">
          {error}
        </div>
      )}

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Total Activities</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{activityData?.total_count || 0}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Total registered events</div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="text-xs font-medium text-emerald-800">Successful Access</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{activityData?.success_count || 0}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">
            {activityData?.total_count
              ? `${((activityData.success_count / activityData.total_count) * 100).toFixed(1)}% success rate`
              : '0% success rate'}
          </div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
          <div className="text-xs font-medium text-rose-800">Denied Access</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{activityData?.denied_count || 0}</div>
          <div className="text-[11px] text-rose-600 mt-0.5">
            {activityData?.total_count
              ? `${((activityData.denied_count / activityData.total_count) * 100).toFixed(1)}% denied rate`
              : '0% denied rate'}
          </div>
        </div>

        <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 shadow-xs">
          <div className="text-xs font-medium text-teal-800">Time Aggregation</div>
          <div className="mt-2 flex rounded-md bg-white p-0.5 border border-teal-200">
            <button
              type="button"
              onClick={() => dispatch(setTimeWindow('hourly'))}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                timeWindow === 'hourly' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hourly
            </button>
            <button
              type="button"
              onClick={() => dispatch(setTimeWindow('daily'))}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                timeWindow === 'daily' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => dispatch(setTimeWindow('weekly'))}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                timeWindow === 'weekly' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Weekly
            </button>
          </div>
        </div>
      </div>

      {/* Usage Frequency Breakdown Table */}
      {activeStats.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Usage Frequency Breakdown ({timeWindow.toUpperCase()})
            </span>
            <span className="text-xs text-slate-500">Top 10 Periods</span>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {activeStats.map(([period, count]) => (
              <div key={period} className="rounded-md bg-slate-50 p-3 border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-slate-600 truncate">{period}</span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-teal-700">{count}</span>
                  <span className="text-[10px] text-slate-400 uppercase">scans</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Activity Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">Detailed Activity Logs ({filteredItems.length})</h3>
          <input
            type="text"
            placeholder="Search by User ID, Device ID, Provider..."
            value={searchFilter}
            onChange={(e) => dispatch(setSearchFilter(e.target.value))}
            className="w-full sm:w-64 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 uppercase text-[10px] tracking-wider text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Scanner ID</th>
                  <th className="py-3 px-4">Locker ID</th>
                  <th className="py-3 px-4">Subject / User ID</th>
                  <th className="py-3 px-4">QR Provider</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Unlock Command ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      No hardware activity records found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.entry_id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                        {new Date(item.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                        {item.scanner_id || item.device_id || '-'}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                        {item.locker_id || '-'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {item.user_id || '-'}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-teal-700">
                        {item.qr_provider_id || 'mock'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.result === 'success'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.result}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[140px]">
                        {item.unlock_command_id || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
