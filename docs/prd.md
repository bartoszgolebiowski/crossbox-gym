# Complete and Unambiguous Product Requirements Document (PRD v4.0)

**Product Name:** Automated Gym Platform

**Version:** 4.0 (Full Functional and Business Specification)

**Status:** Production Specification — Absolute Values

---

## 1. Vision, Goals, and Key Performance Indicators (KPIs)

### 1.1 Product Purpose

Build an automated gym management system in a **Direct B2C and Multi-Tenant SaaS B2B** model. The system 100% eliminates the need for physical staff on-site by automating the entire customer lifecycle: from purchasing a membership on the marketing landing page, through registration and recurring billing, to physical door access control via dynamic QR codes in a Progressive Web App (PWA).

### 1.2 Absolute KPIs

* **Process Automation:** 0 minutes of manual staff intervention required to serve an individual customer.
* **Gate Response Time:** Maximum **500 ms** from QR code scan to lock release.
* **Payment Retention & Renewal:** Minimum **95%** of recurring payments processed automatically without error.
* **Infrastructure Availability (SLA):** **99.9%** annual uptime for the entry verification API.

---

## 2. Glossary and License State Machine

### 2.1 Subscription Statuses (`Subscription Status`)

```
             ┌──────────────────────────────────────────────┐
             │                                              │
             ▼                                              │
      [ No Account ]                                        │
             │                                              │
             │ (Successful Stripe Checkout payment)         │
             ▼                                              │
        [ ACTIVE ] ◄────────────────────────────────┐       │
             │                                      │       │
             │ (Recurring payment failure)          │       │
             ▼                                      │       │
       [ PAST_DUE ] (48h Grace Period Starts)       │       │
             │                                      │       │
             ├──────────── (Successful payment in 48h) ──┘       │
             │                                              │
             │ (No payment after 48h)                       │
             ▼                                              │
       [ SUSPENDED ] (Entry Blocked) ───────────────────────┤
             │                                              │ (Card update /
             │ (Cancelled by customer/admin)                │  Payment success)
             ▼                                              │
       [ CANCELED ] (Valid until period end)                │
             │                                              │
             │ (End of paid billing period)                 │
             ▼                                              │
        [ EXPIRED ] ────────────────────────────────────────┘

```

| Status Name | Gym Access | PWA Display | Business Description |
| --- | --- | --- | --- |
| **`ACTIVE`** | **YES** | Green status, active "Enter Gym" button | Membership fully paid and active. |
| **`PAST_DUE`** | **YES** *(for 48h)* | Yellow warning banner + timer to Grace Period end | Payment failed. The customer has a **48-hour grace period** to update their card. |
| **`SUSPENDED`** | **NO** | Red alert: "Account suspended. Settle payment" | 48-hour Grace Period expired without successful payment. "Enter Gym" button disabled. |
| **`CANCELED`** | **YES** *(until period end)* | Gray status: "Subscription expires on Date X" | Customer cancelled recurring billing but retains access until the end of the paid month. |
| **`EXPIRED`** | **NO** | Gray alert: "No active membership. Buy new" | Billing period ended after cancellation or suspension. Access denied. |

---

## 3. Detailed Module Specifications

### MODULE 1: Landing Page & Self-Service Onboarding

#### 1.1 Marketing Page and Pricing

* **Layout:** Landing page featuring: Benefits, 24/7 Operational Model, Location Map, Pricing, FAQ, and Footer with legal documents.
* **Product:** Single clear subscription tier: **100 PLN / month (incl. VAT)**.
* **Primary CTA Button:** *"Buy Membership – 100 PLN/mo"* positioned at the top and bottom of the page.
* **Sales Checkout (Stripe Hosted Checkout):**
* Redirects to the external Stripe checkout form.
* Form fields: Email address (required), Payment card details (Card Number, CVC, Expiration Date), Cardholder Name.
* Mandatory Legal Consent (Checkbox): *"I agree to automatic, recurring monthly charges of 100 PLN/mo and accept the Terms of Sale."*



#### 1.2 Simple Access Recovery (Typo Recovery)

When a customer makes a typo in their email address during checkout (e.g., entering `john@gmai.com` instead of `gmail.com`):

