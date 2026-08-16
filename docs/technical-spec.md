# Technical Specification: Deferred Subscription Billing Anchor

> Technology-agnostic. Describes required behavior, rules, data entities, and user flows for deferred subscription billing anchors.

## 1. Overview
- **Purpose / Problem Being Solved**: When selling recurring subscriptions or cohort-based programs ahead of an official launch date (e.g. selling access on August 16 for a program launching September 12), standard anniversary billing creates fragmented renewal schedules across arbitrary days of the month.
- **Primary Goal(s)**:
  - Collect full 1-month payment immediately upfront at checkout.
  - Grant immediate pre-launch platform access at no extra cost (no proration surcharges).
  - Defer the first recurring auto-renewal to a synchronized target anchor calendar day (e.g. October 12).
  - Allow non-technical team members to configure anchor dates via external metadata (`billing_cycle_anchor`) without code changes or deployments.
  - Fall back gracefully to standard subscription billing if no valid future anchor date is set.

## 2. Actors & Roles
| Actor | Description | Permissions / What they can do |
|---|---|---|
| Customer | End user purchasing a recurring program/membership | Can purchase subscription, gain immediate access, view renewal dates, and cancel subscription. |
| Product / Marketing Manager | Non-technical administrator setting up campaigns | Can configure or update `billing_cycle_anchor` timestamp in product catalog metadata. |
| Subscription Management System | Automated core backend handling billing and access | Can process checkouts, evaluate metadata anchors, provision access, and schedule renewal cycles. |

## 3. Functional Requirements
| ID | Requirement | Acceptance Criteria | Actor(s) |
|---|---|---|---|
| FR-1 | Upfront Payment Collection | Upon checkout, the customer is billed 100% of the listed subscription price immediately. | Customer, Subscription Management System |
| FR-2 | Immediate Pre-Launch Access | Access is granted immediately upon successful payment (e.g. August 16) through the anchor date (e.g. October 12). | Customer, Subscription Management System |
| FR-3 | Deferred Billing Anchor Alignment | The customer's first automated renewal date is aligned strictly to the configured anchor timestamp (e.g. October 12). | Subscription Management System |
| FR-4 | Zero-Proration Receipts | Invoices/receipts display exact listed price without split line items, proration credits, or extra surcharges. | Customer, Subscription Management System |
| FR-5 | Metadata-Driven Configuration | The anchor date is read dynamically from product catalog metadata key `billing_cycle_anchor` (Unix timestamp). | Product / Marketing Manager, Subscription Management System |
| FR-6 | Automatic Fallback on Invalid/Past Dates | If `billing_cycle_anchor` is missing, malformed, non-numeric, or in the past, checkout defaults to standard billing without an anchor date. System logs a warning. | Subscription Management System |
| FR-7 | Pre-Launch Cancellation Access | If a customer cancels during the pre-launch window before the first renewal, access remains active until the anchor date; auto-renewal is cancelled. | Customer, Subscription Management System |

## 4. Business Rules
- **Rule BR-1: Upfront Coverage & Cycle Start**
  - **Condition**: Subscription is purchased prior to configured anchor date.
  - **Result**: Immediate payment covers access from purchase date through the anchor date (including pre-launch bonus window + official first month).
- **Rule BR-2: First Auto-Renewal Schedule**
  - **Condition**: Valid future `billing_cycle_anchor` Unix timestamp exists in product metadata.
  - **Result**: First recurring renewal charge occurs on the anchor timestamp date. Subsequent renewals occur monthly on that anchored calendar day.
- **Rule BR-3: Past Anchor Timestamp Fallback**
  - **Condition**: `billing_cycle_anchor` timestamp is <= current checkout time.
  - **Result**: System ignores anchor override and creates a standard subscription with renewal 1 cycle from checkout date.
- **Rule BR-4: Malformed Metadata Fallback**
  - **Condition**: `billing_cycle_anchor` key is absent, empty, non-numeric, or invalid date format.
  - **Result**: System logs a non-blocking warning and processes standard subscription checkout.
- **Rule BR-5: No Trial Period Override**
  - **Condition**: Checkout initiates for product with `billing_cycle_anchor`.
  - **Result**: Free trial periods are not applicable. Upfront payment is mandatory to receive pre-launch access.
- **Rule BR-6: Pre-Launch Cancellation Handling**
  - **Condition**: Customer cancels subscription before the first anchor renewal date.
  - **Result**: Subscription status is set to cancel at period end (anchor date). No refund issued automatically. Access remains active until anchor date.

