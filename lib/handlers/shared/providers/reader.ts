import { ScannerReader } from '../access-contracts';
import { HardwareAdapterId, ScanContent, ScanEnvelope } from '../access-types';

export class MockScannerReader implements ScannerReader {
  readonly id: HardwareAdapterId = 'mock';

  async read(content: ScanContent, observedAt: string): Promise<ScanEnvelope> {
    return { content, observed_at: observedAt };
  }
}

export function createScannerReader(adapterId: HardwareAdapterId): ScannerReader {
  if (adapterId !== 'mock') throw new Error(`Unsupported scanner reader adapter: '${adapterId}'`);
  return new MockScannerReader();
}