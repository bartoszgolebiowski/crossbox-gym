# Technical Specification: Automated Gym Platform (MVP)

> Technology-agnostic. Describes required behavior, not implementation.
> 
> This is the **MVP scope** — a single-tenant, single-gym-owner deployment focused on the core
> automated gym access loop. Multi-tenancy, hardware abstraction, and advanced admin features
> are deferred to v2.

## 1. Overview

- **Purpose:** Build a fully automated gym management system that eliminates the need for physical staff by automating the entire member lifecycle: membership purchase, registration, recurring billing, and physical door access control via dynamic QR codes in a PWA.
- **Business Model (MVP):** Direct B2C — one gym owner operates one or more locations. Multi-tenant SaaS B2B is a v2 goal.
- **Primary Goals:**
  - Zero manual staff intervention for serving individual members.
  - Gate response time ≤ 500ms (QR scan to lock release).
  - ≥ 95% recurring payment auto-renewal success rate.
  - 99.9% annual uptime for the entry verification API.

---

## 2. Actors & Roles

| Actor | Description | Permissions / What they can do |
|---|---|---|
| **Member (Customer)** | End-user gym member. Purchases membership, accesses the gym via PWA + QR code. | Purchase membership & manage payment card (via Stripe); generate personal entry QR code; view own subscription status; cancel own subscription; log in via email+password or Magic Link. |
| **Admin (Gym Owner)** | Single admin role combining owner and support duties. Seed account provisioned outside the system. | Search members by email; view member status and subscription dates; remote door unlock (requires written reason); manual status overrides (suspend account, extend grace period — requires written reason); manage locations and devices. |

### Actor Provisioning

- **Members:** Self-service via landing page → Stripe Checkout → automatic account creation.
- **Admin:** Seed account created during system setup. No self-service admin registration.

---

## 3. Functional Requirements