## 5. Data Entities
| Entity | Attributes | Created by | Read by | Updated by | Deleted by | Retention |
|---|---|---|---|---|---|---|
| Product Catalog Entry | ID, Name, Price, Metadata (`billing_cycle_anchor`) | Product / Marketing Manager | Subscription Management System | Product / Marketing Manager | Admin | Indefinite |
| Checkout Session | Session ID, Customer ID, Product ID, Anchor Timestamp, Status | Customer / System | System, Customer | System | System | Permanent Audit Log |
| Subscription Record | Subscription ID, Customer ID, Current Period Start, Current Period End (Anchor Date), Auto-Renew Flag, Status | System | System, Customer | System, Customer | N/A (Soft delete / Cancel) | Permanent Record |

## 6. Workflows / User Flows

### Flow 1: Pre-Launch Subscription Checkout with Valid Anchor
1. Customer initiates checkout for a program on August 16.
2. System retrieves Product Catalog Entry metadata and extracts `billing_cycle_anchor` timestamp (e.g. October 12, 2026).
3. System verifies timestamp is valid and in the future.
4. System creates checkout session charging full 1-month fee upfront, setting subscription billing cycle anchor to October 12.
5. Customer completes payment.
6. System provisions immediate platform access (August 16).
7. System schedules first recurring payment for October 12.
- **Error / Edge cases**:
  - *Payment failure*: Access is not provisioned; customer receives standard payment failed notification.
  - *Metadata missing/invalid*: System logs warning and processes standard checkout (Flow 2).

### Flow 2: Standard Fallback Checkout (Missing / Past / Malformed Anchor)
1. Customer initiates checkout.
2. System reads Product Metadata `billing_cycle_anchor` and finds it missing, unparseable, or past.
3. System logs system warning/error for administrator review.
4. System creates standard recurring subscription starting immediately, with next renewal 1 month from checkout date.
5. Customer completes payment and receives immediate access.

### Flow 3: Customer Pre-Launch Cancellation
1. Customer requests subscription cancellation on August 25 (prior to October 12 anchor).
2. System marks subscription to cancel at period end (October 12).
3. System confirms cancellation with customer.
4. Platform access remains active through October 12.
5. On October 12, no renewal payment is charged and access expires.

## 7. Non-Functional Requirements
- **Performance / Scale**: Metadata extraction and anchor calculation must not add measurable latency (<50ms processing overhead) to checkout initialization.
- **Availability**: Checkout must remain fully functional even if metadata parsing fails (fallback path must ensure 99.99% checkout availability).
- **Auditability / Logging**: System must log all anchor evaluation events, including fallback triggers caused by past or malformed metadata.
- **Security-Relevant Behavior**: Anchor calculations must occur securely on the backend; client-side parameters cannot override billing cycle anchor dates.

## 8. Scope

### In Scope
- Dynamically setting subscription cycle anchor from Product Metadata `billing_cycle_anchor`.
- Upfront full-price billing with immediate access during pre-launch period.
- Synchronization of subsequent monthly renewals to the anchor calendar day.
- Graceful fallback to standard recurring billing on invalid/past/missing metadata.
- Cancellation handling retaining access through anchor date.

### Out of Scope
- Free trial periods (not supported in pre-sale deferred anchor campaigns).
- Proration surcharges or partial billing split items.
- In-flight migration of existing active subscriptions to new anchor dates (applies to new checkouts).

## 9. Open Questions (should be empty when finalized)
*None — all clarifying questions resolved.*

## 10. Resolved Ambiguities Log
| Question | Answer | Impact |
|---|---|---|
| How should purchases on or after the target launch date (past anchor timestamp) be handled? | Automatically fall back to standard subscription billing (no anchor override) if `billing_cycle_anchor` is in the past. | Simplifies post-launch transition without needing code updates. |
| What happens to platform access if a customer cancels during the pre-launch window? | Access remains active until the anchor renewal date (e.g. October 12), with no further auto-renewals. | Ensures clear customer expectations and prevents premature lockouts. |
| How should invalid or malformed `billing_cycle_anchor` metadata values be handled? | Log a system warning/error and fall back gracefully to standard subscription billing. | Prevents checkout outages due to misconfigured metadata. |
| How do trial periods interact with deferred anchor billing? | Free trials are explicitly excluded / not supported; upfront payment is required for pre-sale access. | Clarifies subscription setup rules and eliminates conflicting billing logic. |
