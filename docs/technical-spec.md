# Technical Specification: Frictionless Post-Purchase Customer Onboarding

> Technology-agnostic. Describes required behavior, business rules, and user flows — not implementation details.

## 1. Overview
- **Purpose / Problem Being Solved**: Eliminate friction during checkout by removing upfront account registration and password creation. Customers complete payment using only their payment details, and account activation is handled seamlessly post-purchase via email.
- **Primary Goals**:
  1. Increase checkout conversion by reducing checkout form fields to payment information only.
  2. Provide automated background account provisioning upon successful payment.
  3. Ensure verified customer identity via the payment transaction mechanism.
  4. Enable 1-click email activation leading to password creation and immediate automatic login to the customer dashboard.

---

## 2. Actors & Roles

| Actor | Description | Permissions / What they can do |
|---|---|---|
| **Guest Checkout Customer** | A customer making a purchase without an existing account. | Completes checkout with email & payment details; receives post-purchase activation email. |
| **Existing Customer** | A customer with an established active or inactive account. | Completes new purchases without receiving redundant activation emails; subscription attaches directly to their profile. |
| **Unactivated Customer** | A customer whose account was provisioned via payment but has not set a password. | Cannot log in via normal password form until activation link is verified; can request fresh activation email. |
| **Active Customer** | A customer who has completed password setup and agreement acceptance. | Can log in, access member portal, manage subscriptions, and view QR pass/invoices. |

---

## 3. Functional Requirements

| ID | Requirement | Acceptance Criteria | Actor(s) |
|---|---|---|---|
| **FR-01** | Post-Purchase Account Provisioning | Upon payment approval, if no profile exists for the email, create an account record in `UNACTIVATED` state and attach the active subscription. | Guest Checkout Customer |
| **FR-02** | Welcome & Activation Email | Immediately after provisioning a new account, dispatch a welcome email containing a secure 48-hour activation link. | Guest Checkout Customer |
| **FR-03** | Existing Customer Attachment | If payment email matches an existing account, attach the subscription/purchase directly without sending an activation link or email. | Existing Customer |
| **FR-04** | Activation Link Verification | Clicking the activation link verifies token validity and expiration (48 hours). Valid tokens render the password setup screen with pre-filled email. | Unactivated Customer |
| **FR-05** | Password Creation & Legal Terms Acceptance | Customer enters a new password (min 8 chars) and accepts Club Regulations. Upon submission, set password, mark account `ACTIVE`, and invalidate token immediately. | Unactivated Customer |
| **FR-06** | Automatic Login | Successful password creation immediately returns authentication session tokens (JWT) and redirects the user to their active dashboard without manual re-login. | Unactivated Customer |
| **FR-07** | Unclaimed Account Login Interception | Attempting standard password login on an `UNACTIVATED` account displays an inbox verification prompt and automatically sends a fresh 48h activation link. | Unactivated Customer |
| **FR-08** | Expired Link Handling | Clicking an expired activation link displays an error message informing the user that a fresh activation link has been sent to their inbox. | Unactivated Customer |

---

## 4. Business Rules

- **Rule 1: Activation Link Expiration**:
  - *Condition*: Token age > 48 hours (172,800 seconds).
  - *Result*: Token is rejected as EXPIRED. Attempting to use it triggers automatic dispatch of a new 48-hour token email.

- **Rule 2: Single-Use Token Invalidation**:
  - *Condition*: Password setup form successfully submitted with valid token.
  - *Result*: Token is permanently invalidated/deleted to prevent replay attacks.

- **Rule 3: Existing Account Attachment Bypass**:
  - *Condition*: Stripe checkout completed for an email already present in the user directory.
  - *Result*: Skip user registration and skip activation email dispatch. Attach subscription item directly to existing customer profile.

- **Rule 4: Mandatory Terms Acceptance**:
  - *Condition*: User submits password setup form.
  - *Result*: Form submission requires explicit checkbox acceptance of Club Regulations & Privacy Policy.

---

## 5. Data Entities