| ID | Requirement | Acceptance Criteria | Actor(s) |
|---|---|---|---|
| **FR-01** | Landing page displays gym information, pricing, FAQ, legal docs, location map, and a CTA to purchase membership. | Page shows single subscription tier with price (e.g., 100 PLN/month). CTA reads "Buy Membership – [price]/mo" at top and bottom. If multiple locations exist, a dropdown on the landing page lets the member select a location before clicking the CTA. The selected location is passed to Stripe Checkout as metadata. If only one location exists, no dropdown is shown. | Member |
| **FR-02** | Membership purchase via Stripe Hosted Checkout. | Checkout collects: email, card details, cardholder name. Mandatory consent checkbox: "I agree to automatic, recurring monthly charges of [price]/mo and accept the Terms of Sale." Checkout fails if consent unchecked. | Member |
| **FR-03** | Automatic account provisioning on successful payment. | On `checkout.session.completed` webhook: (1) create identity record with email as unique ID, (2) create Users record, (3) create Subscriptions record with status ACTIVE. If email already exists (returning EXPIRED member), reactivate existing account with new subscription. | System |
| **FR-04** | First-time login via Magic Link (Path A). | System sends welcome email with single-use Magic Link valid for 24 hours. Clicking opens PWA, authenticates member, and prompts mandatory password creation. | Member |
| **FR-05** | First-time login via instant post-checkout (Path B). | Post-checkout success page (`/welcome?session_id=...`) displays "Open PWA App" button. Uses single-use session token for immediate login. Prompts mandatory password creation. | Member |
| **FR-06** | Password is mandatory for all members. | First login (both Path A and Path B) requires setting a permanent password. After password is set, member can log in via email+password OR a new Magic Link. | Member |
| **FR-07** | Magic Link re-request from login screen. | Login screen has "Send Magic Link" button. Member enters email, receives new Magic Link. Rate-limited to 3 requests per email per hour. | Member |
| **FR-08** | Recurring billing via Stripe. | Stripe charges member's card on a calendar monthly cycle (anchored to subscription start date). Uses Stripe's default subscription billing behavior. | System |
| **FR-09** | Payment failure handling → PAST_DUE with 48h grace period. | On `invoice.payment_failed` webhook: status → PAST_DUE, grace period set to NOW() + 48h. Member retains gym access during grace period. Email notification sent. | System |
| **FR-10** | Grace period expiry → SUSPENDED. | If no successful payment within 48h: status → SUSPENDED, gym access blocked. Email notification sent. | System |
| **FR-11** | SUSPENDED reactivation via Stripe Customer Portal. | SUSPENDED member accesses Stripe Customer Portal via "Manage Subscription" tab in PWA. Updates card. On `invoice.paid` webhook: status → ACTIVE automatically. | Member |
| **FR-12** | Subscription cancellation. | Member clicks "Cancel Subscription" in Manage Subscription tab. System calls Stripe with `cancel_at_period_end = true`. Status → CANCELED. Member retains access until billing period end. Confirmation email sent. | Member |
| **FR-13** | PAST_DUE member can cancel. | If member cancels while in PAST_DUE: status → CANCELED. Access retained until billing period end. 48h grace period becomes irrelevant. | Member |
| **FR-14** | CANCELED → EXPIRED transition. | Stripe `customer.subscription.deleted` webhook triggers status → EXPIRED. Access denied. | System |
| **FR-15** | EXPIRED member reactivation. | EXPIRED members see the login screen with a "Reactivate Membership" link that redirects to the landing page checkout. On successful purchase, system matches by email and reactivates existing User record with new Subscription. | Member |
| **FR-16** | PWA login screen (unauthenticated). | Displays only: email field, password field, "Log In" button, "Send Magic Link" button. For EXPIRED members: additional "Reactivate Membership" link to landing page. No access to internal views. | Member |
| **FR-17** | PWA authenticated dashboard. | Status card with dynamic display per subscription status (see Business Rules). Navigation: "Manage Subscription" tab. "ENTER GYM" button (prominent). | Member |
| **FR-18** | Status-specific PWA display. | ACTIVE: green icon, "Membership Active," next billing date. PAST_DUE: yellow warning, "Payment Error. Update Card! Remaining: [countdown]." SUSPENDED: red icon, "Account Inactive. Access Denied," all tabs accessible, "ENTER GYM" disabled. CANCELED: gray, "Subscription expires on [date]." EXPIRED: redirected to login screen with reactivation link. | Member |
| **FR-19** | GDPR/Safety consent modal on first PWA launch. | Non-dismissible modal with gym regulations and safety guidelines text. Mandatory checkbox: "I confirm that I have read and agree to the Gym Regulations and Safety Guidelines." "ENTER GYM" button disabled until consent given. Consent captured once — not re-prompted on regulation updates. | Member |
| **FR-20** | Consent audit record. | System records: `terms_accepted_at` (UTC), `terms_version` (e.g., "v1.0"), member IP address. | System |
| **FR-21** | QR code generation with location selection. | If multiple locations exist, member selects from dropdown. Clicking "ENTER GYM" generates dynamic QR code. QR payload: `{user_id, location_id, timestamp, HMAC-SHA256 signature}`. TTL: exactly 20 seconds. Visual countdown bar shows remaining validity. | Member |
| **FR-22** | Entry verification chain (ordered). | When scanner reads QR and transmits to backend API, execute in order: (1) Technical QR verification — TTL ≤ 20s and HMAC signature valid → else deny EXPIRED_TOKEN. (2) License status check — status is ACTIVE or PAST_DUE → else deny NO_ACTIVE_LICENSE. (3) Anti-passback — no successful entry for same user at same location within 15 min → else deny COOL_DOWN_ACTIVE. (4) All pass → send 5-second unlock command to lock relay, set 15-min cooldown. | System |
| **FR-23** | Post-scan confirmation (PWA). | After scanning, PWA displays modal: "Did the door unlock?" YES: close modal, log successful entry, return to dashboard. NO: close modal, member generates a new QR code. | Member |
| **FR-24** | PWA denial feedback (specific reasons). | On entry denial, PWA displays specific message: EXPIRED_TOKEN → "QR expired, generate a new one." NO_ACTIVE_LICENSE → "Your membership is inactive." COOL_DOWN_ACTIVE → "Entry recently recorded, try again in X min." | Member |
| **FR-25** | Anti-passback (15-minute cooldown). | 15 minutes from successful scan timestamp. Scoped to `location_id`. Scanner feedback: red light / error chime. PWA displays remaining cooldown time. | System |
| **FR-26** | Manage Subscription tab. | Button that creates a Stripe Customer Portal session (via backend API) with `return_url` set to the PWA dashboard URL, and opens the portal URL in a new tab. After the member finishes in the portal, Stripe redirects back to the PWA automatically. Member manages card and cancels subscription within Stripe Portal. Receipts accessible via Stripe-hosted receipt URLs. | Member |
| **FR-27** | PWA session management. | Sessions expire after 30 days of inactivity. After expiry, member must re-authenticate. | Member |
| **FR-28** | Internet outage behavior. | During connectivity loss, door remains in its last commanded state (open or locked). No new entries are processed until connectivity is restored. No local cache or offline mode. | System |
| **FR-29** | Admin Panel — location management. | Admin can add/edit/remove locations. Location fields: name, address, assigned devices. All locations operate 24/7 in MVP. | Admin |
| **FR-30** | Admin Panel — device management. | Admin can add/edit/remove devices at a location. Device fields: name, type (lock or scanner), connection parameters, API key (auto-generated unique key per device), location assignment, online/offline status. One lock integration type and one scanner integration type for MVP. Each device authenticates to the backend API via its unique API key sent as a request header. | Admin |
| **FR-31** | Admin Panel — member search. | Search members by email (exact or partial match). Email-only search, no browsable member list. | Admin |
| **FR-32** | Admin Panel — member detail view. | View: email, subscription status, subscription start date, current period end date, grace period end (if applicable). | Admin |
| **FR-33** | Admin Panel — manual status overrides. | "Suspend Account" button: transitions member to SUSPENDED. "Extend Grace Period" button: admin enters custom hours (max 168h / 7 days). Both require mandatory reason field (min 10 chars). Both logged to AuditLogs. | Admin |
| **FR-34** | Admin Panel — remote door unlock. | "REMOTE UNLOCK DOOR" button next to each lock device. Opens modal: mandatory reason field (min 10 chars). Confirmation button disabled until valid reason entered. On confirm: sends 5-second unlock command. Logged to AuditLogs: admin ID, device ID, reason, UTC timestamp, IP address. | Admin |
| **FR-35** | Admin authentication. | Admin authenticates via email + password. Same identity system as members, with admin role flag. No 2FA for MVP. | Admin |
| **FR-36** | HMAC key rotation. | Manual operation triggered by Admin. No automatic rotation for MVP. Admin Panel shows confirmation dialog before rotating: "Rotating the key will invalidate any QR codes generated more than 20 seconds ago. Proceed?" On confirmation, previous key remains valid for 20 seconds (matching QR TTL) to avoid invalidating in-flight codes. | Admin |

