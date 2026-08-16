import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../shared/email/ses-email-service';
import { ValidationError } from '../shared/http';
import { AuthIdentityProvider, AuthResult } from './identity-provider';
import { AuthRepository } from './repository';

export interface AuthServiceDependencies {
  repository: AuthRepository;
  identityProvider: AuthIdentityProvider;
  frontendUrl: string;
  emailService?: EmailService;
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly randomBytes: (size: number) => Buffer;

  constructor(private readonly dependencies: AuthServiceDependencies) {
    this.now = dependencies.now || (() => new Date());
    this.randomBytes = dependencies.randomBytes || randomBytes;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    return this.dependencies.identityProvider.login(email, password);
  }

  async createMagicLink(email: string): Promise<{ message: string; magicUrl: string }> {
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const nowSeconds = Math.floor(this.now().getTime() / 1000);
    const rateLimit = await this.dependencies.repository.getMagicLinkRateLimit(email);

    if (
      rateLimit &&
      rateLimit.request_count >= 5 &&
      nowSeconds - new Date(rateLimit.window_start).getTime() / 1000 < 3600
    ) {
      throw new ValidationError('Magic link request limit reached. Please try again in an hour.');
    }

    await this.dependencies.repository.saveMagicLinkRateLimit(
      email,
      (rateLimit?.request_count || 0) + 1,
      rateLimit?.window_start || this.now().toISOString(),
      nowSeconds + 3600
    );

    const token = this.randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.dependencies.repository.saveMagicLinkToken(tokenHash, email, nowSeconds + 15 * 60);

    const magicUrl = `${this.dependencies.frontendUrl}/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(
      email
    )}`;

    return { message: 'Magic link generated successfully', magicUrl };
  }

  async verifyMagicLink(token: string, email: string): Promise<{ verified: true; email: string; message: string }> {
    if (!token || !email) {
      throw new ValidationError('Token and email query parameters are required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenItem = await this.dependencies.repository.getMagicLinkToken(tokenHash);

    if (!tokenItem || tokenItem.user_id !== email) {
      throw new ValidationError('Invalid or expired magic link token');
    }

    return {
      verified: true,
      email,
      message: 'Magic link token verified successfully',
    };
  }

  async setPassword(sub: string, email: string, newPassword: string): Promise<{ message: string }> {
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    await this.dependencies.identityProvider.setPermanentPassword(email, newPassword);
    await this.dependencies.repository.updatePasswordSet(sub);
    return { message: 'Password updated successfully' };
  }

  async forgotPassword(email: string): Promise<{ message: string; email: string }> {
    if (!email) {
      throw new ValidationError('Email is required');
    }

    await this.dependencies.identityProvider.forgotPassword(email);
    return { message: `Password reset request initiated for ${email}`, email };
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<{ message: string }> {
    if (!email || !code || !newPassword) {
      throw new ValidationError('Email, confirmation code, and newPassword are required');
    }
    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    await this.dependencies.identityProvider.confirmForgotPassword(email, code, newPassword);
    await this.updatePasswordSetIfKnown(email);
    return { message: 'Password reset confirmed successfully' };
  }

  async resetPassword(email: string, token: string | undefined, newPassword: string): Promise<{ message: string }> {
    if (!email || !newPassword) {
      throw new ValidationError('Email and newPassword are required');
    }
    if (newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const tokenItem = await this.dependencies.repository.getMagicLinkToken(tokenHash);
      if (!tokenItem || tokenItem.user_id !== email) {
        throw new ValidationError('Invalid or expired reset token');
      }
    }

    await this.dependencies.identityProvider.resetPassword(email, newPassword);
    await this.updatePasswordSetIfKnown(email);
    return { message: 'Password reset successfully' };
  }

  async register(email: string, password: string): Promise<{ message: string; email: string; sub: string }> {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const { sub } = await this.dependencies.identityProvider.register(email, password);

    if (sub) {
      await this.dependencies.repository.createUserProfile(sub, email, 'member');
    }

    return { message: `User ${email} registered successfully`, email, sub };
  }

  private async updatePasswordSetIfKnown(email: string): Promise<void> {
    const sub = await this.dependencies.identityProvider.getUserSub(email);
    if (sub) {
      await this.dependencies.repository.updatePasswordSet(sub).catch((err) => {
        console.error('Failed to update password_set flag:', err);
      });
    }
  }
}
