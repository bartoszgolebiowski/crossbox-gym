import { AccessRepository } from '../repositories';
import { BasicSubscriptionProvider, DefaultProviderClassifier, MockProvider, TildeV130Provider } from './qr';
import { CommitResult, VerificationResult, VerifiedCredential } from './types';

export class AccessService {
  private classifier: DefaultProviderClassifier;

  constructor(
    private readonly repository: AccessRepository,
    private readonly now: () => Date = () => new Date()
  ) {
    this.classifier = new DefaultProviderClassifier([
      new TildeV130Provider(),
      new BasicSubscriptionProvider(
        async () => {
          const keys = await this.repository.getQrSigningKeys();
          if (!keys.currentKey) {
            throw new Error('HMAC_CURRENT_KEY is not configured');
          }
          return { currentKey: keys.currentKey, previousKey: keys.previousKey };
        },
        (userId) => this.repository.getUserSubscription(userId)
      ),
      new MockProvider(),
    ]);
  }

  async verifyRawData(rawData: string): Promise<VerificationResult> {
    const classification = await this.classifier.classify(rawData);

    if (classification.status !== 'recognized' || !classification.providerId) {
      return { success: false, reason: classification.reason || 'unrecognized_format' };
    }

    const provider = this.classifier.getProvider(classification.providerId);
    if (!provider) {
      return { success: false, reason: 'provider_not_found' };
    }

    return provider.verify(rawData);
  }

  async commitAccess(scannerId: string, credential: VerifiedCredential): Promise<CommitResult> {
    const scanner = await this.repository.findActiveScanner(scannerId);
    if (!scanner) {
      return { success: false, reason: 'unknown_or_inactive_scanner' };
    }
    if (!scanner.assigned_locker_id?.trim()) {
      return { success: false, reason: 'scanner_unassigned_locker' };
    }
    // Enforce scanner's allowed_qr_providers whitelist
    if (!scanner.allowed_qr_providers.includes(credential.providerId as any)) {
      return { success: false, reason: 'unavailable' };
    }

    const commitTime = this.now();
    const result = await this.repository.commitAccess({
      scanner,
      credential,
      scannerId,
      committedAt: commitTime.toISOString(),
      committedAtEpochSeconds: Math.floor(commitTime.getTime() / 1000),
    });
    if (result.outcome === 'committed' && result.entryId) {
      return { success: true, entryId: result.entryId, lockerId: scanner.assigned_locker_id };
    }
    if (result.outcome === 'anti_passback_cooldown') {
      return { success: false, reason: 'anti_passback_cooldown' };
    }
    return { success: false, reason: 'transaction_failed' };
  }
}