---

## 4. Business Rules

- **BR-01: Subscription State Machine.** Valid states: ACTIVE, PAST_DUE, SUSPENDED, CANCELED, EXPIRED. Transitions:
  - No Account → ACTIVE: successful Stripe Checkout payment.
  - ACTIVE → PAST_DUE: recurring payment failure (`invoice.payment_failed` webhook).
  - PAST_DUE → ACTIVE: successful payment within 48h grace period.
  - PAST_DUE → SUSPENDED: no payment after 48h grace period.
  - PAST_DUE → CANCELED: member cancels while in PAST_DUE (grace period becomes irrelevant).
  - SUSPENDED → ACTIVE: card update + successful payment via Stripe Customer Portal (`invoice.paid` webhook).
  - ACTIVE → CANCELED: member cancels (`cancel_at_period_end = true`).
  - CANCELED → EXPIRED: billing period ends (`customer.subscription.deleted` webhook).
  - EXPIRED → ACTIVE: member reactivates via landing page Stripe Checkout (new subscription linked by email).

- **BR-02: Gym Access Rules by Status.**
  - ACTIVE: access granted.
  - PAST_DUE: access granted (for up to 48h).
  - SUSPENDED: access denied.
  - CANCELED: access granted (until billing period end).
  - EXPIRED: access denied.

- **BR-03: Anti-Passback Rule.** 15-minute cooldown per user per location after successful entry.

- **BR-04: QR Code Validity.** TTL = exactly 20 seconds. HMAC-SHA256 signed. Payload: `{user_id, location_id, timestamp, signature}`.

- **BR-05: Grace Period Duration.** Default: 48 hours from payment failure. Can be extended by admin (custom hours, max 168h). Extension requires documented reason.

