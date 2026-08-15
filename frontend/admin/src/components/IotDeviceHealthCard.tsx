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
        const typeLabel = dev.type === 'lock' ? 'Locker Relay' : dev.type === 'scanner' ? 'QR Scanner' : 'IoT Hardware';
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
    <div className="bg-paper border border-line rounded-card p-6 shadow-card space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line/60">
        <div className="flex items-center gap-2.5 font-bold text-base text-ink">
          <span className="rounded-card border border-secondary/30 bg-secondary/10 p-2 text-secondary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
          <div>
            <div>Stan Urządzeń IoT i Test Połączeń</div>
            <p className="text-xs font-normal text-muted mt-0.5">
              Sprawdzanie dostępności w sieci i opóźnień (ping) dla skanerów i zamków szafek.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckAllHealth}
          disabled={combinedDevices.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold text-secondary bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 px-3 py-1.5 rounded-control transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Testuj Wszystkie Urządzenia</span>
        </button>
      </div>

      {/* Location selector if not passed as prop */}
      {!propLocationId && locationsList.length > 0 && (
        <div className="flex items-center gap-3 bg-line/10 p-3 rounded-card border border-line/60">
          <label
            htmlFor="iot-health-loc-select"
            className="text-xs font-semibold uppercase tracking-wider text-ink/70 whitespace-nowrap"
          >
            Wybrany Obiekt:
          </label>
          <select
            id="iot-health-loc-select"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="w-full rounded-control border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink focus:border-secondary focus:outline-none cursor-pointer"
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
      <div className="border border-line/60 rounded-card overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-line/20 text-ink/80 uppercase tracking-wider font-semibold border-b border-line/60">
            <tr>
              <th className="px-4 py-3">Urządzenie i Hardware ID</th>
              <th className="px-4 py-3">Typ</th>
              <th className="px-4 py-3">Status Połączenia</th>
              <th className="px-4 py-3">Opóźnienie (Ping)</th>
              <th className="px-4 py-3 text-right">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60 bg-paper">
            {combinedDevices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40 italic">
                  Brak przypisanych urządzeń IoT do tego obiektu. Urządzenia dodaje się komendą CLI (`npm run provision:devices{' '}
                  {activeLocationId || '<locationId>'}`).
                </td>
              </tr>
            ) : (
              combinedDevices.map((dev) => {
                const health = healthMap[dev.id];
                const isChecking = health?.status === 'CHECKING' || health?.isLoading;
                const isOnline = health ? health.connected || health.status === 'ONLINE' : true; // default online for active fleet

                return (
                  <tr key={dev.id} className="hover:bg-line/10 transition">
                    <td className="px-4 py-3 font-semibold text-ink">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-muted"></span>
                        <span>{dev.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-muted font-normal mt-0.5">{dev.id}</div>
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-line/20 text-ink/80 border border-line/60">
                        {dev.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isChecking ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-bold bg-accent/10 text-accent border border-accent/30 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping"></span>
                          SPRAWDZANIE...
                        </span>
                      ) : isOnline ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-bold bg-success/10 text-success border border-success/30">
                          <span className="w-2 h-2 rounded-full bg-success shadow-xs"></span>
                          POŁĄCZONY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-bold bg-danger/10 text-danger border border-danger/30">
                          <span className="w-2 h-2 rounded-full bg-danger"></span>
                          ROZŁĄCZONY
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink/70">
                      {health?.latency_ms ? (
                        <span className="text-success font-semibold">{health.latency_ms} ms</span>
                      ) : (
                        <span className="text-ink/40">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleCheckHealth(dev.id)}
                        disabled={isChecking}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-semibold text-secondary bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 transition cursor-pointer disabled:opacity-50"
                        title="Testuj połączenie z urządzeniem IoT"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-secondary"
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
                        <span>Testuj Połączenie</span>
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
      <div className="bg-line/10 border border-line/60 rounded-card p-3.5 flex items-start gap-3 text-xs text-ink/70">
        <svg className="w-5 h-5 text-secondary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <span className="font-semibold text-ink">Informacja o konfiguracji CLI: </span>
          Urządzenia dodaje się poleceniem w terminalu{' '}
          <code className="bg-line/20 text-ink px-1 py-0.5 rounded font-mono text-[11px]">
            node scripts/provision-devices.mjs &lt;locationId&gt;
          </code>
          . Urządzenia IoT łączą się automatycznie z AWS IoT Core za pomocą certyfikatów mTLS.
        </div>
      </div>

      {/* Output Console for Health Check Details */}
      {selectedDeviceOutput && (
        <div className="rounded-control bg-ink border border-ink/80 overflow-hidden text-xs">
          <div className="bg-ink/90 px-3 py-1.5 border-b border-ink/70 flex items-center justify-between text-[11px] text-secondary font-mono">
            <span>Odpowiedź Testu Urządzenia IoT</span>
            <button
              type="button"
              onClick={() => setSelectedDeviceOutput(null)}
              className="text-paper/60 hover:text-paper text-xs cursor-pointer"
            >
              Wyczyść
            </button>
          </div>
          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-secondary">
            {selectedDeviceOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
