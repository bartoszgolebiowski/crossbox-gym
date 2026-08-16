import { loadRuntimeConfig } from '../../shared/runtimeConfig';
import './index.css';

export interface StripeProductPrice {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  unitAmount: number;
  currency: string;
  interval: string | null;
  metadata: Record<string, string>;
}

function setError(errorEl: HTMLParagraphElement | null, message: string | null): void {
  if (!errorEl) return;
  errorEl.textContent = message ?? '';
  errorEl.classList.toggle('hidden', !message);
}

let availableProducts: StripeProductPrice[] = [];
let selectedPriceId: string | null = null;

function formatPrice(amountInCents: number, currency: string, interval: string | null): string {
  const formatted = (amountInCents / 100).toLocaleString('pl-PL', {
    style: 'currency',
    currency: currency ? currency.toUpperCase() : 'PLN',
    maximumFractionDigits: 0,
  });
  if (interval === 'month') return `${formatted} / mies.`;
  if (interval === 'year') return `${formatted} / rok`;
  return formatted;
}

function getCheaperProduct(): StripeProductPrice | null {
  if (availableProducts.length === 0) return null;
  const minUnitAmount = Math.min(...availableProducts.map((p) => p.unitAmount));
  return availableProducts.find((p) => p.unitAmount === minUnitAmount) || availableProducts[0];
}

async function loadStripeProducts(): Promise<void> {
  try {
    const config = await loadRuntimeConfig();
    const res = await fetch(`${config.ApiUrl}/checkout/products`);
    if (!res.ok) return;

    const products = (await res.json()) as StripeProductPrice[];
    if (Array.isArray(products) && products.length > 0) {
      availableProducts = products;
      const cheaperProduct = getCheaperProduct();
      if (cheaperProduct) {
        selectedPriceId = cheaperProduct.id;
        updateModalProductDetails(cheaperProduct);
      }
      renderPlanSelector();
    }
  } catch (err) {
    console.warn('Could not load products dynamically from Stripe API:', err);
  }
}

function updateModalProductDetails(product: StripeProductPrice): void {
  const nameEl = document.getElementById('modal-product-name');
  const priceEl = document.getElementById('modal-product-price');
  const intervalEl = document.getElementById('modal-product-interval');
  const descEl = document.getElementById('modal-product-description');
  const badgeEl = document.getElementById('modal-product-badge');

  if (nameEl) nameEl.textContent = product.name;
  if (priceEl) priceEl.textContent = `${(product.unitAmount / 100).toFixed(0)} ${product.currency.toUpperCase()}`;
  if (intervalEl)
    intervalEl.textContent = product.interval
      ? ` / ${product.interval === 'month' ? 'miesiąc' : product.interval}`
      : '';
  if (descEl) descEl.textContent = product.description || '';
  if (badgeEl)
    badgeEl.textContent = product.metadata?.badge
      ? `Gwarancja stawki: ${product.metadata.badge}`
      : 'Gwarancja stałej ceny na zawsze';
}

function renderPlanSelector(): void {
  const container = document.getElementById('modal-plan-selector-container');
  const optionsDiv = document.getElementById('modal-plan-options');
  if (!container || !optionsDiv) return;

  if (availableProducts.length <= 1) {
    container.classList.add('hidden');
    return;
  }

  const minUnitAmount = Math.min(...availableProducts.map((p) => p.unitAmount));
  const cheaperProduct = getCheaperProduct();
  if (cheaperProduct) {
    selectedPriceId = cheaperProduct.id;
  }

  container.classList.remove('hidden');
  optionsDiv.innerHTML = availableProducts
    .map((prod) => {
      const isMoreExpensive = prod.unitAmount > minUnitAmount;
      if (isMoreExpensive) {
        return `
    <label class="flex items-center justify-between p-2.5 rounded-xl border border-line/60 bg-paper/40 opacity-50 cursor-not-allowed select-none">
      <div class="flex items-center gap-2.5">
        <input type="radio" name="stripe-plan" value="${prod.id}" disabled class="accent-primary cursor-not-allowed" />
        <div class="text-left">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-ink/60 line-through">${prod.name}</span>
            <span class="text-[10px] font-bold text-danger bg-danger/10 px-1.5 py-0.5 rounded">Wyłączony</span>
          </div>
          ${prod.description ? `<span class="text-[10px] text-muted block line-through">${prod.description}</span>` : ''}
        </div>
      </div>
      <span class="text-xs font-black text-muted line-through">${formatPrice(prod.unitAmount, prod.currency, prod.interval)}</span>
    </label>
  `;
      }

      return `
    <label class="flex items-center justify-between p-2.5 rounded-xl border border-primary/40 bg-primary/5 cursor-pointer hover:border-primary transition-colors">
      <div class="flex items-center gap-2.5">
        <input type="radio" name="stripe-plan" value="${prod.id}" checked class="accent-primary" />
        <div class="text-left">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-ink">${prod.name}</span>
            <span class="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">Aktywny</span>
          </div>
          ${prod.description ? `<span class="text-[10px] text-muted block">${prod.description}</span>` : ''}
        </div>
      </div>
      <span class="text-xs font-black text-primary">${formatPrice(prod.unitAmount, prod.currency, prod.interval)}</span>
    </label>
  `;
    })
    .join('');

  optionsDiv.querySelectorAll<HTMLInputElement>('input[name="stripe-plan"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.disabled) return;
      const found = availableProducts.find((p) => p.id === radio.value);
      if (found && found.unitAmount <= minUnitAmount) {
        selectedPriceId = found.id;
        updateModalProductDetails(found);
      }
    });
  });
}

