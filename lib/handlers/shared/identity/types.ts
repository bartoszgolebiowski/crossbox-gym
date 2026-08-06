export interface IdentityProvider {
  ensureUser(userPoolId: string, email: string): Promise<string>;
}
