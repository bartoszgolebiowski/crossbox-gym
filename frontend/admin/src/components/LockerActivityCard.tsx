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
    <div className="bg-paper border border-line rounded-card p-6 shadow-card space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line/60">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <span className="p-2 rounded-card bg-info/10 border border-info/30 text-info">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </span>
            <span>Locker Door Activity Audit</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Rejestr zdarzeń otwarcia szafek depozytowych i ubraniowych w obiekcie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(fetchLockerActivityThunk({ direction: 'first' }))}
          className="flex items-center gap-1.5 text-xs font-semibold text-info bg-info/10 hover:bg-info/20 border border-info/30 px-3 py-1.5 rounded-control transition cursor-pointer"
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
            onChange={(e) => dispatch(setLockerSelectedLocationId(e.target.value))}
            className="w-full rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-info focus:outline-none focus:ring-1 focus:ring-info cursor-pointer"
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
            2. Wybór Szafki
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => dispatch(setLockerSelectedDeviceId(e.target.value))}
            className="w-full rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-info focus:outline-none focus:ring-1 focus:ring-info cursor-pointer"
          >
            <option value="all">Wszystkie szafki w obiekcie</option>
            {lockers.map((lk) => (
              <option key={lk.locker_id} value={lk.locker_id}>
                {lk.name} ({lk.locker_id})
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
                onClick={() => dispatch(setLockerTimeWindow(win))}
                className={`flex-1 py-1 text-xs font-semibold rounded transition cursor-pointer ${
                  timeWindow === win ? 'bg-info text-white shadow-xs' : 'text-ink/70 hover:text-ink'
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
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">Łącznie Otworzeń</div>
          <div className="text-2xl font-bold text-ink mt-1">{isLoading ? '...' : activityData?.total_count || 0}</div>
          <div className="text-[11px] text-muted mt-0.5">Wczytane rekordy na tej stronie</div>
        </div>
        <div className="bg-success/10 border border-success/30 p-4 rounded-card">
          <div className="text-xs font-semibold text-success uppercase tracking-wider">Przyznany Dostęp</div>
          <div className="text-2xl font-bold text-success mt-1">
            {isLoading ? '...' : activityData?.success_count || 0}
          </div>
          <div className="text-[11px] text-success mt-0.5">Pomyślne otwarcia szafki na stronie</div>
        </div>
        <div className="bg-danger/10 border border-danger/30 p-4 rounded-card">
          <div className="text-xs font-semibold text-danger uppercase tracking-wider">Odmowy Dostępu</div>
          <div className="text-2xl font-bold text-danger mt-1">
            {isLoading ? '...' : activityData?.denied_count || 0}
          </div>
          <div className="text-[11px] text-danger mt-0.5">Odrzucone próby dostępu na stronie</div>
        </div>
      </div>

      {/* Table & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-ink">Rejestr Otwarć Szafek</h3>
            <span className="text-[11px] text-muted">
              Strona {currentPage + 1} · maks. {pageSize} rekordów
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => dispatch(setLockerPageSize(Number(e.target.value) as 10 | 20 | 50))}
              className="rounded-control border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-info focus:outline-none focus:ring-1 focus:ring-info cursor-pointer"
              aria-label="Rekordów na stronę"
            >
              <option value={10}>10 / stronę</option>
              <option value={20}>20 / stronę</option>
              <option value={50}>50 / stronę</option>
            </select>
            <input
              type="text"
              placeholder="Filtruj logi według Użytkownika, Szafki..."
              value={searchFilter}
              onChange={(e) => dispatch(setLockerSearchFilter(e.target.value))}
              className="rounded-control border border-line bg-paper px-3 py-1.5 text-xs text-ink focus:border-info focus:outline-none focus:ring-1 focus:ring-info w-full sm:w-72"
            />
          </div>
        </div>

        <div className="border border-line/60 rounded-card overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-line/20 text-ink/80 uppercase tracking-wider font-semibold border-b border-line/60 sticky top-0">
              <tr>
                <th className="px-3.5 py-2.5">Czas Zdarzenia</th>
                <th className="px-3.5 py-2.5">ID Użytkownika</th>
                <th className="px-3.5 py-2.5">ID Szafki</th>
                <th className="px-3.5 py-2.5">ID Skanera</th>
                <th className="px-3.5 py-2.5 text-right">Wynik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 bg-paper">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40 font-medium">
                    Ładowanie rejestru szafek...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40 italic">
                    Brak logów otwarć szafek dla wybranych kryteriów.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={item.entry_id || idx} className="hover:bg-line/10 transition">
                    <td className="px-3.5 py-2.5 font-mono text-ink/70 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-ink">{item.user_id}</td>
                    <td className="px-3.5 py-2.5 font-mono text-ink/70">{item.locker_id || '-'}</td>
                    <td className="px-3.5 py-2.5 font-mono text-ink/70">{item.scanner_id || item.device_id || '-'}</td>
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
            onClick={() => dispatch(fetchLockerActivityThunk({ direction: 'prev' }))}
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
            onClick={() => dispatch(fetchLockerActivityThunk({ direction: 'next' }))}
            disabled={!activityData?.has_more || isLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-semibold text-info bg-info/10 border border-info/30 hover:bg-info/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            Następna →
          </button>
        </div>
      </div>
    </div>
  );
}
