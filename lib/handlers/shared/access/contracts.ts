import {
  HardwareAdapterId,
  QrClassification,
  QrProviderId,
  ScanContent,
  ScanEnvelope,
} from './types';

/** Converts reader-specific hardware output into the scanner-neutral scan envelope. */
export interface ScannerReader {
  readonly id: HardwareAdapterId;
  read(content: ScanContent, observedAt: string): Promise<ScanEnvelope>;
}

/** Recognizes and interprets one QR credential format without making an access decision. */
export interface QrProvider {
  readonly id: QrProviderId;
  classify(scan: ScanEnvelope): Promise<QrClassification>;
}

/** Selects the permitted QR provider that owns a scan and returns its classification. */
export interface QrClassifier {
  classify(scan: ScanEnvelope, allowedProviderIds: QrProviderId[]): Promise<QrClassification>;
}
