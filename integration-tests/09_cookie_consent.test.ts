import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { requireOutput } from './lib/stack-outputs';

function asUrl(domain: string): URL {
  return new URL(domain.startsWith('http') ? domain : `https://${domain}`);
}

describe('GDPR cookie consent and analytics configuration', () => {
  test('hero config.json exposes a valid GA4 measurement ID for consent-gated loading', async () => {
    const heroDomain = await requireOutput('HeroCloudFrontUrl');
    const site = asUrl(heroDomain);

    const response = await fetch(new URL('/config.json', site));
    assert.equal(response.ok, true, `${site.origin}/config.json should be available`);

    const config = (await response.json()) as { GaMeasurementId?: string };
    assert.match(config.GaMeasurementId ?? '', /^G-[A-Z0-9]+$/, 'GaMeasurementId must be a GA4 measurement ID');
  });

  test('hero index.html declares Consent Mode V2 default denied state before Google tag', async () => {
    const heroDomain = await requireOutput('HeroCloudFrontUrl');
    const site = asUrl(heroDomain);

    const response = await fetch(new URL('/', site));
    assert.equal(response.ok, true, `${site.origin}/ should be available`);

    const html = await response.text();
    assert.match(html, /analytics_storage': 'denied'/i, 'Consent Mode V2 default denied must be declared');
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=/i, 'Google tag script should be present');
    assert.match(html, /<script[^>]*src="[^"]*\/assets\/[^"]*\.js"/, 'Hero bundle script should be present');
  });
});
