import { useEffect, useMemo } from 'react';
import { useAdminDispatch, useAdminSelector } from '../store';
import {
  fetchActivityThunk,
  fetchHardwareDevicesThunk,
  selectHardwareActivityState,
  setPageSize,
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
    scanners,
    selectedDeviceId,
    timeWindow,
    activityData,
    isLoading,
    error,
    searchFilter,
    pageSize,
    currentPage,
  } = useAdminSelector(selectHardwareActivityState);

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
      dispatch(fetchActivityThunk({ direction: 'first' }));
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
        item.scanner_id?.toLowerCase().includes(term) ||
        item.device_id?.toLowerCase().includes(term) ||
        item.qr_provider_id?.toLowerCase().includes(term) ||
        item.result?.toLowerCase().includes(term)
    );
  }, [activityData?.items, searchFilter]);

  return (
    <div className="bg-paper border border-line rounded-card p-6 shadow-card space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line/60">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <span className="p-2 rounded-card bg-secondary/10 border border-secondary/30 text-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </span>
            <span>Hardware Activity & Usage Analytics</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">Śledzenie statystyk użycia oraz historii skanów i otwarć bramek w obiektach.</p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(fetchActivityThunk({ direction: 'first' }))}
          className="flex items-center gap-1.5 text-xs font-semibold text-secondary bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 px-3 py-1.5 rounded-control transition cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Odśwież Rejestr
        </button>
      </div>

      {/* Control Bar: Location Selection & Device Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-line/10 p-4 rounded-card border border-line/60">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
            1. Wybrany Obiekt
          </label>
          <select
            value={selectedLocationId}
            onChange={(e) => dispatch(setSelectedLocationId(e.target.value))}
            className="w-full rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
          >
            <option value="">-- Wybierz Obiekt --</option>
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
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
            2. Wybór Skanera
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => dispatch(setSelectedDeviceId(e.target.value))}
            className="w-full rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
          >
            <option value="all">Wszystkie skanery w obiekcie</option>
            {scanners.map((sc) => (
              <option key={sc.scanner_id} value={sc.scanner_id}>
                {sc.name} ({sc.scanner_id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
            3. Zakres Czasowy
          </label>
          <div className="flex bg-paper rounded-control border border-line p-1">
            {(['hourly', 'daily', 'weekly'] as const).map((win) => (
              <button
                key={win}
                type="button"
                onClick={() => dispatch(setTimeWindow(win))}
                className={`flex-1 py-1 text-xs font-semibold rounded transition cursor-pointer ${
                  timeWindow === win ? 'bg-secondary text-white shadow-xs' : 'text-ink/70 hover:text-ink'
                }`}
              >
                {win === 'hourly' ? 'Godzinowy' : win === 'daily' ? 'Dzienny' : 'Tygodniowy'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-control text-xs font-medium text-danger">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-line/10 border border-line/60 p-4 rounded-card">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">Łącznie Skanów</div>
          <div className="text-2xl font-bold text-ink mt-1">{isLoading ? '...' : activityData?.total_count || 0}</div>
          <div className="text-[11px] text-muted mt-0.5">Wczytane rekordy na tej stronie</div>
        </div>
        <div className="bg-success/10 border border-success/30 p-4 rounded-card">
          <div className="text-xs font-semibold text-success uppercase tracking-wider">Przyznane Dostęp</div>
          <div className="text-2xl font-bold text-success mt-1">
            {isLoading ? '...' : activityData?.success_count || 0}
          </div>
          <div className="text-[11px] text-success mt-0.5">Pomyślne otwarcia bramki na stronie</div>
        </div>
        <div className="bg-danger/10 border border-danger/30 p-4 rounded-card">
          <div className="text-xs font-semibold text-danger uppercase tracking-wider">Odmowy Dostępu</div>
          <div className="text-2xl font-bold text-danger mt-1">
            {isLoading ? '...' : activityData?.denied_count || 0}
          </div>
          <div className="text-[11px] text-danger mt-0.5">Odrzucone skany na stronie</div>
        </div>
      </div>

      {/* Table & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-ink">Rejestr Skanów i Dostępów</h3>
            <span className="text-[11px] text-muted">
              Strona {currentPage + 1} · maks. {pageSize} rekordów
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => dispatch(setPageSize(Number(e.target.value) as 10 | 20 | 50))}
              className="rounded-control border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
              aria-label="Rekordów na stronę"
            >
              <option value={10}>10 / stronę</option>
              <option value={20}>20 / stronę</option>
              <option value={50}>50 / stronę</option>
            </select>
            <input
              type="text"
              placeholder="Filtruj logi według Użytkownika, Skanera..."
              value={searchFilter}
              onChange={(e) => dispatch(setSearchFilter(e.target.value))}
              className="rounded-control border border-line bg-paper px-3 py-1.5 text-xs text-ink focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary w-full sm:w-72"
            />
          </div>
        </div>

        <div className="border border-line/60 rounded-card overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-line/20 text-ink/80 uppercase tracking-wider font-semibold border-b border-line/60 sticky top-0">
              <tr>
                <th className="px-3.5 py-2.5">Czas Zdarzenia</th>
                <th className="px-3.5 py-2.5">ID Użytkownika</th>
                <th className="px-3.5 py-2.5">ID Skanera</th>
                <th className="px-3.5 py-2.5">Dostawca QR</th>
                <th className="px-3.5 py-2.5 text-right">Wynik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 bg-paper">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40 font-medium">
                    Ładowanie rejestru zdarzeń...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40 italic">
                    Brak logów skanera spełniających podane kryteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={item.entry_id || idx} className="hover:bg-line/10 transition">
                    <td className="px-3.5 py-2.5 font-mono text-ink/70 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-ink">{item.user_id}</td>
                    <td className="px-3.5 py-2.5 font-mono text-ink/70">{item.scanner_id || item.device_id || '-'}</td>
                    <td className="px-3.5 py-2.5 text-ink/70">{item.qr_provider_id || 'basic-subscription'}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                          item.result === 'success' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                        }`}
                      >
                        {item.result === 'success' ? 'SUKCES' : 'ODMOWA'}
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
            onClick={() => dispatch(fetchActivityThunk({ direction: 'prev' }))}
            disabled={currentPage === 0 || isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-semibold text-ink/80 bg-paper border border-line hover:bg-line/10 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            ← Poprzednia
          </button>
          <span className="text-xs text-muted">
            {activityData?.items?.length || 0} wczytanych rekordów ·{' '}
            {activityData?.has_more ? 'dostępne kolejne' : 'koniec rejestru'}
          </span>
          <button
            type="button"
            onClick={() => dispatch(fetchActivityThunk({ direction: 'next' }))}
            disabled={!activityData?.has_more || isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-semibold text-secondary bg-secondary/10 border border-secondary/30 hover:bg-secondary/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            Następna →
          </button>
        </div>
      </div>
    </div>
  );
}
