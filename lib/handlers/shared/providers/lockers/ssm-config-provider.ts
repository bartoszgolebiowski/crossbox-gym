import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

export interface LockerConfig {
  endpoint: string;
  lockerThingName: string;
}

export interface ILockerConfigProvider {
  getConfig(): Promise<LockerConfig>;
}

export interface SsmLockerConfigOptions {
  endpointParameterName: string;
  lockerThingNameParameterName: string;
  fallbackConfig: LockerConfig;
}

export class SsmLockerConfigProvider implements ILockerConfigProvider {
  private ssm?: SSMClient;
  private cachedConfig?: LockerConfig;

  constructor(private readonly options: SsmLockerConfigOptions) {}

  async getConfig(): Promise<LockerConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      if (!this.ssm) {
        this.ssm = new SSMClient({});
      }

      const res = await this.ssm.send(
        new GetParametersCommand({
          Names: [this.options.endpointParameterName, this.options.lockerThingNameParameterName],
          WithDecryption: false,
        })
      );

      const map = new Map<string, string>();
      for (const p of res.Parameters || []) {
        if (p.Name && p.Value) {
          map.set(p.Name, p.Value);
        }
      }

      const endpoint = map.get(this.options.endpointParameterName) || this.options.fallbackConfig.endpoint;
      const lockerThingName =
        map.get(this.options.lockerThingNameParameterName) || this.options.fallbackConfig.lockerThingName;

      this.cachedConfig = { endpoint, lockerThingName };
      return this.cachedConfig;
    } catch (err) {
      console.warn('[SsmLockerConfigProvider] Failed to fetch SSM parameters, using configured fallback:', err);
      this.cachedConfig = this.options.fallbackConfig;
      return this.cachedConfig;
    }
  }
}
