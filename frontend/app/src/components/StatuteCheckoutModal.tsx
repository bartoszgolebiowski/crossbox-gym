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
              <span className="font-bold text-primary">CrossGym 24/7 All-Access</span>
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
                  Regulaminem Klubu CrossGym
                </button>{' '}
                oraz Polityką Prywatności i w pełni akceptuję ich postanowienia.{' '}
                <strong className="text-danger">*</strong>
              </span>
            </label>

            {(localError || error) && <p className="text-xs font-medium text-danger px-1">{localError || error}</p>}
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
