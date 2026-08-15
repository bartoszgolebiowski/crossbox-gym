import React, { useState } from 'react';

interface StatuteCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCheckout: () => void;
  loading?: boolean;
  error?: string | null;
}

export const StatuteCheckoutModal: React.FC<StatuteCheckoutModalProps> = ({
  isOpen,
  onClose,
  onConfirmCheckout,
  loading = false,
  error = null,
}) => {
  const [isChecked, setIsChecked] = useState(false);
  const [showStatuteDoc, setShowStatuteDoc] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!isChecked) {
      setLocalError('Musisz zaakceptować Regulamin Klubu, aby kontynuować.');
      return;
    }
    setLocalError(null);
    onConfirmCheckout();
  };

  return (
    <>
      {/* Checkout Confirmation Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-paper rounded-card max-w-lg w-full p-6 sm:p-8 shadow-card border border-line relative overflow-hidden text-left">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-control bg-line/10 hover:bg-line/20 text-ink flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="space-y-1 pr-8">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-primary/10 text-primary text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              Order Summary & Statute
            </span>
            <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-ink">
              Aktywacja Karnetu Przedsprzedażowego
            </h3>
          </div>

          {/* Order Summary Box */}
          <div className="mt-4 rounded-control bg-line/10 p-4 border border-line/60 space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-ink">
              <span>Plan subskrypcji:</span>
              <span className="font-bold text-primary">CrossBox Gym 24/7 All-Access</span>
            </div>
            <div className="flex items-baseline justify-between text-xs sm:text-sm border-t border-line/40 pt-2">
              <span className="text-muted">Cena w przedsprzedaży:</span>
              <div>
                <span className="text-lg font-bold text-ink">139 zł</span>
                <span className="text-xs text-muted font-normal"> / miesiąc</span>
              </div>
            </div>
            <div className="text-[11px] text-success font-medium flex items-center gap-1 pt-1">
              <span>✓ Bezterminowa gwarancja stałej ceny 139 zł/mies.</span>
            </div>
          </div>

          {/* Statute Acceptance Checkbox */}
          <div className="mt-5 space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-control border border-line bg-paper shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  setIsChecked(e.target.checked);
                  if (e.target.checked) setLocalError(null);
                }}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary accent-primary mt-0.5 cursor-pointer"
              />
              <span className="text-xs text-ink/80 leading-relaxed font-normal">
                Oświadczam, że zapoznałem/am się z{' '}
                <button
                  type="button"
                  onClick={() => setShowStatuteDoc(true)}
                  className="text-primary font-semibold underline hover:text-primary-hover transition-colors"
                >
                  Regulaminem Klubu CrossBox Gym
                </button>{' '}
                oraz Polityką Prywatności i w pełni akceptuję ich postanowienia. <strong className="text-danger">*</strong>
              </span>
            </label>

            {(localError || error) && (
              <p className="text-xs font-medium text-danger px-1">
                {localError || error}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-1/3 py-2.5 px-4 rounded-control border border-line text-ink font-medium text-xs hover:bg-line/10 transition-colors text-center cursor-pointer"
            >
              Anuluj
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isChecked || loading}
              className="w-full sm:w-2/3 py-2.5 px-5 rounded-control bg-primary text-white font-semibold text-xs shadow-control transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-primary-hover"
            >
              <span>{loading ? 'Przekierowywanie do Stripe...' : 'Przejdź do Płatności Stripe'}</span>
              {!loading && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-center text-muted">
            🔒 Bezpieczna płatność kartą / BLIK obsługiwana przez Stripe.
          </p>
        </div>
      </div>

      {/* Statute Legal Document Modal */}
      {showStatuteDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-paper rounded-card max-w-2xl w-full max-h-[85vh] flex flex-col p-6 sm:p-8 shadow-card border border-line relative overflow-hidden text-left">
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
                Regulamin Klubu CrossBox Gym 24/7
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto py-4 pr-2 space-y-3 text-xs text-ink/80 leading-relaxed">
              <p>
                <strong>§ 1. Postanowienia Ogólne</strong><br />
                1. Niniejszy Regulamin określa zasady korzystania z całodobowych siłowni sieci CrossBox Gym oraz świadczenia usług drogą elektroniczną.<br />
                2. Operatorem i administratorem serwisu oraz sieci klubów jest CrossBox Gym Sp. z o.o.<br />
                3. Wejście na teren klubu odbywa się w trybie samoobsługowym za pomocą unikalnego kodu QR generowanego w aplikacji mobilnej.
              </p>

              <p>
                <strong>§ 2. Członkostwo i Subskrypcja Przedsprzedażowa</strong><br />
                1. W ramach przedsprzedaży Klubowicz uzyskuje stałą gwarancję stawki 139 zł/miesiąc na czas nieokreślony pod warunkiem zachowania ciągłości subskrypcji.<br />
                2. Rozliczenia są realizowane automatycznie w cyklu miesięcznym za pośrednictwem bezpiecznego operatora płatności Stripe Payments.<br />
                3. Rezygnacja z subskrypcji może nastąpić w dowolnym momencie ze skutkiem na koniec bieżącego okresu rozliczeniowego z poziomu panelu klubowicza.
              </p>

              <p>
                <strong>§ 3. Dostęp do Klubu 24/7 i Zasady Bezpieczeństwa</strong><br />
                1. Klub jest otwarty 24 godziny na dobę, 7 dni w tygodniu przez cały rok.<br />
                2. Dostęp do strefy treningowej przyznawany jest wyłącznie zidentyfikowanemu posiadaczowi aktywnego karnetu.<br />
                3. Zabrania się udostępniania kodu QR osobom trzecim. Obiekt jest całodobowo monitorowany systemem wizyjnym HD z automatyczną detekcją incydentów.
              </p>

              <p>
                <strong>§ 4. Ochrona Danych Osobowych (RODO)</strong><br />
                1. Dane osobowe Klubowiczów są przetwarzane zgodnie z rozporządzeniem RODO w celu realizacji umowy członkowskiej oraz zapewnienia bezpieczeństwa w obiekcie.<br />
                2. Każdemu Klubowiczowi przysługuje prawo dostępu do swoich danych, ich sprostowania, usunięcia oraz ograniczenia przetwarzania.
              </p>
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowStatuteDoc(false);
                  setIsChecked(true);
                  setLocalError(null);
                }}
                className="px-5 py-2 rounded-control bg-primary text-white font-semibold text-xs hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Akceptuję i Wracam do Zamówienia
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