- **BR-06: Membership Scope.** A membership grants access to all locations. Members select a specific location before generating a QR code (if multiple locations exist).

- **BR-07: Billing Cycle.** Calendar monthly, anchored to subscription start date. Uses Stripe's default subscription billing behavior.

- **BR-08: Rate Limits.**
  - Magic Link requests: max 3 per email per hour.

- **BR-09: Lock Relay Duration.** Unlock command releases lock for 5 seconds (both member entry and remote unlock).

- **BR-10: Consent.** Captured once on first PWA launch. Not re-prompted on regulation version updates.

---

## 5. Data Entities

| Entity | Key Attributes | Created by | Read by | Updated by | Deleted by | Retention |
|---|---|---|---|---|---|---|
| **Location** | location_id, name, address, created_at | Admin | Admin, Members (for location selection) | Admin | Admin | Indefinite |
| **Device** | device_id, location_id, name, type (lock/scanner), connection_params, status (online/offline) | Admin | Admin | Admin, System (status updates) | Admin | Indefinite |
| **User** | user_id, email, role (member/admin), terms_accepted_at, terms_version, terms_ip, created_at | System (on checkout) / seed (admin) | Member (own), Admin (search) | System, Admin (status override) | N/A (not deleted) | Indefinite |
| **Subscription** | subscription_id, user_id, stripe_subscription_id, status, grace_period_end, current_period_end, created_at, updated_at | System (on checkout) | Member (own), Admin | System (webhooks), Admin (overrides) | N/A | Indefinite |
| **EntryLog** | entry_id, user_id, location_id, timestamp, result (success/denied), denial_reason, device_id | System | Admin | N/A (immutable) | System (auto-purge) | **12 months** |
| **AuditLog** | audit_id, admin_id, action_type, target_entity, target_id, reason, ip_address, timestamp | System | Admin | N/A (immutable) | N/A | Indefinite |
| **ConsentRecord** | consent_id, user_id, terms_accepted_at, terms_version, ip_address | System (on consent) | Admin | N/A (immutable) | N/A | Indefinite |

---

## 6. Workflows / User Flows

### Flow 1: New Member Purchase & Onboarding

1. Member visits landing page.
2. Member clicks "Buy Membership" CTA.
3. If multiple locations exist, member selects location during checkout.
4. Stripe Hosted Checkout form collects: email, card details, cardholder name.
5. Member checks recurring payment consent checkbox.
6. Stripe processes payment.
7. On success: `checkout.session.completed` webhook fires.
8. System creates identity record (email as unique ID).
9. System creates User record.
10. System creates Subscription record (status: ACTIVE).
11. System sends welcome email with Magic Link (valid 24h).
12. Post-checkout success page displays "Open PWA App" button (Path B: instant login via session token).
13. Member opens PWA (via Path A Magic Link or Path B instant button).
14. Member is prompted to set a permanent password (mandatory).
15. GDPR/Safety consent modal appears (non-dismissible).
16. Member checks consent checkbox → consent recorded.
17. "ENTER GYM" button becomes enabled.

- **Error: Payment fails at checkout** → Stripe displays error. No account created.
- **Error: Magic Link expired (>24h)** → Member requests new one from login screen (FR-07, max 3/hr).
- **Error: Email typo** → Member contacts support. Admin fixes email manually in Stripe + identity system. *(Self-service typo recovery deferred to v2.)*

### Flow 2: Daily Gym Entry

1. Member opens PWA (logged in, session valid for 30 days of inactivity).
2. Member views dashboard with status card.
3. If multiple locations exist, member selects location from dropdown.
4. Member taps "ENTER GYM" button.
5. QR code generates with `{user_id, location_id, timestamp, HMAC signature}`, 20s TTL.
6. Visual countdown bar displays remaining validity.
7. Member presents QR to scanner at gym door.
8. Scanner reads QR, transmits payload + scanner device_id to backend API.
9. Backend executes verification chain (FR-22): QR validity → license status → anti-passback.
10. All checks pass → backend sends 5-second unlock command to lock relay, sets 15-min cooldown.
11. Scanner shows green light / short chime.
12. PWA displays "Did the door unlock?" modal.
13. Member taps "YES" → entry logged, modal closes, return to dashboard.

