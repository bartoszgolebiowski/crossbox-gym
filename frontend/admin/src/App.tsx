import { useEffect, useRef } from 'react';
import { AuthCard } from './components/AuthCard';
import { Footer } from './components/Footer';
import { HardwareActivityCard } from './components/HardwareActivityCard';
import { Header } from './components/Header';
import { HmacRotationCard } from './components/HmacRotationCard';
import { LocationManagerCard } from './components/LocationManagerCard';
import { LockerActivityCard } from './components/LockerActivityCard';
import { MemberOverrideCard } from './components/MemberOverrideCard';
import { RemoteOpsCard } from './components/RemoteOpsCard';
import { useAdminDispatch, useAdminSelector } from './store';
import { adminLogout, selectAdminEmail, selectAdminToken } from './store/authSlice';
import { retryAdminConfigThunk, selectAdminConfig } from './store/configSlice';
import { selectActiveTab, setActiveTab } from './store/uiSlice';

const VALID_TABS = ['management', 'activity', 'lockerActivity'] as const;
type ValidTab = (typeof VALID_TABS)[number];

function isValidTab(value: string | null): value is ValidTab {
  return VALID_TABS.includes(value as ValidTab);
}

function readTabFromUrl(): ValidTab {
  if (typeof window === 'undefined') return 'management';
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  return isValidTab(tab) ? tab : 'management';
}

function writeTabToUrl(tab: ValidTab) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (tab === 'management') {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', tab);
  }
  window.history.replaceState({}, '', url.toString());
}

export default function App() {
  const dispatch = useAdminDispatch();
  const config = useAdminSelector(selectAdminConfig);
  const token = useAdminSelector(selectAdminToken);
  const email = useAdminSelector(selectAdminEmail);
  const activeTab = useAdminSelector(selectActiveTab);

  // Initialise tab from URL on first load
  const initialisedFromUrl = useRef(false);
  useEffect(() => {
    if (initialisedFromUrl.current) return;
    initialisedFromUrl.current = true;
    const tabFromUrl = readTabFromUrl();
    if (tabFromUrl !== activeTab) {
      dispatch(setActiveTab(tabFromUrl));
    }
  }, [activeTab, dispatch]);

  // Keep URL in sync with active tab
  useEffect(() => {
    writeTabToUrl(activeTab);
  }, [activeTab]);

  const handleLogout = () => {
    dispatch(adminLogout());
  };

  if (config.error) {
    return (
      <div className="min-h-screen bg-canvas px-4 flex items-center justify-center text-ink">
        <section className="max-w-md w-full rounded-card border border-danger/30 bg-paper p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Brak połączenia</p>
          <h1 className="mt-2 text-2xl font-bold">Konsola administratora nie jest skonfigurowana.</h1>
          <p className="mt-3 text-sm leading-6 text-ink/70">{config.error}</p>
          <button
            type="button"
            onClick={() => dispatch(retryAdminConfigThunk())}
            disabled={config.isLoading}
            className="mt-6 rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {config.isLoading ? 'Łączenie...' : 'Ponów próbę'}
          </button>
        </section>
      </div>
    );
  }

  if (!config.isLoaded) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-ink/70 gap-3">
        <div className="w-12 h-12 rounded-control bg-primary flex items-center justify-center font-bold text-white text-xl animate-pulse">
          CB
        </div>
        <span className="text-sm font-medium">Ładowanie Konsoli Administratora...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between selection:bg-primary selection:text-white">
      <Header token={token} email={email} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 border-b border-line pb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Zarządzanie Obiektami CrossGym 24/7
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-ink">
              Panel Administratora
            </h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink/70 sm:text-right">
            Zarządzanie obiektami, kontrola dostępów, zdalne otwieranie bramki oraz audyt skanera i szafek.
          </p>
        </div>

        {!token ? (
          <div className="py-4">
            <AuthCard />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Navigation Tabs */}
            <div className="flex border-b border-line gap-4">
              <button
                type="button"
                onClick={() => dispatch(setActiveTab('management'))}
                className={`pb-3 px-1 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'management'
                    ? 'border-secondary text-secondary'
                    : 'border-transparent text-ink/70 hover:text-ink'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 v5m-4 0h4"
                  />
                </svg>
                Zarządzanie Obiektami i Dostępami
              </button>

              <button
                type="button"
                onClick={() => dispatch(setActiveTab('activity'))}
                className={`pb-3 px-1 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'activity'
                    ? 'border-secondary text-secondary'
                    : 'border-transparent text-ink/70 hover:text-ink'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Audyt Skanera i Wejść
              </button>

              <button
                type="button"
                onClick={() => dispatch(setActiveTab('lockerActivity'))}
                className={`pb-3 px-1 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'lockerActivity'
                    ? 'border-info text-info'
                    : 'border-transparent text-ink/70 hover:text-ink'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Audyt Szafek i Zamków
              </button>
            </div>

            {/* Tab Views */}
            {activeTab === 'management' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2">
                  <LocationManagerCard />
                </div>
                <div className="lg:col-span-1 space-y-6">
                  <RemoteOpsCard />
                  <HmacRotationCard />
                  <MemberOverrideCard />
                </div>
              </div>
            ) : activeTab === 'lockerActivity' ? (
              <LockerActivityCard />
            ) : (
              <HardwareActivityCard />
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
