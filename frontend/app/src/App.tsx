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
  const membershipStatus = membershipActive ? 'Aktywny' : dashboard ? 'Nieaktywny' : 'Sprawdzanie stanu członkostwa';

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearMemberData());
  };

  if (config.error) {
    return (
      <div className="min-h-screen bg-canvas px-4 flex items-center justify-center text-ink">
        <section className="max-w-md w-full rounded-card border border-primary/30 bg-paper p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-hover">Brak połączenia</p>
          <h1 className="mt-2 text-2xl font-bold">Portal klubowicza nie jest skonfigurowany.</h1>
          <p className="mt-3 text-sm leading-6 text-ink/70">{config.error}</p>
          <button
            type="button"
            onClick={() => dispatch(retryConfigThunk())}
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
        <div className="w-12 h-12 rounded-card bg-primary flex items-center justify-center font-bold text-white text-xl animate-pulse">
          CB
        </div>
        <span className="text-sm font-medium">Ładowanie Portalu Klubowicza...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between selection:bg-primary selection:text-white">
      <Header token={token} email={email} onLogout={handleLogout} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-10 border-b border-line pb-7 sm:flex sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Członkostwo CrossBox Gym 24/7</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
              Szybki dostęp do siłowni bez formalności.
            </h1>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-ink/70 sm:text-right">
            Twój unikalny kod QR, status subskrypcji oraz historia płatności w jednym miejscu.
          </p>
        </div>

        {!token ? (
          <div className="py-4">
            <AuthCard />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line">
              <div className="bg-paper p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-muted font-medium">Wejściowy kod QR</div>
                  <div className={`text-sm font-semibold mt-0.5 ${membershipActive ? 'text-success' : 'text-ink/70'}`}>
                    {membershipActive ? 'Aktywny i gotowy' : 'Wymagany aktywny karnet'}
                  </div>
                </div>
              </div>

              <div className="bg-paper p-5 flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-control flex items-center justify-center shrink-0 ${membershipActive ? 'bg-success/10 text-success' : 'bg-line/10 text-ink/70'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-muted font-medium">Status członkostwa</div>
                  <div className={`text-sm font-semibold mt-0.5 ${membershipActive ? 'text-success' : 'text-ink/70'}`}>
                    {membershipStatus}
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
