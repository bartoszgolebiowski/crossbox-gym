import { IProvider, IProviderClassifier, RawDataClassification } from './types';

export class DefaultProviderClassifier implements IProviderClassifier {
  private readonly providers: Map<string, IProvider> = new Map();

  constructor(providers?: IProvider[]) {
    if (providers) {
      for (const p of providers) {
        this.registerProvider(p);
      }
    }
  }

  registerProvider(provider: IProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): IProvider | undefined {
    return this.providers.get(id);
  }

  async classify(rawData: string): Promise<RawDataClassification> {
    if (typeof rawData !== 'string' || !rawData.trim()) {
      return {
        status: 'unrecognized',
        rawData: rawData || '',
        reason: 'raw_data_empty',
      };
    }

    for (const provider of this.providers.values()) {
      if (provider.canHandle(rawData)) {
        return {
          status: 'recognized',
          providerId: provider.id,
          rawData,
        };
      }
    }

    return {
      status: 'unrecognized',
      rawData,
      reason: 'no_matching_provider',
    };
  }
}
