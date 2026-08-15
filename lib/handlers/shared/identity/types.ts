export interface EnsureUserResult {
  sub: string;
  created: boolean;
}

export interface IdentityProvider {
  ensureUser(userPoolId: string, email: string): Promise<EnsureUserResult | string>;
}
