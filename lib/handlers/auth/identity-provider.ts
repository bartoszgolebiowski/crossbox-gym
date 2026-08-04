import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UnauthorizedError, ValidationError } from '../shared/http';

export interface AuthResult {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface AuthIdentityProvider {
  login(email: string, password: string): Promise<AuthResult>;
  register(email: string, password: string): Promise<{ sub: string }>;
  setPermanentPassword(email: string, password: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>;
  resetPassword(email: string, newPassword: string): Promise<void>;
  getUserSub(email: string): Promise<string | undefined>;
}

export class CognitoAuthIdentityProvider implements AuthIdentityProvider {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
    private readonly clientId: string
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const authRes = await this.client.send(
        new AdminInitiateAuthCommand({
          UserPoolId: this.userPoolId,
          ClientId: this.clientId,
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
      if (err instanceof UnauthorizedError) {
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

  async register(email: string, password: string): Promise<{ sub: string }> {
    try {
      const userRes = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS',
        })
      );
      const sub = userRes.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || '';

      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        })
      );

      return { sub };
    } catch (e: any) {
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
  }

  async setPermanentPassword(email: string, password: string): Promise<void> {
    try {
      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        })
      );
    } catch (e: any) {
      throw new ValidationError(e.message || 'Failed to update password');
    }
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      await this.client.send(
        new ForgotPasswordCommand({
          ClientId: this.clientId,
          Username: email,
        })
      );
    } catch (e: any) {
      await this.client
        .send(
          new AdminResetUserPasswordCommand({
            UserPoolId: this.userPoolId,
            Username: email,
          })
        )
        .catch(() => {});
    }
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    try {
      await this.client.send(
        new ConfirmForgotPasswordCommand({
          ClientId: this.clientId,
          Username: email,
          ConfirmationCode: code,
          Password: newPassword,
        })
      );
    } catch (e: any) {
      throw new ValidationError(e.message || 'Confirmation failed');
    }
  }

  async resetPassword(email: string, newPassword: string): Promise<void> {
    try {
      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          Password: newPassword,
          Permanent: true,
        })
      );
    } catch (e: any) {
      throw new ValidationError(e.message || 'Failed to reset password');
    }
  }

  async getUserSub(email: string): Promise<string | undefined> {
    try {
      const userRes = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        })
      );
      return userRes.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
    } catch (e) {
      return undefined;
    }
  }
}

export class MockAuthIdentityProvider implements AuthIdentityProvider {
  private readonly users = new Map<string, { sub: string; password: string }>();

  async login(email: string, password: string): Promise<AuthResult> {
    const user = this.users.get(email);
    if (!user || user.password !== password) {
      throw new UnauthorizedError('Invalid email or password');
    }
    return {
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
    };
  }

  async register(email: string, password: string): Promise<{ sub: string }> {
    if (this.users.has(email)) {
      throw new ValidationError('An account with this email address already exists.');
    }
    const sub = `sub_${email}`;
    this.users.set(email, { sub, password });
    return { sub };
  }

  async setPermanentPassword(email: string, password: string): Promise<void> {
    const user = this.users.get(email);
    if (!user) {
      throw new ValidationError('User not found');
    }
    user.password = password;
  }

  async forgotPassword(): Promise<void> {
    // no-op for mock
  }

  async confirmForgotPassword(): Promise<void> {
    // no-op for mock
  }

  async resetPassword(email: string, newPassword: string): Promise<void> {
    return this.setPermanentPassword(email, newPassword);
  }

  async getUserSub(email: string): Promise<string | undefined> {
    return this.users.get(email)?.sub;
  }
}