| Entity | Attributes | Created by | Read by | Updated by | Deleted by | Retention |
|---|---|---|---|---|---|---|
| **UserProfile** | `user_id`, `email`, `role`, `status` (`UNACTIVATED` / `ACTIVE`), `created_at` | Payment Webhook | Auth Handler, Admin | Auth Handler (on password set) | System Admin | Permanent |
| **Subscription** | `subscription_id`, `user_id`, `status`, `stripe_customer_id`, `created_at` | Payment Webhook | Member Handler, Admin | Payment Webhook, Admin | System Admin | Permanent |
| **ActivationToken**| `token_hash`, `email`, `expires_at` (TTL = 48h) | Payment Webhook, Auth Handler | Auth Handler | Auth Handler | Auth Handler / TTL cleanup | 48 hours |

---

## 6. Workflows / User Flows

### Flow 1: New Customer Post-Purchase Activation
1. Customer purchases membership via Stripe Checkout using `newuser@example.com`.
2. Payment Webhook receives `checkout.session.completed` event.
3. System checks if `newuser@example.com` exists. No existing profile found.
4. System creates `UserProfile` (`status=UNACTIVATED`) and `Subscription` (`status=ACTIVE`).
5. System generates 48-hour secure token, stores token hash, and sends Welcome Email with activation link (`/auth/magic-link/verify?token=...&email=...`).
6. Customer opens email and clicks activation link.
7. Frontend opens setup view, validates token via backend `GET /auth/magic-link/verify`.
8. Customer enters new password, checks Terms & Conditions, and submits form.
9. System sets permanent password, marks `UserProfile` status as `ACTIVE`, invalidates activation token, and issues authentication JWT tokens.
10. Customer is automatically logged in and redirected to their active Member Dashboard.

- **Error/Edge Cases**:
  - *Invalid/Expired Token*: System displays notification that link expired, generates new token, and emails fresh link to customer.
  - *Password < 8 characters*: Form validation displays error prompt asking for minimum 8 characters.

---

### Flow 2: Existing Customer Purchase
1. Customer purchases membership using `existing@example.com`.
2. Payment Webhook receives `checkout.session.completed` event.
3. System checks if `existing@example.com` exists. Profile found.
4. System attaches new `Subscription` to existing `UserProfile`.
5. No activation email or token is generated.

---

### Flow 3: Unclaimed Account Standard Login Attempt
1. Unactivated customer attempts standard login at `/auth/login` using email & password.
2. System detects user status is `UNACTIVATED` or password not set.
3. System automatically generates a fresh 48-hour activation token and emails a new link.
4. System displays friendly message: *"Konto wymaga aktywacji. Wyłaliśmy świeży link aktywacyjny na Twój adres e-mail."*

---

## 7. Non-Functional Requirements
- **Performance / Scale**: Activation link verification and password setup must complete in < 500ms.
- **Availability**: High availability for post-purchase webhook handling and activation URL endpoints.
- **Security-Relevant Behavior**:
  - Tokens stored only as cryptographically secure SHA-256 hashes.
  - One-time token consumption upon password setup.
  - 48-hour TTL auto-expiry.
  - HTTPS enforcement on all activation links.

---

## 8. Scope

### In Scope
- Post-purchase automated user provisioning without upfront password prompt.
- Email dispatch with 48h activation link.
- Single-use token validation, password creation, terms acceptance, and auto-login.
- Existing customer attachment without email spam.
- Interception of unclaimed logins with auto-resend of activation link.

### Out of Scope
- Multi-factor authentication (MFA) setup during onboarding.
- Manual phone number SMS verification.

---

## 9. Open Questions
*(All business ambiguities resolved)*

---

## 10. Resolved Ambiguities Log

| Question | Answer | Impact |
|---|---|---|
| What email should existing customers receive upon new purchase? | No email or activation link needed. Just attach the subscription to their existing account. | Simplifies webhook handling for existing users. |
| How should expired 48h links or unactivated logins be handled? | Automatically generate and send a fresh 48h activation link email, and display a message to check inbox. | Frictionless self-service recovery for expired links. |
| How should token invalidation and auto-login behave on setup? | Invalidate activation token immediately upon password setup and return standard JWT tokens for auto-login. | Secure single-use tokens with instant user gratification. |
