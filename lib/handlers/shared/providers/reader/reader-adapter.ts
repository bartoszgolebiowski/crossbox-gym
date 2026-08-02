import { HardwareAdapterId, ScanContent, ScanEnvelope, ScannerReader } from '../../access';

export class DefaultScannerReader implements ScannerReader {
  readonly id: HardwareAdapterId = 'default';

  async read(content: ScanContent, observedAt: string): Promise<ScanEnvelope> {
    return {
      content,
      observed_at: observedAt,
    };
  }
}

export function createScannerReader(adapterId: HardwareAdapterId = 'default'): ScannerReader {
  if (adapterId === 'default') {
    return new DefaultScannerReader();
  }
  throw new Error(`Unsupported scanner reader adapter: '${adapterId}'`);
}
