import { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes, createHash } from 'crypto';
import {
  withHandler,
  parseJsonBody,
  extractJwtClaims,
  HttpError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
} from '../shared/http';
import { ddb } from '../shared/database';
import { MagicLinkToken, MagicLinkRateLimit } from '../shared/types';
import { getMainTableName, getFrontendUrl, getUserPoolId, getUserPoolClientId } from '../shared/config';

const cognito = new CognitoIdentityProviderClient({});

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  const userPoolId = getUserPoolId();
  const clientId = getUserPoolClientId();

  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = parseJsonBody(event);
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    try {
      const authRes = await cognito.send(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        })
      );

      if (authRes.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        throw new UnauthorizedError(
          'Your account requires password setup. Please use the Magic Link or Password Reset flow to set your permanent password.'
        );
      }

      const authResult = authRes.AuthenticationResult;
      if (!authResult) {
        throw new UnauthorizedError('Invalid email or password');
      }

      return {
        accessToken: authResult.AccessToken,
        idToken: authResult.IdToken,
        refreshToken: authResult.RefreshToken,
        expiresIn: authResult.ExpiresIn,
      };
    } catch (err: any) {
      if (err instanceof HttpError) {
        throw err;
      }
      if (
        err.name === 'PasswordResetRequiredException' ||
        err.name === 'UserPasswordNotVerifiedException' ||
        err.message?.includes('NEW_PASSWORD_REQUIRED')
      ) {
        throw new UnauthorizedError(
          'Your account requires password setup. Please use the Magic Link or Password Reset flow to set your permanent password.'
        );
      }
      console.error('Login error:', err);
      throw new UnauthorizedError(err.message || 'Invalid email or password');
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
    const rlRes = await ddb.send(
      new GetCommand({
        TableName: getMainTableName(),
        Key: { PK: rateLimitKey, SK: 'RATELIMIT' },
      })
    );
    const rateLimit = rlRes.Item as MagicLinkRateLimit | undefined;

    if (rateLimit && rateLimit.request_count >= 5 && now - new Date(rateLimit.window_start).getTime() / 1000 < 3600) {
      throw new ValidationError('Magic link request limit reached. Please try again in an hour.');
    }

    // Update rate limit
    await ddb.send(
      new PutCommand({
        TableName: getMainTableName(),
        Item: {
          PK: rateLimitKey,
          SK: 'RATELIMIT',
          request_count: (rateLimit?.request_count || 0) + 1,
          window_start: rateLimit?.window_start || new Date().toISOString(),
          ttl: now + 3600,
        },
      })
    );

    // Generate token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await ddb.send(
      new PutCommand({
        TableName: getMainTableName(),
        Item: {
          PK: `TOKEN#${tokenHash}`,
          SK: 'TOKEN',
          user_id: email,
          created_at: new Date().toISOString(),
          ttl: now + 15 * 60, // 15 minutes TTL
        } as MagicLinkToken,
      })
    );

    const magicUrl = `${getFrontendUrl()}/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(email)}`;

    return { message: 'Magic link generated successfully', magicUrl };
  }

  if (method === 'GET' && path === '/auth/magic-link/verify') {
    const query = event.queryStringParameters || {};
    const token = query.token;
    const email = query.email;

    if (!token || !email) {
      throw new ValidationError('Token and email query parameters are required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenRes = await ddb.send(
      new GetCommand({
        TableName: getMainTableName(),
        Key: { PK: `TOKEN#${tokenHash}`, SK: 'TOKEN' },
      })
    );

    const tokenItem = tokenRes.Item as MagicLinkToken | undefined;
    if (!tokenItem || tokenItem.user_id !== email) {
      throw new ValidationError('Invalid or expired magic link token');
    }

    return {
      verified: true,
      email,
      message: 'Magic link verified successfully',
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

    try {
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: email,
          Password: newPassword,
          Permanent: true,
        })
      );
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      throw new ValidationError(e.message || 'Failed to update password');
    }

    await ddb.send(
      new UpdateCommand({
        TableName: getMainTableName(),
        Key: { PK: `USER#${claims.sub}`, SK: 'PROFILE' },
        UpdateExpression: 'SET password_set = :true',
        ExpressionAttributeValues: { ':true': true },
      })
    );

    return { message: 'Password updated successfully' };
  }

  if (method === 'POST' && path === '/auth/forgot-password') {
    const { email } = parseJsonBody(event);
    if (!email) {
      throw new ValidationError('Email is required');
    }

    try {
      await cognito.send(
        new ForgotPasswordCommand({
          ClientId: clientId,
          Username: email,
        })
      );
    } catch (e: any) {
      await cognito
        .send(
          new AdminResetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: email,
          })
        )
        .catch(() => {});
    }

    return {
      message: `Password reset request initiated for ${email}`,
      email,
    };
  }

  if (method === 'POST' && path === '/auth/confirm-forgot-password') {
    const { email, code, newPassword } = parseJsonBody(event);
    if (!email || !code || !newPassword) {
      throw new ValidationError('Email, confirmation code, and newPassword are required');
    }
    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    try {
      await cognito.send(
        new ConfirmForgotPasswordCommand({
          ClientId: clientId,
          Username: email,
          ConfirmationCode: code,
          Password: newPassword,
        })
      );
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      throw new ValidationError(e.message || 'Confirmation failed');
    }

    const userRes = await cognito
      .send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: email,
        })
      )
      .catch(() => null);
    const sub = userRes?.UserAttributes?.find((a) => a.Name === 'sub')?.Value;

    if (sub) {
      await ddb
        .send(
          new UpdateCommand({
            TableName: getMainTableName(),
            Key: { PK: `USER#${sub}`, SK: 'PROFILE' },
            UpdateExpression: 'SET password_set = :true',
            ExpressionAttributeValues: { ':true': true },
          })
        )
        .catch(() => {});
    }

    return { message: 'Password reset confirmed successfully' };
  }

  if (method === 'POST' && path === '/auth/reset-password') {
    const { email, token, newPassword } = parseJsonBody(event);
    if (!email || !newPassword) {
      throw new ValidationError('Email and newPassword are required');
    }
    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const tokenRes = await ddb.send(
        new GetCommand({
          TableName: getMainTableName(),
          Key: { PK: `TOKEN#${tokenHash}`, SK: 'TOKEN' },
        })
      );

      const tokenItem = tokenRes.Item as MagicLinkToken | undefined;
      if (!tokenItem || tokenItem.user_id !== email) {
        throw new ValidationError('Invalid or expired reset token');
      }
    }

    try {
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: email,
          Password: newPassword,
          Permanent: true,
        })
      );
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      throw new ValidationError(e.message || 'Failed to reset password');
    }

    const userRes = await cognito
      .send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: email,
        })
      )
      .catch(() => null);
    const sub = userRes?.UserAttributes?.find((a) => a.Name === 'sub')?.Value;

    if (sub) {
      await ddb
        .send(
          new UpdateCommand({
            TableName: getMainTableName(),
            Key: { PK: `USER#${sub}`, SK: 'PROFILE' },
            UpdateExpression: 'SET password_set = :true',
            ExpressionAttributeValues: { ':true': true },
          })
        )
        .catch(() => {});
    }

    return { message: 'Password reset successfully' };
  }

  if (method === 'POST' && path === '/auth/register') {
    const { email, password } = parseJsonBody(event);
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    let sub = '';
    try {
      const userRes = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS',
        })
      );
      sub = userRes.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || '';

      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        })
      );
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      if (e.name === 'UsernameExistsException') {
        throw new ValidationError('An account with this email address already exists.');
      }
      if (e.name === 'InvalidPasswordException') {
        throw new ValidationError(
          e.message || 'Password does not conform to security policy (must contain uppercase letters and numbers).'
        );
      }
      if (e.name === 'InvalidParameterException') {
        throw new ValidationError(e.message || 'Invalid parameters provided.');
      }
      console.error('Registration error:', e);
      throw new ValidationError(e.message || 'Registration failed.');
    }

    if (sub) {
      await ddb.send(
        new PutCommand({
          TableName: getMainTableName(),
          Item: {
            PK: `USER#${sub}`,
            SK: 'PROFILE',
            email,
            role: 'member',
            password_set: true,
            created_at: new Date().toISOString(),
          },
        })
      );
    }

    return {
      message: `User ${email} registered successfully`,
      email,
      sub,
    };
  }

  throw new NotFoundError('Route not found');
});
