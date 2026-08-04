import { expect, test } from '@playwright/test';
import { requireOutput } from '../integration-tests/lib/stack-outputs.ts';
import {
  cleanupTestLocation,
  cleanupTestUser,
  cleanupTestUserByEmail,
  createTestUserSession,
  getTestContext,
} from '../integration-tests/lib/test-helpers.ts';
import type { IntegrationTestContext, TestLocationRecord, TestUserSession } from '../integration-tests/lib/types.ts';

function toHttpsUrl(domainOrUrl: string): string {
  return domainOrUrl.startsWith('http') ? domainOrUrl : `https://${domainOrUrl}`;
}

test.describe('Deployed CrossBox browser flows', () => {
  let context: IntegrationTestContext;
  let activeMember: TestUserSession | undefined;
  let inactiveMember: TestUserSession | undefined;
  let resetMember: TestUserSession | undefined;
  let admin: TestUserSession | undefined;
  let memberPortalUrl: string;
  let adminConsoleUrl: string;
  let createdLocation: TestLocationRecord | undefined;
  let registeredEmail: string | undefined;
  const browserPassword = 'BrowserTest123!';

  test.beforeAll(async () => {
    context = await getTestContext();
    memberPortalUrl = toHttpsUrl(await requireOutput('AppCloudFrontUrl'));
    adminConsoleUrl = toHttpsUrl(await requireOutput('AdminCloudFrontUrl'));
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeMember = await createTestUserSession(context, {
      email: `ui-active-member-${uniqueSuffix}@example.com`,
      role: 'member',
      withActiveSubscription: true,
    });
    inactiveMember = await createTestUserSession(context, {
      email: `ui-inactive-member-${uniqueSuffix}@example.com`,
      role: 'member',
      withActiveSubscription: false,
    });
    resetMember = await createTestUserSession(context, {
      email: `ui-reset-member-${uniqueSuffix}@example.com`,
      role: 'member',
      withActiveSubscription: false,
    });
    admin = await createTestUserSession(context, {
      email: `ui-admin-${uniqueSuffix}@example.com`,
      role: 'admin',
      withActiveSubscription: false,
    });
  });

  test.afterAll(async () => {
    if (createdLocation?.locationId && admin) {
      await cleanupTestLocation(context, admin.idToken, createdLocation.locationId);
    }
    const cleanups: Promise<void>[] = [];
    if (activeMember) cleanups.push(cleanupTestUser(context, activeMember));
    if (inactiveMember) cleanups.push(cleanupTestUser(context, inactiveMember));
    if (resetMember) cleanups.push(cleanupTestUser(context, resetMember));
    if (admin) cleanups.push(cleanupTestUser(context, admin));
    if (registeredEmail) cleanups.push(cleanupTestUserByEmail(context, registeredEmail));
    await Promise.all(cleanups);
  });

  test('member signs in', async ({ page }) => {
    if (!activeMember) throw new Error('The active member was not provisioned.');

    await page.goto(memberPortalUrl);
    await page.locator('#login-email').fill(activeMember.email);
    await page.locator('#login-password').fill(activeMember.password);
    await page.getByRole('button', { name: 'Sign In to Portal' }).click();

    await expect(page.getByText('Active & ready')).toBeVisible();
  });

  test('member can request a password reset', async ({ page }) => {
    if (!resetMember) throw new Error('The reset member was not provisioned.');

    await page.goto(memberPortalUrl);
    await page.getByRole('button', { name: 'Forgot' }).click();
    await page.locator('#forgot-email').fill(resetMember.email);
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    await expect(page.getByText('Verification code sent to your email!')).toBeVisible();
  });

  test('visitor can register a member account', async ({ page }) => {
    registeredEmail = `ui-registered-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    await page.goto(memberPortalUrl);
    await page.getByRole('button', { name: 'Register' }).click();
    await page.locator('#register-email').fill(registeredEmail);
    await page.locator('#register-password').fill(browserPassword);
    await page.getByRole('button', { name: 'Create Member Account' }).click();

    await expect(page.getByText('Turnstile Access Pass', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Turnstile QR Pass' })).toHaveCount(0);
  });

  test('inactive member can start checkout but cannot see a QR pass', async ({ page }) => {
    if (!inactiveMember) throw new Error('The inactive member was not provisioned.');

    await page.goto(memberPortalUrl);
    await page.locator('#login-email').fill(inactiveMember.email);
    await page.locator('#login-password').fill(inactiveMember.password);
    await page.getByRole('button', { name: 'Sign In to Portal' }).click();

    await expect(page.getByText('Turnstile Access Pass', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Turnstile QR Pass' })).toHaveCount(0);

    const [checkoutPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Subscribe via Stripe Checkout' }).click(),
    ]);
    await expect.poll(() => checkoutPage.url()).toMatch(/^https?:\/\//);
    await checkoutPage.close();
  });

  test('active member sees a QR pass and cannot start another subscription', async ({ page }) => {
    if (!activeMember) throw new Error('The active member was not provisioned.');

    await page.goto(memberPortalUrl);
    await page.locator('#login-email').fill(activeMember.email);
    await page.locator('#login-password').fill(activeMember.password);
    await page.getByRole('button', { name: 'Sign In to Portal' }).click();

    await expect(page.getByRole('img', { name: 'Turnstile QR Pass' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subscribe via Stripe Checkout' })).toHaveCount(0);
  });

  test('administrator signs in and creates a location', async ({ page }) => {
    if (!admin) throw new Error('The administrator was not provisioned.');
    const locationName = `UI Test Facility ${Date.now()}`;
    const address = '123 Browser Test Avenue';

    await page.goto(adminConsoleUrl);
    await page.locator('#admin-email').fill(admin.email);
    await page.locator('#admin-password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign In to Console' }).click();

    await expect(page.getByText('Location Management')).toBeVisible();
    await page.locator('#facility-name').fill(locationName);
    await page.locator('#facility-address').fill(address);
    await page.getByRole('button', { name: 'Create Facility' }).click();

    const output = page.locator('pre').filter({ hasText: locationName });
    await expect(output).toBeVisible();
    const location = JSON.parse((await output.textContent()) || '{}') as Omit<TestLocationRecord, 'locationId'> & {
      locationId?: string;
    };
    const locationId = location.locationId || location.PK?.replace(/^LOC#/, '');
    createdLocation = { ...location, locationId } as TestLocationRecord;
    expect(createdLocation.locationId).toBeTruthy();
  });
});