* **Location:** Dedicated button on the Landing Page: *"Problem logging in? / Email Typo"*
* **Recovery Screen (Form):**
1. Field 1: First 6 digits of the payment card (BIN).
2. Field 2: Last 4 digits of the payment card.
3. Field 3: Date of transaction ($\pm 1$ day).
4. Field 4: Correct, new email address.


* **System Logic:** The system queries Stripe records for a transaction matching the card token. Upon a successful match:
* Updates the email address on the Stripe Customer object.
* Updates the email address in the identity module (AWS Cognito).
* Sends an activation email with a new Magic Link to the corrected email address.



---

### MODULE 2: Payment, Subscription, and Identity Engine

#### 2.1 Registration and Account Provisioning

* **Event Trigger:** Upon successful payment processing by Stripe, the `checkout.session.completed` webhook is triggered.
* **Automated Account Creation:**
1. The system provisions a user in **AWS Cognito** using the email address as the unique identifier.
2. Creates a record in the database `Users` table and `Subscriptions` table with an initial status of `ACTIVE`.


* **First-Time Login Methods:**
* **Path A (Email):** The system generates and sends a welcome email containing a **Magic Link** (single-use token valid for **24 hours**). Clicking opens the PWA, logs the customer in, and prompts them to set a permanent password.
* **Path B (Instant):** The post-checkout success page (`/welcome?session_id=...`) queries the API and displays an *"Open PWA App"* button, leveraging a single-use session token for immediate browser login.



#### 2.2 Subscription Lifecycle and Error Handling

* **Recurring Billing:** Stripe re-charges the payment card every 30 days.
* **Payment Failure (Insufficient funds / Expired card):**
* Stripe triggers the `invoice.payment_failed` webhook.
* Account status immediately transitions to **`PAST_DUE`**.
* The system sets the **Grace Period**: `NOW() + 48 hours`.
* Sends an email notification: *"Gym payment failed. You have 48 hours to update your payment card."*


* **Expiration of Grace Period:**
* If no successful payment is processed within 48 hours, status transitions to **`SUSPENDED`**.
* Gate access is immediately blocked.


* **Subscription Cancellation:**
* Customer clicks *"Cancel Subscription"* in the management dashboard.
* System calls the Stripe API with parameter `cancel_at_period_end = true`.
* Status updates to **`CANCELED`**.
* Customer retains full access to the gym until the final paid day.
* On the final day of the billing period, Stripe triggers `customer.subscription.deleted` $\rightarrow$ status transitions to **`EXPIRED`** (access blocked).



---

### MODULE 3: Customer Application (PWA)

#### 3.1 Unauthenticated View

* Displays **exclusively** the login form. No access to internal views or pages is permitted.
* Form elements: Email field, Password field, *"Log In"* button, *"Send Magic Link"* button.

#### 3.2 Authenticated Dashboard

* **License Status Card:**
* When `ACTIVE`: Green icon, *"Membership Active"*, next billing date.
* When `PAST_DUE`: Yellow warning banner, *"Payment Error. Update Card! Remaining: [Countdown Timer]"*.
* When `SUSPENDED` / `EXPIRED`: Red icon, *"Account Inactive. Access Denied"*.


* **QR Code Generation Button:** Prominent, high-visibility button: *"ENTER GYM"*.
* **Navigation Bar:**
* **"My Payments" Tab:** History of billing transactions (date, amount, status, receipt download).
* **"Manage Subscription" Tab:** Redirect button generating a session for the *Stripe Customer Portal* (update card, cancel membership).
* **"Entry History" Tab:** Log of recent visits with date and timestamp.



#### 3.3 Dynamic QR Code Generation and Entry Flow

1. **Code Generation:**
* Clicking *"ENTER GYM"* generates a dynamic QR code using TOTP / HMAC encryption with a unique digital signature.
* **Time-to-Live (TTL):** Exactly **20 seconds**.
* Live visual countdown bar indicating the 20-second validity window.


