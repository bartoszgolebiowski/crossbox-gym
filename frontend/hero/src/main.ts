import { loadRuntimeConfig } from '../../shared/runtimeConfig';
import './index.css';

function setError(errorEl: HTMLParagraphElement | null, message: string | null): void {
  if (!errorEl) return;
  errorEl.textContent = message ?? '';
  errorEl.classList.toggle('hidden', !message);
}

async function startCheckout(button: HTMLButtonElement): Promise<void> {
  const errorEl = button.parentElement?.querySelector<HTMLParagraphElement>('.js-cta-error') ?? null;
  const originalLabel = button.dataset.ctaLabel ?? button.textContent ?? 'Dołącz w przedsprzedaży – 139 zł/mies';

  setError(errorEl, null);
  button.disabled = true;
  button.textContent = 'Przekierowywanie do Stripe...';

  try {
    const config = await loadRuntimeConfig();
    // Stripe redirects here after checkout; the member app owns the post-payment UX.
    const memberAppUrl = (config.MemberAppUrl || window.location.origin).replace(/\/+$/, '');

    const res = await fetch(`${config.ApiUrl}/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        successUrl: `${memberAppUrl}/checkout/success`,
        cancelUrl: `${memberAppUrl}/checkout/cancel`,
        redirectUrl: `${memberAppUrl}/checkout/redirect`,
      }),
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
      await startCheckout(activeTriggerButton);
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
  // Subtle animation decreasing spots over time to simulate active demand
  const interval = setInterval(() => {
    if (spots > 12) {
      spots -= 1;
      spotsEl.textContent = String(spots);
    } else {
      clearInterval(interval);
    }
  }, 12000);
}
