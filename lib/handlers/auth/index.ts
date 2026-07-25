import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { 
  CognitoIdentityProviderClient, 
  AdminInitiateAuthCommand, 
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes, createHash } from 'crypto';
import { withHandler, parseJsonBody, extractJwtClaims, ValidationError, NotFoundError, UnauthorizedError } from '../shared/http';
import { ddb } from '../shared/ddb-client';
import { createEmailProvider } from '../shared/providers';
import { MagicLinkToken, MagicLinkRateLimit } from '../shared/types';

const cognito = new CognitoIdentityProviderClient({});
const MAIN_TABLE_NAME = process.env.MAIN_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://d3klturtfk9dxr.cloudfront.net';

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = parseJsonBody(event);
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    try {
      const authRes = await cognito.send(new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }));

      const authResult = authRes.AuthenticationResult;
      if (!authResult) {
        throw new UnauthorizedError('Invalid credentials');
      }

      return {
        accessToken: authResult.AccessToken,
        idToken: authResult.IdToken,
        refreshToken: authResult.RefreshToken,
        expiresIn: authResult.ExpiresIn,
      };
    } catch (err: any) {
      console.error('Login error:', err);
      throw new UnauthorizedError('Invalid email or password');
    }
  }

  if (method === 'POST' && path === '/auth/magic-link') {
    const { email } = parseJsonBody(event);
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const now = Math.floor(Date.now() / 1000);
    const rateLimitKey = `RATELIMIT#${email}`;
    
    // Check rate limiting
    const rlRes = await ddb.send(new GetCommand({
      TableName: MAIN_TABLE_NAME,
      Key: { PK: rateLimitKey, SK: 'RATELIMIT' }
    }));
    const rateLimit = rlRes.Item as MagicLinkRateLimit | undefined;

    if (rateLimit && rateLimit.request_count >= 5 && (now - new Date(rateLimit.window_start).getTime() / 1000) < 3600) {
      throw new ValidationError('Magic link request limit reached. Please try again in an hour.');
    }

    // Update rate limit
    await ddb.send(new PutCommand({
      TableName: MAIN_TABLE_NAME,
      Item: {
        PK: rateLimitKey,
        SK: 'RATELIMIT',
        request_count: (rateLimit?.request_count || 0) + 1,
        window_start: rateLimit?.window_start || new Date().toISOString(),
        ttl: now + 3600
      }
    }));

    // Generate token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await ddb.send(new PutCommand({
      TableName: MAIN_TABLE_NAME,
      Item: {
        PK: `TOKEN#${tokenHash}`,
        SK: 'TOKEN',
        user_id: email,
        created_at: new Date().toISOString(),
        ttl: now + 15 * 60 // 15 minutes TTL
      } as MagicLinkToken
    }));

    const magicUrl = `${FRONTEND_URL}/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(email)}`;
    const emailProvider = createEmailProvider(process.env.EMAIL_PROVIDER || 'mock');
    
    await emailProvider.sendEmail({
      to: email,
      from: process.env.SES_SENDER_EMAIL || 'no-reply@crossbox.com',
      subject: 'Your CrossBox Gym Magic Login Link',
      body: `Click the following link to log in to your CrossBox Gym account: ${magicUrl}`
    });

    return { message: 'Magic link sent successfully' };
  }

  if (method === 'GET' && path === '/auth/magic-link/verify') {
    const query = event.queryStringParameters || {};
    const token = query.token;
    const email = query.email;

    if (!token || !email) {
      throw new ValidationError('Token and email query parameters are required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenRes = await ddb.send(new GetCommand({
      TableName: MAIN_TABLE_NAME,
      Key: { PK: `TOKEN#${tokenHash}`, SK: 'TOKEN' }
    }));

    const tokenItem = tokenRes.Item as MagicLinkToken | undefined;
    if (!tokenItem || tokenItem.user_id !== email) {
      throw new ValidationError('Invalid or expired magic link token');
    }

    return {
      verified: true,
      email,
      message: 'Magic link verified successfully'
    };
  }

  if (method === 'POST' && path === '/auth/set-password') {
    const claims = extractJwtClaims(event);
    if (!claims) throw new UnauthorizedError('Unauthorized');

    const email = claims.email as string;
    const { newPassword } = parseJsonBody(event);
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: newPassword,
      Permanent: true
    }));

    await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE_NAME,
      Key: { PK: `USER#${claims.sub}`, SK: 'PROFILE' },
      UpdateExpression: 'SET password_set = :true',
      ExpressionAttributeValues: { ':true': true }
    }));

    return { message: 'Password updated successfully' };
  }

  if (method === 'POST' && path === '/auth/register') {
    const { email, password } = parseJsonBody(event);
    if (!email) {
      throw new ValidationError('Email is required');
    }
    const userPassword = password || 'Member123!';

    let sub = '';
    try {
      const userRes = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' }
        ],
        MessageAction: 'SUPPRESS'
      }));
      sub = userRes.User?.Attributes?.find(a => a.Name === 'sub')?.Value || '';
    } catch (e: any) {
      if (e.name !== 'UsernameExistsException') throw e;
    }

    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: userPassword,
      Permanent: true
    }));

    if (sub) {
      await ddb.send(new PutCommand({
        TableName: MAIN_TABLE_NAME,
        Item: {
          PK: `USER#${sub}`,
          SK: 'PROFILE',
          email,
          role: 'member',
          password_set: true,
          created_at: new Date().toISOString()
        }
      }));
    }

    return {
      message: `Member ${email} created successfully!`,
      email,
      password: userPassword
    };
  }

  throw new NotFoundError('Route not found');
});
