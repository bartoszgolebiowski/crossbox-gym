import { QrClassifier, QrProvider } from '../access-contracts';
import { QrClassification, QrProviderId, ScanEnvelope } from '../access-types';
import { signQrPayload } from '../hash-helpers';

interface BasicQrPayload {
  user_id: string;
  timestamp: number;
  hmac: string;
}

export class BasicSubscriptionQrProvider implements QrProvider {
  readonly id = 'basic-subscription';

  constructor(
    private readonly currentKey: string,
    private readonly previousKey: string | undefined,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  async classify(scan: ScanEnvelope): Promise<QrClassification> {
    if (scan.content.kind !== 'text') return { status: 'not-recognized' };

    let payload: Partial<BasicQrPayload>;
    try {
      payload = JSON.parse(scan.content.value) as Partial<BasicQrPayload>;
    } catch {
      return { status: 'not-recognized' };
    }

    if (!('user_id' in payload || 'timestamp' in payload || 'hmac' in payload)) return { status: 'not-recognized' };
    if (typeof payload.user_id !== 'string' || typeof payload.timestamp !== 'number' || typeof payload.hmac !== 'string') {
      return { status: 'rejected', reason: 'invalid' };
    }
    if (Math.abs(this.nowSeconds() - payload.timestamp) > 60) return { status: 'rejected', reason: 'expired' };

    const current = signQrPayload(payload.user_id, payload.timestamp, this.currentKey);
    const previous = this.previousKey ? signQrPayload(payload.user_id, payload.timestamp, this.previousKey) : undefined;
    if (payload.hmac !== current && payload.hmac !== previous) return { status: 'rejected', reason: 'invalid' };

    return { status: 'recognized', credential: { provider_id: this.id, subject_id: payload.user_id } };
  }
}

export class MockQrProvider implements QrProvider {
  readonly id = 'mock';

  async classify(scan: ScanEnvelope): Promise<QrClassification> {
    if (scan.content.kind !== 'text' || !scan.content.value.startsWith('mock:')) return { status: 'not-recognized' };
    const subjectId = scan.content.value.slice('mock:'.length);
    return subjectId ? { status: 'recognized', credential: { provider_id: this.id, subject_id: subjectId } } : { status: 'rejected', reason: 'invalid' };
  }
}

class ExternalQrProviderStub implements QrProvider {
  constructor(readonly id: QrProviderId) {}

  async classify(): Promise<QrClassification> {
    return { status: 'not-recognized' };
  }
}

export class RegisteredQrClassifier implements QrClassifier {
  constructor(private readonly providers: ReadonlyMap<QrProviderId, QrProvider>) {}

  async classify(scan: ScanEnvelope, allowedProviderIds: QrProviderId[]): Promise<QrClassification> {
    for (const providerId of allowedProviderIds) {
      const provider = this.providers.get(providerId);
      if (!provider) return { status: 'rejected', reason: 'unavailable' };
      const result = await provider.classify(scan);
      if (result.status !== 'not-recognized') return result;
    }
    return { status: 'not-recognized' };
  }
}

export function createQrClassifier(currentKey: string, previousKey?: string): QrClassifier {
  return new RegisteredQrClassifier(new Map<QrProviderId, QrProvider>([
    ['basic-subscription', new BasicSubscriptionQrProvider(currentKey, previousKey)],
    ['mock', new MockQrProvider()],
    ['integration-a', new ExternalQrProviderStub('integration-a')],
    ['integration-b', new ExternalQrProviderStub('integration-b')],
  ]));
}