- **Error: QR expired** → PWA shows "QR expired, generate a new one." Member generates new QR.
- **Error: Inactive membership** → PWA shows "Your membership is inactive."
- **Error: Anti-passback** → PWA shows "Entry recently recorded, try again in X min." Scanner shows red light / long chime.
- **Error: Door didn't open** → Member taps "NO" → modal closes. Member generates a new QR code and tries again.

### Flow 3: Payment Failure & Grace Period

1. Stripe attempts recurring charge → fails.
2. `invoice.payment_failed` webhook fires.
3. System transitions status to PAST_DUE, sets grace_period_end = NOW() + 48h.
4. Email notification: "Payment failed. 48 hours to update card."
5. PWA shows yellow warning with countdown timer.
6. Member still has gym access during grace period.
7. **Path A: Member updates card via Stripe Customer Portal** → Stripe retries charge → success → `invoice.paid` webhook → status → ACTIVE.
8. **Path B: 48h expires without payment** → System transitions to SUSPENDED. Email notification sent. Access blocked.

- **Edge case: Member cancels while PAST_DUE** → Status → CANCELED. Access until period end. Grace period irrelevant.

### Flow 4: Subscription Cancellation

1. Member opens "Manage Subscription" tab in PWA.
2. PWA calls backend → backend creates Stripe Customer Portal session → returns URL.
3. PWA opens Stripe Portal in new tab.
4. Member cancels subscription in Stripe Portal.
5. Stripe sets `cancel_at_period_end = true`.
6. System receives webhook → status → CANCELED.
7. Cancellation confirmation email sent.
8. PWA shows gray status: "Subscription expires on [date]."
9. Member retains gym access until billing period end.
10. On period end: Stripe fires `customer.subscription.deleted` webhook → status → EXPIRED.

### Flow 5: EXPIRED Member Reactivation

1. EXPIRED member visits login screen.
2. "Reactivate Membership" link visible, pointing to landing page.
3. Member clicks link → redirected to landing page checkout.
4. Successful payment → `checkout.session.completed` webhook → system matches by email → reactivates existing User record → creates new Subscription (ACTIVE).
5. Member logs in via Magic Link or existing password.

### Flow 6: Remote Door Unlock (Emergency)

1. Member contacts support (e.g., phone dead at door).
2. Admin opens Admin Panel.
3. Navigates to device list for the relevant location.
4. Clicks "REMOTE UNLOCK DOOR" next to the door's lock device.
5. Modal opens: mandatory reason text field (min 10 chars).
6. Admin enters reason (e.g., "Member Jane Doe – dead phone battery at main entrance").
7. Confirmation button becomes enabled.
8. Admin clicks confirm → API sends 5-second unlock command.
9. AuditLog entry created: admin_id, device_id, reason, UTC timestamp, IP address.

### Flow 7: Admin Manual Status Override

1. Admin searches for member by email (FR-31).
2. Opens member detail view.
3. **Suspend Account:** Clicks "Suspend" → enters reason (min 10 chars) → confirms → status → SUSPENDED. Logged to AuditLogs.
4. **Extend Grace Period:** Clicks "Extend Grace Period" → enters custom hours (1–168) → enters reason (min 10 chars) → confirms → grace_period_end updated. Logged to AuditLogs.

---

## 7. Non-Functional Requirements

- **Performance:** QR scan to lock relay signal ≤ 500ms end-to-end.
- **Availability:** 99.9% annual uptime for the entry verification API.
- **Payment Success Rate:** ≥ 95% recurring payments processed without error.
- **Payment Security:** Credit card details never touch application servers. All payment processing handled by Stripe (PCI DSS Level 1).
- **Communication Encryption:** All network traffic via HTTPS (TLS 1.3).
- **QR Security:** HMAC-SHA256 signatures with manually rotated secret keys.
- **Data Retention:** Entry logs auto-purged after 12 months. All other data retained indefinitely.
- **Session Policy:** PWA sessions expire after 30 days of inactivity.
- **Audit/Logging (optional):** AuditLogs table captures privileged admin actions. Nice-to-have for MVP but recommended.

---

## 8. Scope

### In Scope (MVP)

