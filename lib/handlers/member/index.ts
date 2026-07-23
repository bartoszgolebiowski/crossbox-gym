import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { GetCommand, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withHandler, parseJsonBody, extractJwtClaims, ValidationError, NotFoundError, UnauthorizedError } from '../shared/http';
import { ddb } from '../shared/ddb-client';
import { createPaymentProvider } from '../shared/providers';
import { getUserProfile, getUserSubscription, getConfigItem } from '../shared/db-helpers';
import { signQrPayload } from '../shared/hash-helpers';
import { ConsentRecord } from '../shared/types';

const MAIN_TABLE_NAME = process.env.MAIN_TABLE_NAME!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  const claims = extractJwtClaims(event);
  if (!claims) throw new UnauthorizedError('Unauthorized');
  const userId = (claims.sub as string) || (claims['cognito:username'] as string);
  if (!userId) throw new UnauthorizedError('Unauthorized');

  if (method === 'GET' && path === '/member/dashboard') {
    // Parallel fetching of profile, subscription, and locations
    const [user, subscription, locResult] = await Promise.all([
      getUserProfile(MAIN_TABLE_NAME, userId),
      getUserSubscription(MAIN_TABLE_NAME, userId),
      ddb.send(new QueryCommand({
        TableName: MAIN_TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'LOCATIONS' }
      }))
    ]);

    const locations = locResult.Items || [];
    return { user, subscription, locations };
  }

  if (method === 'POST' && path === '/member/consent') {
    const { terms_version } = parseJsonBody(event);
    if (!terms_version) throw new ValidationError('Missing terms_version');

    const now = new Date().toISOString();
    const ipAddress = event.requestContext.http.sourceIp || 'unknown';

    await ddb.send(new PutCommand({
      TableName: MAIN_TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CONSENT#${now}`,
        terms_version,
        ip_address: ipAddress
      } as ConsentRecord
    }));

    await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET terms_accepted_at = :now, terms_version = :ver, terms_ip = :ip',
      ExpressionAttributeValues: {
        ':now': now,
        ':ver': terms_version,
        ':ip': ipAddress
      }
    }));

    return { message: 'Consent recorded successfully' };
  }

  if (method === 'POST' && path === '/member/qr') {
    const sub = await getUserSubscription(MAIN_TABLE_NAME, userId);
    if (!sub) {
      throw new ValidationError('Active subscription required to generate QR code');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const isValidSub = sub.status === 'ACTIVE' || (sub.status === 'PAST_DUE' && sub.grace_period_end && new Date(sub.grace_period_end).getTime() / 1000 > nowSec);
    if (!isValidSub) {
      throw new ValidationError('Subscription is inactive or grace period expired');
    }

    const currentKey = await getConfigItem(MAIN_TABLE_NAME, 'HMAC_CURRENT_KEY') || 'default_key';
    const timestamp = nowSec;
    const hmacSig = signQrPayload(userId, timestamp, currentKey);

    const qrPayload = JSON.stringify({
      user_id: userId,
      timestamp,
      hmac: hmacSig
    });

    return {
      qr_code: qrPayload,
      expires_in: 60
    };
  }

  if (method === 'POST' && path === '/member/portal-session') {
    const sub = await getUserSubscription(MAIN_TABLE_NAME, userId);
    if (!sub || !sub.stripe_customer_id) {
      throw new ValidationError('No Stripe customer ID found for member');
    }

    const paymentProvider = createPaymentProvider(process.env.PAYMENT_PROVIDER || 'mock');
    const session = await paymentProvider.createPortalSession({
      customerId: sub.stripe_customer_id,
      returnUrl: `${FRONTEND_URL}/member/dashboard`
    });

    return { url: session.url };
  }

  throw new NotFoundError('Route not found');
});
