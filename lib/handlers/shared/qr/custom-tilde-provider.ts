import { IProvider, ParsedTildeV130Data, ProviderId, VerificationResult } from './types';

export class TildeV130Provider implements IProvider {
  readonly id: ProviderId = 'tilde-v1-3-0';

  canHandle(rawData: string): boolean {
    return typeof rawData === 'string' && (rawData.startsWith('1.3.0~') || rawData.startsWith('1.'));
  }

  parseTildeData(rawData: string): ParsedTildeV130Data {
    const parts = rawData.split('~');
    const version = parts[0] || '1.3.0';
    const serialNumber = parts[1] || '';
    const headerCode = parts[2] || '';
    const kvString = parts[3] || '';

    const keyValues: Record<string, string> = {};
    if (kvString) {
      for (const pair of kvString.split('|')) {
        if (!pair) continue;
        const [k, v] = pair.split('=');
        if (k && v !== undefined) keyValues[k] = v;
      }
    }

    const segments = parts.length > 5 ? parts.slice(4, parts.length - 1) : [];
    const signature = parts.length > 4 ? parts[parts.length - 1] : undefined;

    return {
      version,
      serialNumber,
      headerCode,
      keyValues,
      segments,
      signature,
    };
  }

  async verify(rawData: string, context?: Record<string, unknown>): Promise<VerificationResult> {
    if (!this.canHandle(rawData)) {
      return { success: false, reason: 'unrecognized_format' };
    }

    try {
      const parsed = this.parseTildeData(rawData);
      const subjectId = parsed.keyValues['4'] || parsed.serialNumber;

      if (!subjectId) {
        return { success: false, reason: 'missing_subject_id' };
      }

      const validUntilStr = parsed.keyValues['6'];
      if (validUntilStr && validUntilStr.length === 8) {
        const year = parseInt(validUntilStr.substring(0, 4), 10);
        const month = parseInt(validUntilStr.substring(4, 6), 10) - 1;
        const day = parseInt(validUntilStr.substring(6, 8), 10);
        const validUntil = new Date(Date.UTC(year, month, day, 23, 59, 59));

        const now = context?.now instanceof Date ? (context.now as Date) : new Date();
        if (now > validUntil) {
          return { success: false, reason: 'credential_expired' };
        }
      }

      return {
        success: true,
        credential: {
          subjectId,
          providerId: this.id,
          metadata: {
            version: parsed.version,
            serialNumber: parsed.serialNumber,
            keyValues: parsed.keyValues,
            segments: parsed.segments,
            signature: parsed.signature,
          },
        },
      };
    } catch (err) {
      return {
        success: false,
        reason: 'malformed_tilde_data',
      };
    }
  }
}
