import { AuthCard } from './components/AuthCard';
import { Footer } from './components/Footer';
import { HardwareActivityCard } from './components/HardwareActivityCard';
import { Header } from './components/Header';
import { HmacRotationCard } from './components/HmacRotationCard';
import { LocationManagerCard } from './components/LocationManagerCard';
import { MemberOverrideCard } from './components/MemberOverrideCard';
import { RemoteOpsCard } from './components/RemoteOpsCard';
import { useAdminDispatch, useAdminSelector } from './store';
import { adminLogout, selectAdminEmail, selectAdminToken } from './store/authSlice';
import { retryAdminConfigThunk, selectAdminConfig } from './store/configSlice';
import { selectActiveTab, setActiveTab } from './store/uiSlice';

export default function App() {
  const dispatch = useAdminDispatch();
  const config = useAdminSelector(selectAdminConfig);
  const token = useAdminSelector(selectAdminToken);
  const email = useAdminSelector(selectAdminEmail);
  const activeTab = useAdminSelector(selectActiveTab);

  const handleLogout = () => {
    dispatch(adminLogout());
  };

  if (config.error) {
    return (
      <div className="min-h-screen bg-[#eef3f7] px-4 flex items-center justify-center text-slate-900">
        <section className="max-w-md w-full rounded-lg border border-rose-200 bg-white p-6 shadow-xl shadow-slate-900/5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Connection unavailable</p>
          <h1 className="mt-2 text-2xl font-bold">The administrator console is not configured.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{config.error}</p>
          <button
            type="button"
            onClick={() => dispatch(retryAdminConfigThunk())}
            disabled={config.isLoading}
            className="mt-6 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {config.isLoading ? 'Retrying...' : 'Retry connection'}
          </button>
        </section>
      </div>
    );
  }

  if (!config.isLoaded) {
    return (
      <div className="min-h-screen bg-[#eef3f7] flex flex-col items-center justify-center text-slate-600 gap-3">
        <div className="w-12 h-12 rounded-md bg-teal-700 flex items-center justify-center font-bold text-white text-xl animate-pulse">
          CB
        </div>
        <span className="text-sm font-medium">Loading Administrator Console...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef3f7] text-slate-900 flex flex-col justify-between selection:bg-teal-700 selection:text-white">
      <Header token={token} email={email} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 border-b border-slate-300 pb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">CrossBox operations</p>
            <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-slate-900">
              Administration console
            </h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-600 sm:text-right">
            Locations, physical access controls, scanner & lock activity auditing.
          </p>
        </div>

        {!token ? (
          <div className="py-4">
            <AuthCard />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-300 gap-4">
              <button
                type="button"
                onClick={() => dispatch(setActiveTab('management'))}
                className={`pb-3 px-1 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'management'
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                Location & Access Controls
              </button>

              <button
                type="button"
                onClick={() => dispatch(setActiveTab('activity'))}
                className={`pb-3 px-1 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'activity'
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
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
                Scanner & Lock Activity Audit
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
