import { AuthCard } from './components/AuthCard';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LocationManagerCard } from './components/LocationManagerCard';
import { MemberOverrideCard } from './components/MemberOverrideCard';
import { RemoteOpsCard } from './components/RemoteOpsCard';
import { useAdminDispatch, useAdminSelector } from './store';
import { adminLogout, selectAdminEmail, selectAdminToken } from './store/authSlice';
import { retryAdminConfigThunk, selectAdminConfig } from './store/configSlice';

export default function App() {
  const dispatch = useAdminDispatch();
  const config = useAdminSelector(selectAdminConfig);
  const token = useAdminSelector(selectAdminToken);
  const email = useAdminSelector(selectAdminEmail);

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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 border-b border-slate-300 pb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">CrossBox operations</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-slate-900">Administration console</h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-600 sm:text-right">Locations, physical access controls, and member status changes.</p>
        </div>

        {!token ? (
          <div className="py-4">
            <AuthCard />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-300 bg-slate-300">
              <div className="bg-white p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Facility Locations</div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">Multi-Location Engine</div>
                </div>
              </div>

              <div className="bg-white p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">IoT Hardware Relay</div>
                  <div className="text-sm font-semibold text-amber-700 mt-0.5">Online & Connected</div>
                </div>
              </div>

              <div className="bg-white p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Security Enforcer</div>
                  <div className="text-sm font-semibold text-emerald-700 mt-0.5">Active Monitoring</div>
                </div>
              </div>
            </div>

            {/* Admin Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
              <LocationManagerCard />
              <RemoteOpsCard />
              <MemberOverrideCard />
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