2. **Post-Scan Verification Screen:**
* After scanning at the gate, the PWA displays a modal prompt: *"Did the door unlock?"*
* **"YES" Option:** Closes the modal, logs successful entry, and returns to the main dashboard.
* **"NO (Quick Retry)" Option:**
* If the QR token is still within its **20-second validity window**, clicking "NO" immediately re-sends the unlock command to the lock.
* This action **does not** trigger a new Anti-Passback cooldown timer.





#### 3.4 Legal Consents Modal (GDPR / Safety)

* On first launch of the PWA post-purchase, a non-dismissible modal appears:
* Text containing Gym Regulations and Safety Guidelines.
* Mandatory checkbox: *"I confirm that I have read and agree to the Gym Regulations and Safety Guidelines."*


* Until checked, the *"ENTER GYM"* button remains disabled and grayed out.

---

### MODULE 4: Access Controller and Hardware Interface (HAL)

#### 4.1 Entry Verification Business Logic

When the scanner reads a QR code and transmits it to the backend API, the system executes verification steps in the following strict order:

1. **1. Technical QR Verification:** TTL and Signature Check.
The API verifies that the QR code has not expired (TTL <= 20 seconds) and that its digital signature is valid. Error -> Denial (EXPIRED_TOKEN).


2. **2. License Status Check:** Database Status Check.
The API checks the user's account status. If the status is ACTIVE or PAST_DUE (under 48h) -> Proceed. If SUSPENDED, CANCELED, or EXPIRED -> Denial (NO_ACTIVE_LICENSE).


3. **3. Anti-Passback Verification:** 15-minute Rule.
The API checks whether the same user has registered an entry at the same location within the last 15 minutes. If yes -> Denial (COOL_DOWN_ACTIVE).


4. **4. Issue Unlock Command:** Lock Relay.
If all steps pass, the API sends a command to release the lock relay for 5 seconds and applies a 15-minute cooldown timer to the user's account.


#### 4.2 Anti-Passback Rule (15-Minute Cooldown)

* **Absolute Value:** **15 minutes** from the timestamp of a successful scan.
* **Scope:** Cooldown applies within the specific location (`location_id`).
* **Error Feedback:** Scanner emits a red light signal / error chime; PWA displays: *"Entry recently recorded. Next entry allowed in X minutes"*.

#### 4.3 Hardware Agnosticism Requirement (HAL)

* **Vendor Lock-in Protection:** The system must interface with any QR scanner or lock relay without requiring modifications to core business logic, billing, or the PWA.
* **Device Profiling in Admin Panel:** When adding hardware, admins select profiles from a dropdown:
* *Lock Profile:* `Shelly IP Relay`, `MQTT Generic Relay`, `Modbus RS485 Relay`, `Custom HTTP Relay`.
* *Scanner Profile:* `ZKBio QR Reader`, `Hikvision QR Reader`, `Custom HTTP Camera Reader`.


* **Standard Lock Capabilities:** Every integrated lock must implement: *"Release relay for N seconds"* and report connectivity status (*Online / Offline*).
* **Standard Scanner Capabilities:** Every scanner must handle feedback triggers for success (green light / short chime) and failure (red light / long chime).

---

### MODULE 5: Gym Management (Admin Panel)

#### 5.1 Multi-Tenancy Hierarchy

* **Tenants:** Corporate accounts of gym owners.
* **Locations:** Physical facilities assigned to a Tenant (e.g., *"Kielce Downtown Gym"*). Each location defines operating hours (default: 24/7).
* **Devices:** Scanners and locks assigned to a location. A single location can host multiple locks and scanners (e.g., Main Entrance, VIP Area).

#### 5.2 Remote Emergency Unlock

* **Function:** *"REMOTE UNLOCK DOOR"* button next to a device in the Admin Panel.
* **Role Access:** `SUPER_ADMIN`, `TENANT_ADMIN`, `SUPPORT_OPERATOR`.
* **Mandatory Workflow:**
1. Clicking opens a modal pop-up.
2. Operator **must enter a reason for remote unlock** in a text field (min. 10 characters, e.g., *"Customer John Doe – dead phone battery at door"*).
3. Confirmation button remains disabled until a valid reason is entered.
4. Upon confirmation, the API sends a 5-second unlock command to the door.
5. The action is recorded in `AuditLogs` (Operator ID, Device ID, Reason, UTC Timestamp, IP address).