- Single-tenant deployment (one gym owner, one or more locations, all 24/7).
- Landing page → Stripe Checkout → automatic account creation (with location selection if multiple locations).
- Magic Link + password authentication for members (password mandatory on first login).
- PWA: login, dashboard, status card, QR generation (with location selection), "Manage Subscription" (Stripe Portal link).
- Dynamic QR code generation (20s TTL, HMAC-SHA256, location-aware payload).
- Entry verification chain: QR validity → license status → anti-passback → unlock.
- Post-scan confirmation modal (YES/NO, no Quick Retry).
- Specific denial reasons displayed in PWA (3 types: expired token, inactive license, cooldown).
- Subscription state machine (ACTIVE → PAST_DUE → SUSPENDED, ACTIVE → CANCELED → EXPIRED, with reactivation paths).
- SUSPENDED reactivation via Stripe Customer Portal.
- EXPIRED reactivation via landing page re-purchase.
- 48h grace period (extendable by admin, max 7 days).
- Anti-passback (15-min cooldown per user per location).
- GDPR/Safety consent modal (one-time).
- Admin Panel: location management, device management, member search (email only), member detail (status + dates), remote unlock (with reason + audit), manual status overrides (with reason + audit).
- 2 roles: Member + Admin.
- 5 email notification types: welcome/magic link, payment failed, suspended, canceled confirmation, renewal success.
- One lock integration type, one scanner integration type (hardcoded).
- Manual HMAC key rotation (Admin).
- Receipts via Stripe-hosted receipt URLs (no custom PDFs).
- Internet outage: door stays in last commanded state, no new entries.

### Out of Scope (MVP → v2+)

- **Multi-tenancy** (tenant hierarchy, tenant_id isolation, per-tenant pricing, Tenant Admin role, Support Operator role).
- **Hardware Abstraction Layer** (multiple lock/scanner profiles, device profile dropdown).
- **Self-service email typo recovery** (BIN+last4 form, Stripe querying, rate limiting).
- **System-generated PDF receipts** with gym branding.
- **Daily reconciliation job** for missed Stripe webhooks.
- **Operating hours enforcement** (all locations 24/7 for MVP).
- **Quick Retry mechanism** ("NO" button re-sending unlock within TTL).
- **Forgot Password flow** (Magic Links cover re-authentication).
- **Grace period reminder email** (24h before expiry).
- **Entry History tab** in PWA (member-facing).
- **My Payments tab** in PWA (member uses Stripe Portal for receipts).
- **EXPIRED read-only dashboard** (EXPIRED members redirected to login + reactivation link).
- **Admin billing history / access log views** per member.
- **Browsable/filterable member list** in Admin Panel.
- **Two-factor authentication** for any role.
- **Custom-branded landing pages** per tenant.
- **Mobile native apps** (PWA only).
- **Analytics / reporting dashboards.**
- **Automated HMAC key rotation.**
- **Re-consent flow** on regulation version updates.
- **Multiple pricing tiers.**

---

## 9. Open Questions (remaining)

| # | Question | Impact |
|---|---|---|
| 1 | **Lock and scanner model selection:** Which specific lock relay model (e.g., Shelly Pro 1) and QR scanner model (e.g., ZKBio QR500) will be used for the MVP's single hardware integration? | Determines the integration protocol to implement. Must be decided before the architecture phase begins. |

---

