import type { RuntimeConfig } from '../../shared/runtimeConfig';

/**
 * GDPR / ePrivacy cookie consent for the hero landing page.
 *
 * Strict consent gating: the Google Analytics (gtag.js) script is NOT loaded,
 * and no cookies are set, until the visitor explicitly clicks "Akceptuję".
 * Rejecting stores only the refusal choice in localStorage — no tracking of
 * any kind happens before or after rejection.
 */

const CONSENT_STORAGE_KEY = 'cg-cookie-consent';

export type ConsentChoice = 'granted' | 'denied';

interface ConsentDom {
  document: Document;
  localStorage: Storage;
  window?: Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
}

function getConsentDom(override?: Partial<ConsentDom>): ConsentDom {
  return {
    document: override?.document ?? document,
    localStorage: override?.localStorage ?? localStorage,
    window:
      override?.window ??
      (typeof window !== 'undefined' ? (window as unknown as NonNullable<ConsentDom['window']>) : undefined),
  };
}

export function readStoredConsent(storage?: Storage): ConsentChoice | null {
  try {
    const value = storage?.getItem(CONSENT_STORAGE_KEY) ?? localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    // localStorage unavailable (e.g. blocked cookies) — treat as no choice.
    return null;
  }
}

function storeConsent(choice: ConsentChoice, dom: ConsentDom): void {
  dom.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
}

/** Injects the GA4 gtag.js snippet. Only ever called after explicit consent. */
export function loadGoogleAnalytics(measurementId: string, doc: Document = document, win?: ConsentDom['window']): void {
  if (doc.querySelector('script[data-ga-injected="true"]')) return;

  const gtagWindow = win ?? ({ dataLayer: [] } as unknown as NonNullable<ConsentDom['window']>);
  gtagWindow.dataLayer = gtagWindow.dataLayer || [];
  gtagWindow.gtag = function gtag(...args: unknown[]) {
    gtagWindow.dataLayer!.push(args);
  };
  gtagWindow.gtag('js', new Date());
  // No ad signals; analytics_storage granted by explicit user consent.
  gtagWindow.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });
  gtagWindow.gtag('config', measurementId, { anonymize_ip: true });

  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.gaInjected = 'true';
  doc.head.appendChild(script);
}

function createBannerElement(doc: Document, onAccept: () => void, onReject: () => void): HTMLElement {
  const banner = doc.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-label', 'Zgoda na pliki cookies');

  const openCookiePolicy = () => {
    const modal = doc.getElementById('statute-doc-modal');
    modal?.classList.remove('hidden');
  };

  banner.innerHTML = `
    <div class="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4">
      <div class="mx-auto max-w-3xl rounded-card border border-line bg-paper shadow-card">
        <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <p class="flex-1 text-sm leading-relaxed text-ink/90">
            Używamy plików cookies analitycznych (Google Analytics), aby mierzyć ruch i ulepszać naszą stronę.
            Dane są anonimizowane i nie służą do reklamowania się. Możesz zaakceptować lub odrzucić pliki cookies —
            strona działa poprawnie w obu przypadkach. Szczegóły znajdziesz w
            <button type="button" id="cookie-policy-link" class="font-semibold text-primary underline underline-offset-2 hover:opacity-80">polityce cookies</button>.
          </p>
          <div class="flex shrink-0 gap-2">
            <button type="button" id="cookie-reject" class="rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:bg-ink/5">
              Odrzuć
            </button>
            <button type="button" id="cookie-accept" class="rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
              Akceptuję
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  banner.querySelector('#cookie-accept')?.addEventListener('click', onAccept);
  banner.querySelector('#cookie-reject')?.addEventListener('click', onReject);
  banner.querySelector('#cookie-policy-link')?.addEventListener('click', openCookiePolicy);

  return banner;
}

/**
 * Opens or re-opens the cookie banner so visitors can change their consent preferences at any time.
 */
export function openCookieSettings(
  config: Pick<RuntimeConfig, 'GaMeasurementId'>,
  override?: Partial<ConsentDom>
): void {
  const dom = getConsentDom(override);
  const existingBanner = dom.document.getElementById('cookie-consent-banner');
  if (existingBanner) {
    existingBanner.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const removeBanner = () => banner.remove();
  const accept = () => {
    storeConsent('granted', dom);
    if (config.GaMeasurementId) {
      loadGoogleAnalytics(config.GaMeasurementId, dom.document, dom.window);
    }
    removeBanner();
  };
  const reject = () => {
    storeConsent('denied', dom);
    removeBanner();
  };

  const banner = createBannerElement(dom.document, accept, reject);
  dom.document.body.appendChild(banner);
}

/**
 * Entry point. Call once during app startup with the loaded runtime config.
 * - Binds footer cookie management trigger.
 * - No stored choice → shows the banner.
 * - 'granted' → loads GA immediately.
 * - 'denied' → does nothing until user opens settings.
 */
export function initCookieConsent(
  config: Pick<RuntimeConfig, 'GaMeasurementId'>,
  override?: Partial<ConsentDom>
): void {
  const dom = getConsentDom(override);

  const footerCookieBtn = dom.document.getElementById('open-cookie-settings-btn');
  footerCookieBtn?.addEventListener('click', () => openCookieSettings(config, override));

  const stored = readStoredConsent(dom.localStorage);

  if (stored === 'granted' && config.GaMeasurementId) {
    loadGoogleAnalytics(config.GaMeasurementId, dom.document, dom.window);
    return;
  }

  if (stored !== null) return; // previously denied

  if (!config.GaMeasurementId) return;

  openCookieSettings(config, override);
}