async function startCheckout(button: HTMLButtonElement, priceId?: string | null): Promise<void> {
  const errorEl = button.parentElement?.querySelector<HTMLParagraphElement>('.js-cta-error') ?? null;
  const originalLabel = button.dataset.ctaLabel ?? button.textContent ?? 'Dołącz w przedsprzedaży – 139 zł/mies';

  setError(errorEl, null);
  button.disabled = true;
  button.textContent = 'Przekierowywanie do Stripe...';

  try {
    const config = await loadRuntimeConfig();
    const memberAppUrl = (config.MemberAppUrl || window.location.origin).replace(/\/+$/, '');

    const requestBody: Record<string, string> = {
      successUrl: `${memberAppUrl}/checkout/success`,
      cancelUrl: `${memberAppUrl}/checkout/cancel`,
      redirectUrl: `${memberAppUrl}/checkout/redirect`,
    };

    const cheaper = getCheaperProduct();
    const targetPriceId = cheaper ? cheaper.id : priceId || selectedPriceId || button.dataset.priceId;
    if (targetPriceId) {
      requestBody.priceId = targetPriceId;
    }

    const res = await fetch(`${config.ApiUrl}/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };

    if (!res.ok || !data.url) {
      throw new Error(data.message || data.error || `Nie można rozpocząć płatności (HTTP ${res.status}).`);
    }

    const popup = window.open(data.url, '_blank');
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = data.url;
    }
  } catch (err) {
    setError(errorEl, err instanceof Error ? err.message : 'Nie udało się rozpocząć płatności. Spróbuj ponownie.');
    button.disabled = false;
    button.textContent = originalLabel;
    throw err;
  }
}

// Modal Element References
const termsModal = document.getElementById('checkout-terms-modal');
const statuteDocModal = document.getElementById('statute-doc-modal');
const closeTermsModalBtn = document.getElementById('close-terms-modal');
const cancelTermsModalBtn = document.getElementById('cancel-terms-modal');
const confirmCheckoutBtn = document.getElementById('confirm-checkout-btn') as HTMLButtonElement | null;
const statuteCheckbox = document.getElementById('statute-acceptance-checkbox') as HTMLInputElement | null;
const modalErrorEl = document.getElementById('modal-checkout-error') as HTMLParagraphElement | null;
const openStatuteDocTrigger = document.getElementById('open-statute-doc-trigger');
const closeStatuteDocBtn = document.getElementById('close-statute-doc');
const acceptAndCloseStatuteBtn = document.getElementById('accept-and-close-statute');

let activeTriggerButton: HTMLButtonElement | null = null;

function updateConfirmButtonState(): void {
  if (!confirmCheckoutBtn || !statuteCheckbox) return;
  const isChecked = statuteCheckbox.checked;

  confirmCheckoutBtn.disabled = !isChecked;
  confirmCheckoutBtn.classList.toggle('opacity-50', !isChecked);
  confirmCheckoutBtn.classList.toggle('cursor-not-allowed', !isChecked);
  confirmCheckoutBtn.classList.toggle('hover:bg-primary-hover', isChecked);
  confirmCheckoutBtn.classList.toggle('hover:scale-[1.02]', isChecked);
}

function openTermsModal(triggerBtn: HTMLButtonElement): void {
  activeTriggerButton = triggerBtn;
  if (!termsModal) return;

  const cheaper = getCheaperProduct();
  if (cheaper) {
    selectedPriceId = cheaper.id;
    updateModalProductDetails(cheaper);
  } else {
    const btnPriceId = triggerBtn.dataset.priceId;
    if (btnPriceId) {
      selectedPriceId = btnPriceId;
      const found = availableProducts.find((p) => p.id === btnPriceId);
      if (found) updateModalProductDetails(found);
    }
  }

  if (statuteCheckbox) {
    statuteCheckbox.checked = false;
  }
  updateConfirmButtonState();
  setError(modalErrorEl, null);

  termsModal.classList.remove('hidden');
}

function closeTermsModal(): void {
  if (!termsModal) return;
  termsModal.classList.add('hidden');
  activeTriggerButton = null;
}

function openStatuteDocModal(): void {
  if (!statuteDocModal) return;
  statuteDocModal.classList.remove('hidden');
}

function closeStatuteDocModal(): void {
  if (!statuteDocModal) return;
  statuteDocModal.classList.add('hidden');
}

if (statuteCheckbox) {
  statuteCheckbox.addEventListener('change', updateConfirmButtonState);
}

if (closeTermsModalBtn) closeTermsModalBtn.addEventListener('click', closeTermsModal);
if (cancelTermsModalBtn) cancelTermsModalBtn.addEventListener('click', closeTermsModal);
if (openStatuteDocTrigger) openStatuteDocTrigger.addEventListener('click', openStatuteDocModal);
if (closeStatuteDocBtn) closeStatuteDocBtn.addEventListener('click', closeStatuteDocModal);
if (acceptAndCloseStatuteBtn) {
  acceptAndCloseStatuteBtn.addEventListener('click', () => {
    closeStatuteDocModal();
    if (statuteCheckbox) {
      statuteCheckbox.checked = true;
      updateConfirmButtonState();
    }
  });
}

// Close modals when clicking backdrop
termsModal?.addEventListener('click', (e) => {
  if (e.target === termsModal) closeTermsModal();
});
statuteDocModal?.addEventListener('click', (e) => {
  if (e.target === statuteDocModal) closeStatuteDocModal();
});

document.querySelectorAll<HTMLButtonElement>('.js-join-cta').forEach((button) => {
  button.addEventListener('click', () => openTermsModal(button));
});

if (confirmCheckoutBtn) {
  confirmCheckoutBtn.addEventListener('click', async () => {
    if (!statuteCheckbox?.checked) {
      setError(modalErrorEl, 'Musisz zaakceptować Regulamin Klubu, aby kontynuować.');
      return;
    }

    if (!activeTriggerButton) return;

    setError(modalErrorEl, null);
    confirmCheckoutBtn.disabled = true;
    confirmCheckoutBtn.textContent = 'Przekierowywanie do Stripe...';

    try {
      await startCheckout(activeTriggerButton, selectedPriceId);
    } catch (err) {
      setError(modalErrorEl, err instanceof Error ? err.message : 'Uruchomienie płatności nie powiodło się.');
    } finally {
      confirmCheckoutBtn.disabled = false;
      confirmCheckoutBtn.textContent = 'Przejdź do Płatności Stripe';
      updateConfirmButtonState();
    }
  });
}

const yearEl = document.getElementById('copyright-year');
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

// FAQ Accordion Interactivity
document.querySelectorAll<HTMLButtonElement>('.js-faq-trigger').forEach((trigger) => {
  trigger.addEventListener('click', () => {
    const item = trigger.closest('.js-faq-item');
    const answer = item?.querySelector<HTMLElement>('.js-faq-answer');
    const icon = trigger.querySelector<HTMLElement>('.js-faq-icon');

    if (answer && icon) {
      const isExpanded = !answer.classList.contains('hidden');
      answer.classList.toggle('hidden', isExpanded);
      icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
    }
  });
});

// Presale Spots Counter Animation
const spotsEl = document.getElementById('presale-spots');
if (spotsEl) {
  let spots = 47;
  const interval = setInterval(() => {
    if (spots > 12) {
      spots -= 1;
      spotsEl.textContent = String(spots);
    } else {
      clearInterval(interval);
    }
  }, 12000);
}

// Load dynamic products from Stripe API on initial script load
loadStripeProducts();
