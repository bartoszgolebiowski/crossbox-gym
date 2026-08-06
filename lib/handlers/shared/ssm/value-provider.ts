import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  SSM_IOT_ENDPOINT_PARAM,
  SSM_LOCKER_THING_NAME_PARAM,
  SSM_PATH_STRIPE_SECRET_KEY,
  SSM_SCANNER_THING_NAME_PARAM,
} from '../../../config';

export interface ISsmValueProvider {
  get(): Promise<string>;
}

type SsmSender = Pick<SSMClient, 'send'>;

interface SsmValueProviderOptions {
  fallbackValue?: string;
  ssm?: SsmSender;
}

abstract class CachedSsmValueProvider implements ISsmValueProvider {
  private ssm?: SsmSender;
  private cachedValue?: string;

  protected constructor(
    private readonly parameterName: string,
    private readonly withDecryption: boolean,
    options: SsmValueProviderOptions = {}
  ) {
    this.ssm = options.ssm;
    this.cachedValue = undefined;
    this.fallbackValue = options.fallbackValue;
  }

  private readonly fallbackValue?: string;

  async get(): Promise<string> {
    if (this.cachedValue !== undefined) {
      return this.cachedValue;
    }

    try {
      if (!this.ssm) {
        this.ssm = new SSMClient({});
      }

      const response = await this.ssm.send(
        new GetParameterCommand({
          Name: this.parameterName,
          WithDecryption: this.withDecryption,
        })
      );

      const value = response.Parameter?.Value;
      if (value) {
        this.cachedValue = value;
        return value;
      }
    } catch (error) {
      if (this.fallbackValue !== undefined) {
        console.warn(
          `[${this.constructor.name}] Failed to fetch SSM parameter ${this.parameterName}, using fallback`,
          error
        );
        this.cachedValue = this.fallbackValue;
        return this.cachedValue;
      }

      throw error;
    }

    if (this.fallbackValue !== undefined) {
      this.cachedValue = this.fallbackValue;
      return this.cachedValue;
    }

    throw new Error(`Missing SSM parameter value for ${this.parameterName}`);
  }
}

export class SsmIotEndpointProvider extends CachedSsmValueProvider {
  constructor(options: SsmValueProviderOptions = {}) {
    super(SSM_IOT_ENDPOINT_PARAM, false, options);
  }
}

export class SsmLockerThingNameProvider extends CachedSsmValueProvider {
  constructor(options: SsmValueProviderOptions = {}) {
    super(SSM_LOCKER_THING_NAME_PARAM, false, options);
  }
}

export class SsmScannerThingNameProvider extends CachedSsmValueProvider {
  constructor(options: SsmValueProviderOptions = {}) {
    super(SSM_SCANNER_THING_NAME_PARAM, false, options);
  }
}

export class SsmStripeSecretKeyProvider extends CachedSsmValueProvider {
  constructor(options: SsmValueProviderOptions = {}) {
    super(SSM_PATH_STRIPE_SECRET_KEY, true, options);
  }
}

export type { SsmValueProviderOptions };
