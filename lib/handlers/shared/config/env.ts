export function getMainTableName(): string {
  const name = process.env.MAIN_TABLE_NAME;
  if (!name) throw new Error('MAIN_TABLE_NAME environment variable is required');
  return name;
}

export function getEntryLogsTableName(): string {
  const name = process.env.ENTRY_LOGS_TABLE_NAME;
  if (!name) throw new Error('ENTRY_LOGS_TABLE_NAME environment variable is required');
  return name;
}

export function getAuditLogsTableName(): string {
  const name = process.env.AUDIT_LOGS_TABLE_NAME;
  if (!name) throw new Error('AUDIT_LOGS_TABLE_NAME environment variable is required');
  return name;
}

export function getUserPoolId(): string {
  const id = process.env.USER_POOL_ID;
  if (!id) throw new Error('USER_POOL_ID environment variable is required');
  return id;
}

export function getUserPoolClientId(): string {
  const id = process.env.USER_POOL_CLIENT_ID;
  if (!id) throw new Error('USER_POOL_CLIENT_ID environment variable is required');
  return id;
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY environment variable is required');
  return key;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
  return secret;
}

export function getStripeSecretKeySsmPath(): string {
  return process.env.STRIPE_SECRET_KEY_SSM_PATH || '/crossbox/stripe/secret_key';
}

export function getStripeWebhookSecretSsmPath(): string {
  return process.env.STRIPE_WEBHOOK_SECRET_SSM_PATH || '/crossbox/stripe/webhook_secret';
}

export function getPaymentProvider(): string {
  return process.env.PAYMENT_PROVIDER || 'stripe';
}

export function getIdentityProvider(): string {
  return process.env.IDENTITY_PROVIDER || 'cognito';
}

export function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

export function getAdminFrontendUrl(): string {
  return process.env.ADMIN_FRONTEND_URL || 'http://localhost:3001';
}