## 10. Resolved Ambiguities Log

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | How are new Tenants (gym owners) onboarded? | Manual creation by Super Admin. No self-service B2B signup. MVP simplifies to single-tenant. | Eliminated tenant provisioning flow. |
| 2 | How does offline entry work during internet outage? | Door remains in last commanded state. No new entries until connectivity restored. | No local cache needed. |
| 3 | Who triggers CANCELED → EXPIRED transition? | Stripe `customer.subscription.deleted` webhook. Daily reconciliation deferred to v2. | Simplified to webhook-only. |
| 4 | How does a SUSPENDED member reactivate? | Via Stripe Customer Portal. On successful payment (`invoice.paid` webhook), auto-transition to ACTIVE. | Uses existing Stripe Portal integration. |
| 5 | Can a PAST_DUE member cancel? | Yes. Transitions to CANCELED; access until period end. Grace period irrelevant. | Added PAST_DUE → CANCELED transition. |
| 6 | Can expired Magic Links be re-requested? | Yes, via "Send Magic Link" on login screen. Max 3 per email per hour. | Added rate limit. |
| 7 | Are operating hours enforced for entry? | Yes in full spec, but deferred to v2 for MVP. All locations 24/7 in MVP. | Removed verification step from entry chain. |
| 8 | Is there rate limiting on typo recovery? | Max 5 attempts per IP per hour. Entire feature deferred to v2. | N/A for MVP. |
| 9 | How much entry history does a member see? | Last 30 entries. Entry History tab deferred to v2. | Admin can still view access logs. |
| 10 | Who creates Support Operators? | Super Admin. Role deferred to v2 (single Admin role for MVP). | Simplified to 2 roles. |
| 11 | Do manual status overrides require a reason? | Yes. Min 10 chars. Logged to AuditLogs. | Kept in MVP. |
| 12 | How much can grace period be extended? | Custom hours, max 168h (7 days). | Kept in MVP. |
| 13 | Are receipts from Stripe or system-generated? | System-generated PDFs deferred to v2. MVP uses Stripe-hosted receipt URLs. | Eliminated PDF generation. |
| 14 | Can each tenant set their own price? | Yes, but multi-tenancy deferred. MVP: single fixed price configured by admin in Stripe. | Simplified pricing. |
| 15 | Single landing page or per-tenant? | Single landing page. Multi-tenant landing deferred to v2. | Simplified frontend. |
| 16 | Is membership location-bound or tenant-wide? | All locations accessible. MVP: all locations under one owner. | Simplified access check. |
| 17 | What data is in the QR payload? | `{user_id, location_id, timestamp, HMAC signature}`. Tenant_id removed for MVP (single-tenant). | Simplified QR payload. |
| 18 | Re-consent on regulation updates? | No. One-time consent. Email notification only for updates. | Simplified consent flow. |
| 19 | Is password mandatory? | Yes. Set during first login. Then email+password or Magic Link. | Kept in MVP. |
| 20 | Specific or generic denial reasons in PWA? | Specific reasons per denial type. | Kept in MVP (3 denial types). |
| 21 | Billing every 30 days or calendar monthly? | Calendar monthly (Stripe default). | Kept. |
| 22 | How does EXPIRED member reactivate? | MVP: login screen with "Reactivate" link to landing page. No read-only dashboard. | Simplified EXPIRED flow. |
| 23 | HMAC key rotation frequency? | Manual by admin. No auto-rotation for MVP. | Kept. |
| 24 | What do SUSPENDED members see in PWA? | All tabs visible, "ENTER GYM" disabled. | Kept. |
| 25 | Email notifications in scope? | MVP: 5 types (welcome, payment failed, suspended, canceled, renewal success). Reduced from 8. | Cut 3 notification types. |
| 26 | Admin member search: email-only or list? | Email-only (exact or partial). | Kept. |
| 27 | Separate "generated tokens" view? | No. Removed from scope. | N/A. |
| 28 | Location selection before QR? | Yes, dropdown if multiple locations. | Kept. |
| 29 | Quick Retry mechanism? | Deferred to v2. Member generates new QR if door didn't open. | Simplified post-scan flow. |
| 30 | PWA session duration? | 30 days of inactivity. | Kept. |
| 31 | Admin authentication? | Email + password. No 2FA for MVP. | Kept. |
| 32 | Entry log retention? | 12 months, auto-purged. | Kept. |
| 33 | Forgot Password flow? | Deferred to v2. Magic Links cover re-authentication. | Simplified auth flows. |
| 34 | Scanner-to-backend authentication? | API key per device. Each device gets a unique key stored in the Device record, sent as a header with every request. | Added to FR-30 device fields. |
| 35 | Stripe Portal return flow? | Use Stripe's `return_url` parameter set to PWA dashboard URL. Automatic redirect after member finishes. | Added to FR-26. |
| 36 | Checkout location selection UX? | Dropdown on the landing page before CTA click. Selected location passed to Stripe Checkout as metadata. If single location, no dropdown. | Added to FR-01. |
| 37 | HMAC key rotation UX? | Confirmation dialog shown: "Rotating the key will invalidate any QR codes generated more than 20 seconds ago. Proceed?" | Added to FR-36. |