#### 5.3 Member Management

* User search functionality by email address.
* View billing history, generated tokens, and access logs.
* Manual status override buttons for exceptional scenarios (*"Suspend Account"*, *"Extend Grace Period"*).

---

### MODULE 6: GDPR, Consents, and Audit Trail (`AuditLogs`)

#### 6.1 Consent Audit Path

1. **Recurring Payment Consent:** Captured on the Stripe Checkout form.
2. **Facility Regulations & Safety Consent:** Captured in the PWA prior to first door unlock.
3. **Database Audit Record:** Storing fields `terms_accepted_at` (UTC timestamp), `terms_version` (e.g., "v1.0"), and customer IP address.

#### 6.2 Audit Log Register (`AuditLogs`)

Dedicated database table logging all privileged actions executed by administrators and system processes:

* Remote door unlocks (Remote Unlock).
* Manual user subscription status overrides.
* Hardware mapping updates across locations.

---

## 4. Role-Based Access Control (RBAC) Matrix

| Permission / Functionality | Customer (Member) | Support Operator | Tenant Admin | Super Admin |
| --- | --- | --- | --- | --- |
| Purchase membership & manage card | **YES** | NO | NO | NO |
| Generate personal entry QR code | **YES** | NO | NO | NO |
| Search users and access logs | NO | **YES** | **YES** | **YES** |
| Remote door unlock (Remote Unlock) | NO | **YES** *(requires reason)* | **YES** *(requires reason)* | **YES** *(requires reason)* |
| Edit locations and devices | NO | NO | **YES** | **YES** |
| Tenant management (Multi-Tenancy) | NO | NO | NO | **YES** |

---

## 5. Complete Edge Cases Matrix

| ID | Edge Case | Root Cause | System Handling / Mitigation |
| --- | --- | --- | --- |
| **EC-1** | **Email typo on Stripe Checkout** | User entry error (e.g., `gmai.com`) | Self-service recovery form on Landing Page using card BIN+last4 $\rightarrow$ updates email in Stripe and Cognito $\rightarrow$ re-sends Magic Link. |
| **EC-2** | **Insufficient funds on renewal** | Recurring transaction decline | Subscription transitions to `PAST_DUE`. Triggers **48h Grace Period**. Member retains entry; PWA shows yellow alert. After 48h, status changes to `SUSPENDED` (blocked). |
| **EC-3** | **Mid-month subscription cancellation** | Customer decision | Subscription status set to `CANCELED`. Member retains entry until the final paid day. The following day, status changes to `EXPIRED`. |
| **EC-4** | **Pass-back attempt (Sharing phone)** | Membership sharing | Successful scan triggers a **15-minute Anti-Passback cooldown** at that location. Second scan attempt is denied. |
| **EC-5** | **QR code sharing via messaging (Screenshot)** | Fraud attempt | QR code expires after **20 seconds**. Screenshots sent to another individual will be invalid upon presentation. |
| **EC-6** | **Door closed before member entered** | Customer delay / distraction | PWA prompts *"Did the door unlock?"*. Clicking *"NO"* within token validity (20s) re-issues unlock pulse without triggering cooldown. |
| **EC-7** | **Customer phone battery dead at door** | Customer device failure | Customer calls support. Operator verifies identity, clicks **Remote Unlock** in panel, inputs reason, and opens door remotely. |
| **EC-8** | **Facility internet outage** | Local ISP outage at gym | Door controller maintains a local cached whitelist of active accounts synchronized during last connection (Fail-Safe Mode). |

---

## 6. Non-Functional Requirements (NFR)

* **Entry Latency:** Time from QR code scan to relay signal transmission must not exceed **500 ms**.
* **Payment Data Security:** Credit card details never touch application servers. All processing is handled directly by Stripe (PCI DSS Level 1 compliant).
* **Communication Encryption:** All network traffic enforced via HTTPS (TLS 1.3).
* **QR Encryption:** Codes generated using HMAC-SHA256 signatures with backend-rotated secret keys.
* **Database Multi-Tenancy Architecture:** Strict tenant data isolation via row-level `tenant_id` attributes on all database tables.