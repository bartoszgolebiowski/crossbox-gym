import React, { useEffect, useState } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
  checkDeviceHealthThunk,
  fetchDevicesThunk,
  selectDeviceHealthMap,
  selectDevicesList,
  selectLocationsList,
} from '../store/adminSlice';

interface IotDeviceHealthCardProps {
  locationId?: string;
}

export const IotDeviceHealthCard: React.FC<IotDeviceHealthCardProps> = ({ locationId: propLocationId }) => {
  const dispatch = useAdminDispatch();
  const locationsList = useAdminSelector(selectLocationsList);
  const devicesList = useAdminSelector(selectDevicesList);
  const healthMap = useAdminSelector(selectDeviceHealthMap);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedDeviceOutput, setSelectedDeviceOutput] = useState<string | null>(null);

  const activeLocationId = propLocationId || selectedLocationId;

  // Set default location when list loads
  useEffect(() => {
    if (!activeLocationId && locationsList.length > 0) {
      const firstId = locationsList[0].PK.replace(/^LOC#/, '');
      setSelectedLocationId(firstId);
    }
  }, [locationsList, activeLocationId]);

  // Load devices when location changes
  useEffect(() => {
    if (activeLocationId) {
      dispatch(fetchDevicesThunk(activeLocationId));
    }
  }, [dispatch, activeLocationId]);

  // Map devices list into unified IoT device list
  const combinedDevices = React.useMemo(() => {
    const list: Array<{ id: string; name: string; type: string; details?: string }> = [];
    const seen = new Set<string>();

    for (const dev of devicesList) {
      if (dev.device_id && !seen.has(dev.device_id)) {
        seen.add(dev.device_id);
        const typeLabel =
          dev.type === 'lock' ? 'Locker Relay' : dev.type === 'scanner' ? 'QR Scanner' : 'IoT Hardware';
        list.push({
          id: dev.device_id,
          name: dev.name || `Device ${dev.device_id}`,
          type: typeLabel,
          details: `Type: ${dev.type || 'unknown'}`,
        });
      }
    }

    return list;
  }, [devicesList]);

  const handleCheckHealth = (deviceId: string) => {
    dispatch(checkDeviceHealthThunk({ deviceId, locationId: activeLocationId }))
      .unwrap()
      .then((res) => {
        setSelectedDeviceOutput(JSON.stringify(res.data, null, 2));
      })
      .catch((err) => {
        setSelectedDeviceOutput(JSON.stringify(err, null, 2));
      });
  };

  const handleCheckAllHealth = () => {
    combinedDevices.forEach((dev) => {
      dispatch(checkDeviceHealthThunk({ deviceId: dev.id, locationId: activeLocationId }));
    });
  };

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-xl shadow-slate-900/5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5 font-bold text-base text-slate-900">
          <span className="rounded-lg border border-teal-200 bg-teal-50 p-2 text-teal-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
          <div>
            <div>IoT Hardware Live Connections & Health Checks</div>
            <p className="text-xs font-normal text-slate-500 mt-0.5">
              Verify live connectivity and ping response times for active IoT scanners and locker relays.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckAllHealth}
          disabled={combinedDevices.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Health Check Fleet</span>
        </button>
      </div>

      {/* Location selector if not passed as prop */}
      {!propLocationId && locationsList.length > 0 && (
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <label
            htmlFor="iot-health-loc-select"
            className="text-xs font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap"
          >
            Selected Location:
          </label>
          <select
            id="iot-health-loc-select"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-700 focus:outline-none cursor-pointer"
          >
            {locationsList.map((loc) => {
              const id = loc.PK.replace(/^LOC#/, '');
              return (
                <option key={id} value={id}>
                  {loc.name || id} ({id})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Device List Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Device & Hardware ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Live Status</th>
              <th className="px-4 py-3">Ping Latency</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {combinedDevices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                  No IoT devices provisioned for this location. Provision devices via CLI (`npm run provision:devices{' '}
                  {activeLocationId || '<locationId>'}`).
                </td>
              </tr>
            ) : (
              combinedDevices.map((dev) => {
                const health = healthMap[dev.id];
                const isChecking = health?.status === 'CHECKING' || health?.isLoading;
                const isOnline = health ? health.connected || health.status === 'ONLINE' : true; // default online for active fleet

                return (
                  <tr key={dev.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        <span>{dev.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 font-normal mt-0.5">{dev.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {dev.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isChecking ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                          CHECKING...
                        </span>
                      ) : isOnline ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400"></span>
                          ONLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          OFFLINE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {health?.latency_ms ? (
                        <span className="text-emerald-700 font-semibold">{health.latency_ms} ms</span>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleCheckHealth(dev.id)}
                        disabled={isChecking}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition cursor-pointer disabled:opacity-50"
                        title="Run live health check to confirm IoT connection"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-teal-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                        <span>Health Check</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Helper Note for CLI Provisioning */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-start gap-3 text-xs text-slate-600">
        <svg className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <span className="font-semibold text-slate-800">CLI Provisioning Note: </span>
          Devices are added directly via CLI using{' '}
          <code className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded font-mono text-[11px]">
            node scripts/provision-devices.mjs &lt;locationId&gt;
          </code>
          . IoT devices connect automatically to AWS IoT Core using mTLS certificates.
        </div>
      </div>

      {/* Output Console for Health Check Details */}
      {selectedDeviceOutput && (
        <div className="rounded-md bg-slate-900 border border-slate-800 overflow-hidden text-xs">
          <div className="bg-slate-800 px-3 py-1.5 border-b border-slate-700 flex items-center justify-between text-[11px] text-teal-400 font-mono">
            <span>IoT Health Check Response Payload</span>
            <button
              type="button"
              onClick={() => setSelectedDeviceOutput(null)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Clear
            </button>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-teal-300">
            {selectedDeviceOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
