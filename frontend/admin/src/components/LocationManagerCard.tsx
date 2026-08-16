import React, { useEffect, useReducer } from 'react';
import {
  changeLocationFormField,
  initialLocationFormState,
  locationFormReducer,
} from '../reducers/locationFormReducer';
import { useAdminDispatch, useAdminSelector } from '../store';
import { createLocationThunk, listLocationsThunk, selectLocationsList } from '../store/adminSlice';
import { IotDeviceHealthCard } from './IotDeviceHealthCard';

const fieldLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/70';
const fieldClass =
  'w-full rounded-control border border-line bg-paper px-3.5 py-3 text-sm text-ink shadow-control placeholder:text-ink/40 transition focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:bg-line/20 disabled:text-ink/40 disabled:cursor-not-allowed';

export const LocationManagerCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const locationsList = useAdminSelector(selectLocationsList);
  const [selectedLocId, setSelectedLocId] = React.useState<string>('');

  const [formState, dispatchForm] = useReducer(locationFormReducer, initialLocationFormState);
  const { locName, locAddress } = formState;

  // Auto-fetch locations list on mount
  useEffect(() => {
    dispatch(listLocationsThunk());
  }, [dispatch]);

  // Auto-select first location when locationsList updates and none is selected
  useEffect(() => {
    if (locationsList.length > 0 && !selectedLocId) {
      const firstId = locationsList[0].PK.replace(/^LOC#/, '');
      setSelectedLocId(firstId);
    }
  }, [locationsList, selectedLocId]);

  const handleFieldChange = (field: 'locName' | 'locAddress', value: string) => {
    dispatchForm(changeLocationFormField(field, value));
  };

  const handleCreateLocation = () => {
    dispatch(createLocationThunk({ name: locName, address: locAddress }));
  };

  const handleListLocations = () => {
    dispatch(listLocationsThunk());
  };

  const selectLocationRow = (locId: string) => {
    setSelectedLocId(locId);
  };

  const canCreateLocation = locName.trim().length > 0 && locAddress.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-paper border border-line rounded-card p-6 shadow-card space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-line/60">
          <div className="flex items-center gap-2.5 font-bold text-base text-ink">
            <span className="rounded-card border border-secondary/30 bg-secondary/10 p-2 text-secondary">
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
            <span>Zarządzanie Obiektami i Siłowniami</span>
          </div>
          <button
            type="button"
            onClick={handleListLocations}
            className="flex items-center gap-1 text-xs font-semibold text-secondary hover:text-secondary-hover bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 px-3 py-1.5 rounded-control transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Odśwież Bazę Obiektów</span>
          </button>
        </div>

        {/* --- 1. DISPLAY LOCATIONS TABLE --- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink flex items-center gap-2">
              <span>Zarejestrowane Siłownie CrossGym</span>
              <span className="px-2 py-0.5 text-xs font-semibold bg-line/20 text-ink/80 rounded-pill border border-line/60">
                {locationsList.length} Obiekt(y)
              </span>
            </span>
          </div>

          <div className="border border-line/60 rounded-card overflow-hidden shadow-xs max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-line/20 text-ink/80 uppercase tracking-wider font-semibold border-b border-line/60 sticky top-0">
                <tr>
                  <th className="px-3.5 py-2.5">Nazwa Obiektu</th>
                  <th className="px-3.5 py-2.5">ID Obiektu</th>
                  <th className="px-3.5 py-2.5">Adres</th>
                  <th className="px-3.5 py-2.5 text-right">Akcja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 bg-paper">
                {locationsList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-ink/40 italic">
                      Brak zdefiniowanych obiektów w bazie. Dodaj nowy obiekt poniżej.
                    </td>
                  </tr>
                ) : (
                  locationsList.map((loc) => {
                    const locId = loc.PK.replace(/^LOC#/, '');
                    const isSelected = selectedLocId === locId;
                    return (
                      <tr
                        key={locId}
                        className={`transition hover:bg-line/10 ${isSelected ? 'bg-secondary/10 font-medium' : ''}`}
                      >
                        <td className="px-3.5 py-2.5 font-semibold text-ink flex items-center gap-2">
                          <span>{loc.name || 'Obiekt bez nazwy'}</span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-white font-bold">
                              WYBRANY
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-ink/70">{locId}</td>
                        <td className="px-3.5 py-2.5 text-ink/70 truncate max-w-[180px]">
                          {loc.address || 'Brak danych'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => selectLocationRow(locId)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                              isSelected
                                ? 'bg-secondary text-white'
                                : 'bg-line/20 hover:bg-line/30 text-ink/80 border border-line'
                            }`}
                          >
                            {isSelected ? 'Wybrany' : 'Wybierz'}
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
        <div className="bg-line/10 p-4 rounded-card border border-line/60 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-ink/80">Dodaj Nowy Całodobowy Obiekt</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabelClass} htmlFor="facility-name">
                Nazwa Obiektu
              </label>
              <input
                id="facility-name"
                type="text"
                placeholder="np. CrossGym Warszawa Centrum 24/7"
                className={fieldClass}
                value={locName}
                onChange={(e) => handleFieldChange('locName', e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="facility-address">
                Adres Obiektu
              </label>
              <input
                id="facility-address"
                type="text"
                placeholder="np. ul. Marszałkowska 10, Warszawa"
                className={fieldClass}
                value={locAddress}
                onChange={(e) => handleFieldChange('locAddress', e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className={`w-full flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-sm font-semibold text-white shadow-control transition ${
              canCreateLocation
                ? 'bg-secondary hover:bg-secondary-hover cursor-pointer'
                : 'bg-line text-muted cursor-not-allowed opacity-60'
            }`}
            onClick={handleCreateLocation}
            disabled={!canCreateLocation}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Dodaj Obiekt Do Bazy</span>
          </button>
        </div>
      </div>

      {/* IoT Devices Live Connection & Health Checks Card */}
      <IotDeviceHealthCard locationId={selectedLocId} />
    </div>
  );
};
