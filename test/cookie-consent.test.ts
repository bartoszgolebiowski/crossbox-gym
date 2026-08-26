import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    initCookieConsent,
    loadGoogleAnalytics,
    openCookieSettings,
    readStoredConsent,
} from '../frontend/hero/src/cookieConsent';

/** Minimal DOM/localStorage test doubles — no jsdom dependency needed. */
function createFakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: map.size,
  } as Storage;
}

function createFakeDocument() {
  const scripts: { src: string; dataset: Record<string, string> }[] = [];
  const appendedChildren: any[] = [];
  const fakeDoc = {
    querySelector: (selector: string) =>
      selector === 'script[data-ga-injected="true"]' && scripts.length > 0 ? scripts[0] : null,
    createElement: (_tag: string) => {
      const attributes = new Map<string, string>();
      const el: any = {
        id: '',
        src: '',
        async: false,
        innerHTML: '',
        dataset: {} as Record<string, string>,
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false,
        },
        setAttribute: (key: string, val: string) => attributes.set(key, val),
        getAttribute: (key: string) => attributes.get(key) ?? null,
        remove: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        scrollIntoView: () => {},
      };
      return el;
    },
    head: {
      appendChild: (child: Node) => {
        appendedChildren.push(child);
        if ((child as any).dataset?.gaInjected === 'true') scripts.push(child as any);
      },
    },
    body: {
      appendChild: (child: Node) => {
        appendedChildren.push(child);
      },
    },
    getElementById: (_id: string) => null,
  };
  return { fakeDoc: fakeDoc as unknown as Document, scripts, appendedChildren };
}

function createFakeWindow() {
  const dataLayer: unknown[][] = [];
  const fakeWindow = {
    dataLayer,
    gtag: (...args: unknown[]) => void dataLayer.push(args as unknown[]),
  };
  return { fakeWindow: fakeWindow as unknown as Window, dataLayer };
}

const GA_ID = 'G-TEST1234';

describe('cookie consent', () => {
  test('readStoredConsent returns null when no choice was stored', () => {
    assert.equal(readStoredConsent(createFakeStorage()), null);
  });

  test('readStoredConsent returns stored granted/denied and ignores invalid values', () => {
    assert.equal(readStoredConsent(createFakeStorage({ 'cg-cookie-consent': 'granted' })), 'granted');
    assert.equal(readStoredConsent(createFakeStorage({ 'cg-cookie-consent': 'denied' })), 'denied');
    assert.equal(readStoredConsent(createFakeStorage({ 'cg-cookie-consent': 'bogus' })), null);
  });

  test('loadGoogleAnalytics injects exactly one gtag script with the measurement ID and sends consent update', () => {
    const { fakeDoc, scripts } = createFakeDocument();
    const { fakeWindow, dataLayer } = createFakeWindow();
    loadGoogleAnalytics(GA_ID, fakeDoc, fakeWindow);

    assert.equal(scripts.length, 1);
    assert.ok(scripts[0].src.includes(`id=${GA_ID}`));
    assert.equal(scripts[0].dataset.gaInjected, 'true');
    // Consent update signal: analytics_storage granted
    const consentUpdateCall = dataLayer.find((args) => args[0] === 'consent' && args[1] === 'update') as unknown[] | undefined;
    assert.ok(consentUpdateCall);
    assert.deepEqual(consentUpdateCall[2], {
      analytics_storage: 'granted',
    });
    const configCall = dataLayer.find((args) => args[0] === 'config') as unknown[] | undefined;
    assert.ok(configCall);
    assert.equal(configCall[1], GA_ID);
    assert.deepEqual(configCall[2], { anonymize_ip: true });
  });

  test('loadGoogleAnalytics is idempotent — never injects twice', () => {
    const { fakeDoc, scripts } = createFakeDocument();
    const { fakeWindow } = createFakeWindow();
    loadGoogleAnalytics(GA_ID, fakeDoc, fakeWindow);
    loadGoogleAnalytics(GA_ID, fakeDoc, fakeWindow);

    assert.equal(scripts.length, 1);
  });

  test('no banner and no GA script when consent was previously denied', () => {
    const storage = createFakeStorage({ 'cg-cookie-consent': 'denied' });
    const { fakeDoc, scripts, appendedChildren } = createFakeDocument();

    initCookieConsent({ GaMeasurementId: GA_ID }, { document: fakeDoc, localStorage: storage });

    assert.equal(scripts.length, 0);
    assert.equal(appendedChildren.length, 0);
  });

  test('GA loads immediately on a repeat visit after prior acceptance', () => {
    const storage = createFakeStorage({ 'cg-cookie-consent': 'granted' });
    const { fakeDoc, scripts } = createFakeDocument();
    const { fakeWindow } = createFakeWindow();

    initCookieConsent({ GaMeasurementId: GA_ID }, { document: fakeDoc, localStorage: storage, window: fakeWindow });

    assert.equal(scripts.length, 1);
  });

  test('openCookieSettings re-appends consent banner even if previously denied', () => {
    const storage = createFakeStorage({ 'cg-cookie-consent': 'denied' });
    const { fakeDoc, appendedChildren } = createFakeDocument();

    openCookieSettings({ GaMeasurementId: GA_ID }, { document: fakeDoc, localStorage: storage });

    assert.equal(appendedChildren.length, 1);
  });
});
