import { AuthCard } from './components/AuthCard';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { InvoicesCard } from './components/InvoicesCard';
import { ProfileCard } from './components/ProfileCard';
import { QrPassCard } from './components/QrPassCard';
import { useAppDispatch, useAppSelector } from './store';
import { logout, selectAuthEmail, selectAuthToken } from './store/authSlice';
import { retryConfigThunk, selectConfig } from './store/configSlice';
import { clearMemberData, isMembershipActive, selectDashboard } from './store/memberSlice';

export default function App() {
  const dispatch = useAppDispatch();
  const config = useAppSelector(selectConfig);
  const token = useAppSelector(selectAuthToken);
  const email = useAppSelector(selectAuthEmail);
  const dashboard = useAppSelector(selectDashboard);
  const membershipActive = isMembershipActive(dashboard);
  const membershipStatus = membershipActive ? 'Active' : dashboard ? 'Inactive' : 'Checking membership';

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearMemberData());
  };

  if (config.error) {
    return (
      <div className="min-h-screen bg-[#f5f1e8] px-4 flex items-center justify-center text-stone-900">
        <section className="max-w-md w-full rounded-lg border border-rose-200 bg-[#fffdf8] p-6 shadow-xl shadow-stone-900/5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Connection unavailable</p>
          <h1 className="mt-2 text-2xl font-bold">The member portal is not configured.</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{config.error}</p>
          <button
            type="button"
            onClick={() => dispatch(retryConfigThunk())}
            disabled={config.isLoading}
            className="mt-6 rounded-md bg-rose-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {config.isLoading ? 'Retrying...' : 'Retry connection'}
          </button>
        </section>
      </div>
    );
  }

  if (!config.isLoaded) {
    return (
      <div className="min-h-screen bg-[#f5f1e8] flex flex-col items-center justify-center text-stone-600 gap-3">
        <div className="w-12 h-12 rounded-lg bg-rose-800 flex items-center justify-center font-bold text-white text-xl animate-pulse">
          CB
        </div>
        <span className="text-sm font-medium">Loading Member Portal...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-stone-900 flex flex-col justify-between selection:bg-rose-800 selection:text-white">
      <Header token={token} email={email} onLogout={handleLogout} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-10 border-b border-stone-300 pb-7 sm:flex sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-800">CrossBox membership</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
              Your access, kept simple.
            </h1>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-stone-600 sm:text-right">
            A live turnstile pass, membership controls, and billing records in one place.
          </p>
        </div>

        {!token ? (
          <div className="py-4">
            <AuthCard />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-lg border border-stone-300 bg-stone-300">
              <div className="bg-[#fffdf8] p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-rose-50 text-rose-800 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-stone-500 font-medium">Turnstile pass</div>
                  <div className={`text-sm font-semibold mt-0.5 ${membershipActive ? 'text-emerald-700' : 'text-stone-700'}`}>
                    {membershipActive ? 'Active & ready' : 'Membership required'}
                  </div>
                </div>
              </div>

              <div className="bg-[#fffdf8] p-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${membershipActive ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-stone-500 font-medium">Membership status</div>
                  <div className={`text-sm font-semibold mt-0.5 ${membershipActive ? 'text-emerald-700' : 'text-stone-700'}`}>
                    {membershipStatus}
                  </div>
                </div>
              </div>

              <div className="bg-[#fffdf8] p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-stone-500 font-medium">Gym locations</div>
                  <div className="text-sm font-semibold text-stone-900 mt-0.5">
                    {dashboard?.locations?.length || 1} Accessible Facility
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <QrPassCard />
              <ProfileCard email={email} />
            </div>

            {/* Invoices */}
            <InvoicesCard />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
