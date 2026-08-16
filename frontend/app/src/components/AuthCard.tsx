import React, { useEffect, useReducer, useState } from 'react';
import {
  authFormReducer,
  AuthMode,
  changeAuthFormField,
  initialAuthFormState,
  setAuthFormError,
  setAuthMode,
} from '../reducers/authFormReducer';
import { useAppDispatch, useAppSelector } from '../store';
import {
  clearAuthMessages,
  confirmForgotPasswordThunk,
  forgotPasswordThunk,
  loginThunk,
  registerThunk,
  selectAuth,
  setPasswordWithTokenThunk,
  verifyMagicLinkThunk,
} from '../store/authSlice';
import { fetchDashboardThunk, fetchInvoicesThunk } from '../store/memberSlice';

const fieldLabelClass = 'mb-2 block text-sm font-medium text-ink/70';
const fieldClass =
  'w-full rounded-control border border-line bg-paper px-3.5 py-3 text-sm text-ink shadow-control placeholder:text-ink/40 transition focus:border-primary-hover focus:outline-none focus:ring-4 focus:ring-primary/10';
const submitButtonClass =
  'mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-control bg-primary px-4 py-3 text-sm font-semibold text-white shadow-control transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';

export const AuthCard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { loading, error, successMessage } = useAppSelector(selectAuth);

  const [formState, dispatchForm] = useReducer(authFormReducer, initialAuthFormState);
  const { authMode, inputEmail, inputPassword, inputCode, newPassword, confirmPassword, error: formError } = formState;
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (token && email) {
      setInviteToken(token);
      dispatchForm(changeAuthFormField('inputEmail', email));
      dispatchForm(setAuthMode('invitation'));
      dispatch(verifyMagicLinkThunk({ token, email }));
    }
  }, [dispatch]);

  const switchTab = (mode: AuthMode) => {
    dispatch(clearAuthMessages());
    dispatchForm(setAuthMode(mode));
  };

  const handleFieldChange = (
    field: 'inputEmail' | 'inputPassword' | 'inputCode' | 'newPassword' | 'confirmPassword',
    value: string
  ) => {
    dispatchForm(changeAuthFormField(field, value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(loginThunk({ email: inputEmail, password: inputPassword }));
    if (loginThunk.fulfilled.match(result)) {
      dispatch(fetchDashboardThunk());
      dispatch(fetchInvoicesThunk());
    }
  };

  const [statuteAccepted, setStatuteAccepted] = useState(false);
  const [showStatuteDoc, setShowStatuteDoc] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statuteAccepted) {
      dispatchForm(setAuthFormError('Musisz zaakceptować Regulamin Klubu, aby aktywować konto.'));
      return;
    }
    if (inputPassword !== confirmPassword) {
      dispatchForm(setAuthFormError('Passwords do not match.'));
      return;
    }
    const result = await dispatch(registerThunk({ email: inputEmail, password: inputPassword }));
    if (registerThunk.fulfilled.match(result)) {
      dispatch(fetchDashboardThunk());
      dispatch(fetchInvoicesThunk());
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(forgotPasswordThunk({ email: inputEmail }));
    if (forgotPasswordThunk.fulfilled.match(result)) {
      dispatchForm(setAuthMode('reset'));
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      dispatchForm(setAuthFormError('Passwords do not match.'));
      return;
    }
    dispatch(confirmForgotPasswordThunk({ email: inputEmail, code: inputCode, newPassword }));
  };

  const handleSetPasswordWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statuteAccepted) {
      dispatchForm(setAuthFormError('Musisz zaakceptować Regulamin Klubu, aby aktywować konto.'));
      return;
    }
    if (newPassword !== confirmPassword) {
      dispatchForm(setAuthFormError('Passwords do not match.'));
      return;
    }
    if (!inviteToken) {
      dispatchForm(setAuthFormError('Invitation token is missing or expired.'));
      return;
    }
    const result = await dispatch(setPasswordWithTokenThunk({ email: inputEmail, token: inviteToken, newPassword }));
    if (setPasswordWithTokenThunk.fulfilled.match(result)) {
      dispatch(fetchDashboardThunk());
      dispatch(fetchInvoicesThunk());
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-card border border-line bg-paper p-6 shadow-card sm:p-8">
        {/* Card Header Title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-control bg-primary/10 text-primary border border-primary/30 mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            {authMode === 'login' && 'Witaj ponownie'}
            {authMode === 'register' && 'Rejestracja Klubowicza'}
            {authMode === 'forgot' && 'Resetowanie Hasła'}
            {authMode === 'reset' && 'Wprowadź Kod Weryfikacyjny'}
            {authMode === 'invitation' && 'Witaj w CrossGym! Ustaw swoje hasło'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {authMode === 'login' && 'Zaloguj się, aby uzyskać swój kod QR do bramki'}
            {authMode === 'register' && 'Załóż konto, aby zarządzać swoim karnetem CrossGym'}
            {authMode === 'forgot' && 'Wyślemy kod weryfikacyjny na Twój adres e-mail'}
            {authMode === 'reset' && 'Ustaw nowe, bezpieczne hasło do swojego konta'}
            {authMode === 'invitation' && 'Dokończ aktywację konta po zakupie karnetu — ustaw bezpieczne hasło.'}
          </p>
        </div>

        {/* Tab Navigation */}
        {authMode !== 'invitation' && (
          <div className="mb-8 grid grid-cols-3 gap-1 rounded-control border border-line/60 bg-line/10 p-1">
            <button
              type="button"
              className={`py-1.5 text-xs font-medium rounded-control transition-colors cursor-pointer ${
                authMode === 'login'
                  ? 'bg-primary text-white font-semibold shadow-control'
                  : 'text-muted hover:text-ink'
              }`}
              onClick={() => switchTab('login')}
            >
              Zaloguj się
            </button>
            <button
              type="button"
              className={`py-1.5 text-xs font-medium rounded-control transition-colors cursor-pointer ${
                authMode === 'register'
                  ? 'bg-primary text-white font-semibold shadow-control'
                  : 'text-muted hover:text-ink'
              }`}
              onClick={() => switchTab('register')}
            >
              Rejestracja
            </button>
            <button
              type="button"
              className={`py-1.5 text-xs font-medium rounded-control transition-colors cursor-pointer ${
                authMode === 'forgot' || authMode === 'reset'
                  ? 'bg-primary text-white font-semibold shadow-control'
                  : 'text-muted hover:text-ink'
              }`}
              onClick={() => switchTab('forgot')}
            >
              Resetuj hasło
            </button>
          </div>
        )}

        {/* Error / Success Notifications */}
        {(error || formError) && (
          <div className="mb-5 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm leading-relaxed text-danger">
            {formError || error}
          </div>
        )}
        {successMessage && (
          <div className="mb-5 rounded-control border border-success/30 bg-success/10 p-3 text-sm leading-relaxed text-success">
            {successMessage}
          </div>
        )}

        {/* Forms */}
        {authMode === 'invitation' && (
          <form onSubmit={handleSetPasswordWithToken} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="invite-email">
                Adres E-mail Konta
              </label>
              <input
                id="invite-email"
                type="email"
                className={`${fieldClass} bg-line/20 text-muted cursor-not-allowed`}
                value={inputEmail}
                disabled
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="invite-password">
                Nowe Hasło
              </label>
              <input
                id="invite-password"
                type="password"
                className={fieldClass}
                placeholder="Minimum 8 znaków"
                value={newPassword}
                onChange={(e) => handleFieldChange('newPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="invite-confirm-password">
                Powtórz Nowe Hasło
              </label>
              <input
                id="invite-confirm-password"
                type="password"
                className={fieldClass}
                placeholder="Wpisz ponownie nowe hasło"
                value={confirmPassword}
                onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {/* Mandatory Statute Acceptance Checkbox */}
            <div className="space-y-2 pt-1 text-left">
              <label className="flex items-start gap-3 p-3 rounded-control border border-line bg-paper shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={statuteAccepted}
                  onChange={(e) => setStatuteAccepted(e.target.checked)}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary accent-primary mt-0.5 cursor-pointer"
                  required
                />
                <span className="text-xs text-ink/80 leading-relaxed font-normal">
                  Oświadczam, że zapoznałem/am się z{' '}
                  <button
                    type="button"
                    onClick={() => setShowStatuteDoc(true)}
                    className="text-primary font-semibold underline hover:text-primary-hover transition-colors"
                  >
                    Regulaminem Klubu CrossGym
                  </button>{' '}
                  oraz Polityką Prywatności i w pełni akceptuję ich postanowienia.{' '}
                  <strong className="text-danger">*</strong>
                </span>
              </label>
            </div>

            <button type="submit" disabled={loading || !statuteAccepted} className={submitButtonClass}>
              {loading ? 'Ustawianie hasła...' : 'Akceptuję Regulamin i Aktywuję Konto'}
            </button>
          </form>
        )}
        {authMode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="login-email">
                Adres E-mail
              </label>
              <input
                id="login-email"
                type="email"
                className={fieldClass}
                placeholder="jan.kowalski@example.com"
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="login-password">
                Hasło
              </label>
              <input
                id="login-password"
                type="password"
                className={fieldClass}
                placeholder="••••••••"
                value={inputPassword}
                onChange={(e) => handleFieldChange('inputPassword', e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" disabled={loading} className={submitButtonClass}>
              {loading ? 'Logowanie...' : 'Zaloguj się do Portalu'}
            </button>
          </form>
        )}

        {authMode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="register-email">
                Adres E-mail
              </label>
              <input
                id="register-email"
                type="email"
                className={fieldClass}
                placeholder="jan.kowalski@example.com"
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="register-password">
                Hasło
              </label>
              <input
                id="register-password"
                type="password"
                className={fieldClass}
                placeholder="Minimum 8 znaków"
                value={inputPassword}
                onChange={(e) => handleFieldChange('inputPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="register-confirm-password">
                Powtórz Hasło
              </label>
              <input
                id="register-confirm-password"
                type="password"
                className={fieldClass}
                placeholder="Powtórz swoje hasło"
                value={confirmPassword}
                onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {/* Mandatory Statute Acceptance Checkbox */}
            <div className="space-y-2 pt-1 text-left">
              <label className="flex items-start gap-3 p-3 rounded-control border border-line bg-paper shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={statuteAccepted}
                  onChange={(e) => setStatuteAccepted(e.target.checked)}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary accent-primary mt-0.5 cursor-pointer"
                  required
                />
                <span className="text-xs text-ink/80 leading-relaxed font-normal">
                  Oświadczam, że zapoznałem/am się z{' '}
                  <button
                    type="button"
                    onClick={() => setShowStatuteDoc(true)}
                    className="text-primary font-semibold underline hover:text-primary-hover transition-colors"
                  >
                    Regulaminem Klubu CrossGym
                  </button>{' '}
                  oraz Polityką Prywatności i w pełni akceptuję ich postanowienia.{' '}
                  <strong className="text-danger">*</strong>
                </span>
              </label>
            </div>

            <button type="submit" disabled={loading || !statuteAccepted} className={submitButtonClass}>
              {loading ? 'Tworzenie konta...' : 'Utwórz Konto Klubowicza'}
            </button>
          </form>
        )}

        {authMode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="forgot-email">
                Adres E-mail Konta
              </label>
              <input
                id="forgot-email"
                type="email"
                className={fieldClass}
                placeholder="jan.kowalski@example.com"
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <button type="submit" disabled={loading} className={submitButtonClass}>
              {loading ? 'Wysyłanie kodu...' : 'Wyślij Kod Weryfikacyjny'}
            </button>
            <button
              type="button"
              className="w-full cursor-pointer text-center text-sm font-medium text-primary hover:text-primary-hover"
              onClick={() => switchTab('reset')}
            >
              Mam już kod weryfikacyjny
            </button>
          </form>
        )}

        {authMode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="reset-email">
                Adres E-mail
              </label>
              <input
                id="reset-email"
                type="email"
                className={fieldClass}
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="reset-code">
                Kod Weryfikacyjny
              </label>
              <input
                id="reset-code"
                type="text"
                className={`${fieldClass} font-mono`}
                placeholder="123456"
                value={inputCode}
                onChange={(e) => handleFieldChange('inputCode', e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="reset-password">
                Nowe Hasło
              </label>
              <input
                id="reset-password"
                type="password"
                className={fieldClass}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => handleFieldChange('newPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="reset-confirm-password">
                Powtórz Nowe Hasło
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                className={fieldClass}
                placeholder="Wpisz ponownie nowe hasło"
                value={confirmPassword}
                onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" disabled={loading} className={submitButtonClass}>
              {loading ? 'Zapisywanie nowego hasła...' : 'Ustaw Nowe Hasło'}
            </button>
          </form>
        )}
      </div>

      {/* Statute Legal Document Modal */}
      {showStatuteDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in text-left">
          <div className="bg-paper rounded-card max-w-2xl w-full max-h-[85vh] flex flex-col p-6 sm:p-8 shadow-card border border-line relative overflow-hidden">
            <button
              type="button"
              onClick={() => setShowStatuteDoc(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-control bg-line/10 hover:bg-line/20 text-ink flex items-center justify-center transition-colors cursor-pointer z-10"
              aria-label="Close statute document"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="pb-3 border-b border-line pr-8">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Dokument Prawny</span>
              <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-ink mt-0.5">
                Regulamin Klubu CrossGym 24/7
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto py-4 pr-2 text-xs text-ink/80 leading-relaxed font-normal">
              <div className="space-y-4">
                <div className="bg-primary/5 p-3.5 rounded-xl border border-primary/20 space-y-1 text-xs">
                  <p className="font-extrabold text-ink text-sm">
                    CROSSGYM KIELCE 24/7 REGULAMIN KLUBU ORAZ KLAUZULA INFORMACYJNA (UMOWA ONLINE)
                  </p>
                  <p className="text-secondary font-semibold">
                    Obowiązuje od momentu akceptacji elektronicznej | Obiekt Całodobowy 24/7
                  </p>
                  <p className="text-ink/80">
                    <strong>Podmiot prowadzący Klub:</strong> Adam Burek prowadzący działalność gospodarczą, ul. Biskupa
                    Czesława Kaczmarka 16, 25-022 Kielce, NIP: 7991938916, REGON: 142857130 (zwany dalej „Operatorem
                    Klubu”).
                  </p>
                  <p className="text-ink/80">
                    <strong>Adres obiektu Klubu:</strong> CrossGym Kielce 24/7, ul. Jana Nowaka Jeziorańskiego 73a,
                    25-432 Kielce.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    I. ZAWARCIE UMOWY ONLINE I POSTANOWIENIA OGÓLNE
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      Umowa o korzystanie z usług Klubu CrossGym Kielce 24/7 zawarta zostaje pomiędzy osobą korzystającą
                      z usług Klubu (zwaną dalej „Członkiem Klubu”) a Operatorem Klubu drogą elektroniczną (online).
                    </li>
                    <li>
                      Potwierdzeniem zawarcia Umowy jest akceptacja Regulaminu w procesie rejestracji online (poprzez
                      stronę internetową lub aplikację Klubu) oraz uiszczenie opłaty za wybrany karnet. Strony nie
                      składają fizycznego podpisu papierowego.
                    </li>
                    <li>
                      Członkiem Klubu może zostać osoba pełnoletnia (posiadająca pełną zdolność do czynności prawnych).
                      Za pisemną lub elektroniczną zgodą opiekuna prawnego Członkiem Klubu może zostać osoba od 16. roku
                      życia.
                    </li>
                    <li>
                      Udostępnianie profilu, aplikacji dostępowej, opaski lub karty osobom trzecim jest bezwzględnie
                      zabronione i skutkuje natychmiastowym zablokowaniem dostępu do Klubu.
                    </li>
                    <li>
                      Członek Klubu ma prawo do korzystania z obiektu w trybie całodobowym (24/7) na zasadach
                      wynikających z zakupionego wariantu karnetu.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    II. CZAS TRWANIA UMOWY I PŁATNOŚCI ODNAWIALNE
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      Umowa zostaje zawarta na czas nieokreślony i ulega automatycznemu przedłużeniu na kolejne
                      miesięczne okresy rozliczeniowe.
                    </li>
                    <li>
                      Wysokość opłat za poszczególne rodzaje karnetów określa Cennik w systemie rejestracji online.
                      Płatność za każdy kolejny miesiąc pobierana jest automatycznie z karty płatniczej przypisanej do
                      konta Członka Klubu.
                    </li>
                    <li>
                      Cena karnetu nie uwzględnia ubezpieczenia od następstw nieszczęśliwych wypadków (NNW). Członek
                      Klubu trenuje we własnym zakresie i na własną odpowiedzialność.
                    </li>
                    <li>
                      W przypadku braku możliwości pobrania opłaty za kolejny okres rozliczeniowy, dostęp do obiektu
                      ulega automatycznemu zawieszeniu do momentu uregulowania należności.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    III. ANULOWANIE SUBSKRYPCJI ONLINE
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      Członek Klubu może w dowolnym momencie zrezygnować z dalszego automatycznego odnawiania umowy,
                      wyłączając subskrypcję w panelu klienta w aplikacji lub serwisie internetowym (bądź kontaktując
                      się z Klubem drogą mailową).
                    </li>
                    <li>
                      Anulowanie subskrypcji wywołuje skutek na koniec bieżącego, opłaconego okresu rozliczeniowego. Do
                      tego dnia Członek Klubu zachowuje pełne prawo do korzystania z obiektu, a od kolejnego miesiąca
                      opłaty nie będą pobierane.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    IV. CAŁODOBOWY MONITORING I REJESTRACJA OBRAZU (MONITORING 24/7)
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      Cały teren obiektu CrossGym Kielce 24/7 jest objęty całodobowym systemem monitoringu wizyjnego
                      (24/7) z automatyczną rejestracją obrazu. Nagrywanie rozpoczyna się od momentu wejścia do obiektu.
                    </li>
                    <li>
                      Monitoring jest prowadzony w celu zapewnienia bezpieczeństwa osobom przebywającym w obiekcie,
                      ochrony mienia, weryfikacji uprawnień wstępu oraz kontroli przestrzegania regulaminu obiektu
                      działającego w trybie bezobsługowym 24/7.
                    </li>
                    <li>
                      Warunkiem koniecznym do zakupu karnetu online oraz wstępu do Klubu jest wyrażenie zgody na
                      rejestrację obrazu z udziałem Członka Klubu. Brak akceptacji klauzuli monitoringu uniemożliwia
                      zawarcie umowy oraz korzystanie z obiektu.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    V. KLAUZULA INFORMACYJNA RODO (OCHRONA DANYCH OSOBOWYCH)
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      <strong>Administrator Danych:</strong> Administratorem danych osobowych jest Adam Burek prowadzący
                      działalność gospodarczą, ul. Biskupa Czesława Kaczmarka 16, 25-022 Kielce, NIP: 7991938916, REGON:
                      142857130.
                    </li>
                    <li>
                      <strong>Podstawa prawna i cele przetwarzania:</strong>
                      <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5">
                        <li>Art. 6 ust. 1 lit. b RODO: zawarcie i realizacja umowy świadczonej drogą elektroniczną;</li>
                        <li>
                          Art. 6 ust. 1 lit. f RODO: prawnie uzasadniony interes Administratora (bezpieczeństwo osób i
                          mienia w obiekcie 24/7, ochrona przed roszczeniami).
                        </li>
                      </ul>
                    </li>
                    <li>
                      <strong>Okres przechowywania danych:</strong> Nagrania z monitoringu przechowywane są do 30 dni,
                      po czym są automatycznie nadpisywane. Dane konta przechowywane są przez okres trwania umowy oraz
                      do czasu przedawnienia roszczeń.
                    </li>
                    <li>
                      <strong>Prawa Członka Klubu:</strong> Osobie, której dane dotyczą, przysługuje prawo dostępu do
                      danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwu oraz prawo wniesienia
                      skargi do Prezesa UODO.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    VI. ZASADY KORZYSTANIA Z OBIEKTU I BEZPIECZEŃSTWO
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      Członek Klubu zobowiązany jest do korzystania z urządzeń i sprzętu zgodnie z ich przeznaczeniem
                      oraz odkładania sprzętu na miejsce po zakończeniu ćwiczeń. Ponosi odpowiedzialność materialną za
                      wyrządzone uszkodzenia mienia.
                    </li>
                    <li>
                      Obowiązuje bezwzględny nakaz noszenia czystego, zmiennego obuwia sportowego oraz używania ręcznika
                      treningowego. W strefie prysznicowej obowiązuje obuwie kąpielowe z podeszwą antypoślizgową.
                    </li>
                    <li>
                      Zabrania się przebywania w Klubie osobom pod wpływem alkoholu, środków odurzających lub leków
                      obniżających sprawność psychofizyczną.
                    </li>
                    <li>
                      Osoby ze schorzeniami układu krążenia, cukrzycą, nienormowanym ciśnieniem lub w ciąży powinny
                      przed przystąpieniem do ćwiczeń skonsultować się z lekarzem.
                    </li>
                    <li>
                      Szatnie wyposażone są w szafki zamykane przez Członka Klubu. Członek Klubu zobowiązany jest do
                      prawidłowego zamknięcia szafki na czas treningu oraz niepozostawiania w niej przedmiotów o
                      znacznej wartości, gotówki ani cennej dokumentacji. Klub nie ponosi odpowiedzialności za rzeczy
                      pozostawione poza zamkniętą szafką oraz za szkody powstałe w wyniku niezamknięcia szafki przez
                      Członka Klubu.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs sm:text-sm uppercase tracking-wider mb-1 text-primary">
                    VII. WIZERUNEK MARKETINGOWY I POSTANOWIENIA KOŃCOWE
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-ink/80 pl-1">
                    <li>
                      Klub ma prawo do utrwalania i używania wizerunku w celach promocyjnych/marketingowych wyłącznie za
                      uprzednią, odrębną zgodą Członka Klubu.
                    </li>
                    <li>
                      W przypadku rażącego naruszenia Regulaminu lub zasad współżycia społecznego Operator Klubu ma
                      prawo do natychmiastowego zablokowania konta i rozwiązania Umowy. W sprawach nieuregulowanych
                      niniejszym Regulaminem zastosowanie mają przepisy prawa polskiego, w tym Kodeksu Cywilnego.
                      Ewentualne spory rozstrzygane będą przez właściwe sądy powszechne.
                    </li>
                  </ol>
                </div>

                <div className="pt-2 border-t border-line/60 text-[11px] text-muted text-center font-medium">
                  Adam Burek • CrossGym Kielce 24/7 • ul. Jana Nowaka Jeziorańskiego 73a, 25-432 Kielce • NIP:
                  7991938916 • Akceptacja Online
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowStatuteDoc(false);
                  setStatuteAccepted(true);
                }}
                className="px-5 py-2 rounded-control bg-primary text-white font-semibold text-xs hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Akceptuję i Wracam do Aktywacji
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
