import { IProvider, ProviderId, VerificationResult } from './types';

export class MockProvider implements IProvider {
  readonly id: ProviderId = 'mock';

  canHandle(rawData: string): boolean {
    return typeof rawData === 'string' && rawData.startsWith('mock:');
  }

  async verify(rawData: string, _context?: Record<string, unknown>): Promise<VerificationResult> {
    if (!this.canHandle(rawData)) {
      return { success: false, reason: 'unrecognized_format' };
    }

    const subjectId = rawData.slice('mock:'.length).trim();
    if (!subjectId) {
      return { success: false, reason: 'missing_mock_subject_id' };
    }

    return {
      success: true,
      credential: {
        subjectId,
        providerId: this.id,
      },
    };
  }
}
