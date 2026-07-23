export interface EmailProvider {
  sendEmail(params: { to: string; subject: string; body: string; from: string }): Promise<void>;
}

export interface PaymentProvider {
  createCheckoutSession(params: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }): Promise<{ url: string }>;
  
  createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  
  constructWebhookEvent(payload: string, signature: string): Promise<any>;
}

export interface LockProvider {
  sendUnlockCommand(params: { ip: string; port?: number; path?: string; durationSeconds: number }): Promise<void>;
}
