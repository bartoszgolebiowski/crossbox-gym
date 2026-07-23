// User item (PK=USER#<id>, SK=PROFILE)
export interface UserItem {
  PK: string;
  SK: string;
  email: string;
  cognito_sub: string;
  role: 'member' | 'admin';
  terms_accepted_at?: string;
  terms_version?: string;
  terms_ip?: string;
  password_set: boolean;
  created_at: string;
  // GSI attributes
  GSI1PK?: string;
  GSI1SK?: string;
}

// Subscription item (PK=USER#<id>, SK=SUB#<sub_id>)
export interface SubscriptionItem {
  PK: string;
  SK: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  grace_period_end?: string;
  current_period_end?: string;
  created_at: string;
  updated_at: string;
  // GSI attributes
  GSI1PK?: string;
  GSI1SK?: string;
}

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED' | 'EXPIRED';

// Location item (PK=LOC#<id>, SK=METADATA)
export interface LocationItem {
  PK: string;
  SK: string;
  name: string;
  address: string;
  created_at: string;
  GSI1PK: string;  // LOCATIONS
  GSI1SK: string;  // LOC#<id>
}

// Device item (PK=LOC#<id>, SK=DEV#<device_id>)
export interface DeviceItem {
  PK: string;
  SK: string;
  device_id: string;
  name: string;
  type: 'lock' | 'scanner';
  connection_params: { ip: string; port?: number; path?: string };
  api_key_hash: string;
  status: 'active' | 'inactive';
  created_at: string;
}

// ConsentRecord (PK=USER#<id>, SK=CONSENT#<timestamp>)
export interface ConsentRecord {
  PK: string;
  SK: string;
  terms_version: string;
  ip_address: string;
}

// MagicLinkToken (PK=TOKEN#<hash>, SK=TOKEN)
export interface MagicLinkToken {
  PK: string;
  SK: string;
  user_id: string;
  created_at: string;
  ttl: number;
}

// MagicLinkRateLimit (PK=RATELIMIT#<email>, SK=RATELIMIT)
export interface MagicLinkRateLimit {
  PK: string;
  SK: string;
  request_count: number;
  window_start: string;
  ttl: number;
}

// Config item (PK=CONFIG#<key>, SK=CONFIG)
export interface ConfigItem {
  PK: string;
  SK: string;
  value: string;
}

// EntryLog item (PK=USER#<id>, SK=ENTRY#<timestamp>#<id>)
export interface EntryLogItem {
  PK: string;
  SK: string;
  entry_id: string;
  user_id: string;
  location_id: string;
  timestamp: string;
  result: 'success' | 'denied';
  denial_reason?: string;
  device_id: string;
  ttl: number;
  // AntiPassbackIndex GSI
  AntiPassbackPK: string;  // USER#<id>#LOC#<loc_id>
}

// AuditLog item
export interface AuditLogItem {
  PK: string;  // AUDIT#<admin_id>
  SK: string;  // <timestamp>#<audit_id>
  audit_id: string;
  admin_id: string;
  action_type: 'remote_unlock' | 'suspend_account' | 'extend_grace' | 'hmac_rotation';
  target_entity?: string;
  target_id?: string;
  reason?: string;
  ip_address?: string;
  timestamp: string;
}
