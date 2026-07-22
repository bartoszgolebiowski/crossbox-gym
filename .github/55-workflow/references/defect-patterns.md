# 55-Workflow: Defect Patterns Reference

Use this guide during **Phase 4 Speculative Simulation** to design tests that catch your project's most common failure modes. This prevents late-stage architectural collapse.

---

## Pattern 1: Whack-A-Mole Bug Loop

**What it looks like:** Fix in Module A breaks Module B, which breaks Module C. State leaks across module boundaries.

**Root cause:** Tight coupling + unclear module boundaries + state sharing without encapsulation.

**Phase 4 Test Design:**

```typescript
// Test: Cross-module integration after feature addition
// Example: Adding a discount module to checkout

describe('defect-pattern: whack-a-mole coupling', () => {
  test('discount applied to cart doesn't corrupt order state', async () => {
    // 1. Add item to cart → verify price calculation includes VAT
    const cart1 = await POST('/cart/items', { product_id, quantity: 2 });
    assert.ok(cart1.gross_total > 0);

    // 2. Apply discount → verify discount applied correctly
    const cartWithDiscount = await POST('/cart/apply-discount', { code: 'SAVE10' });
    assert.ok(cartWithDiscount.discount_amount > 0);

    // 3. Submit order → verify no price corruption
    const order = await POST('/checkout/submit', cart1);
    assert.equal(order.status, 'NEW');

    // 4. Advance order through fulfillment → verify discount persists
    await POST('/fulfillment/orders/{id}/advance', { status: 'PACKED' });
    const advanced = await GET(`/orders?user_id=${userId}`);
    assert.equal(advanced[0].discount_amount, cartWithDiscount.discount_amount);

    // 5. Other user removes item from their cart → verify no interference
    const otherUserCart = await DELETE(`/cart/items/${productId}`, otherUserId);
    const myOrder = await GET(`/orders?user_id=${userId}`);
    assert.equal(myOrder[0].discount_amount, cartWithDiscount.discount_amount);
  });
});
```

**Assertions to check:**
- ✓ Discount persists through order submission
- ✓ Discount visible in fulfillment workflow
- ✓ Cart modifications for other users don't affect my order
- ✓ No shared state mutation across users

---

## Pattern 2: English-to-Code Translation Breakdown

**What it looks like:** Explaining a simple feature takes dozens of prompts. Core assumption is wrong. Data model doesn't match business logic.

**Root cause:** Data structures don't reflect reality. Missing a requirement that invalidates the schema.

**Phase 4 Test Design:**

```typescript
// Test: New feature exposes data model gaps
// Example: Adding "bulk orders" (multiple delivery addresses in one order)

describe('defect-pattern: english-to-code translation', () => {
  test('bulk order data model supports multiple addresses', async () => {
    // Phase 1 assumption (WRONG): order_id is unique key, one delivery per order
    // Simulation discovers: we need multi-address orders

    const bulkOrder = {
      user_id: userId,
      items: [{ product_id: 'P1', quantity: 2 }],
      deliveries: [
        { address: 'Street A', status: 'NEW' },
        { address: 'Street B', status: 'NEW' },
      ],
    };

    // 1. Can we even store this? Does schema allow it?
    const stored = await POST('/checkout/submit-bulk', bulkOrder);
    assert.ok(stored.order_id);

    // 2. Can GetOrdersByEmail GSI still work?
    //    (If ByUserId GSI was designed for single delivery, this breaks)
    const userOrders = await GET(`/orders?user_id=${userId}`);
    const found = userOrders.find(o => o.order_id === stored.order_id);
    assert.ok(found, 'Bulk order not found via ByUserId GSI');

    // 3. Can UpdateOrderStatus handle multiple addresses?
    //    (If state machine assumes one status per order, this breaks)
    await POST(`/fulfillment/orders/${stored.order_id}/advance`, { status: 'PACKED' });
    const advanced = await GET(`/fulfillment/orders/${stored.order_id}`);
    assert.equal(advanced.deliveries.length, 2);
    assert.equal(advanced.deliveries.every(d => d.status === 'PACKED'), true);
  });
});
```

**Assertions to check:**
- ✓ Data structure accommodates the business requirement
- ✓ Existing GSI queries still work (or fail gracefully)
- ✓ State machine can handle the new structure
- ✓ Handler logic doesn't need "creative workarounds"

---

## Pattern 3: Speculative Simulation Failure

**What it looks like:** Code works in isolation. Breaks in production due to lifecycle/timing conflicts. Object deleted while UI still animating it.

**Root cause:** Missing system invariants. Lifecycle boundaries not understood. State cleanup timing conflicts with other systems.

**Phase 4 Test Design:**

```typescript
// Test: State transitions and lifecycle boundaries
// Example: Auto-cancel old orders without breaking order queries

describe('defect-pattern: speculative simulation timing', () => {
  test('order lifecycle respects invariants under state transitions', async () => {
    // Invariant 1: An order must exist in OrdersTable as long as UI can query it
    // Invariant 2: Fulfillment token cleanup must not orphan the order

    // 1. Create order in NEW status
    const order = await POST('/checkout/submit', { items: [...] });
    assert.equal(order.status, 'NEW');

    // 2. Immediately advance to PACKED (simulate fast fulfillment)
    await POST(`/fulfillment/orders/${order.order_id}/advance`, { status: 'PACKED' });

    // 3. Query order from UI (GetOrdersByEmail) → must still be findable
    const queriedOrder = await GET(`/orders?user_id=${order.user_id}`);
    const found = queriedOrder.find(o => o.order_id === order.order_id);
    assert.ok(found, 'Order orphaned after PACKED transition');

    // 4. Simulate 31-day delay → trigger auto-cancel check
    // (Simulate by creating an order with old timestamp)
    const oldOrder = await createOrderWithTimestamp(31 * 24 * 60 * 60 * 1000);
    await triggerAutoCancelCheck();

    // 5. Auto-canceled order still queryable (soft delete, not hard delete)
    const canceledOrder = await GET(`/orders?user_id=${oldOrder.user_id}`);
    assert.ok(canceledOrder.find(o => o.order_id === oldOrder.order_id));
    assert.equal(canceledOrder.status, 'CANCELLED');

    // 6. Cleanup: Fulfillment token deleted, but order still in DB
    const tokenExists = await dynamodb.GetItem(FulfillmentTokensTable, oldOrder.order_id);
    assert.equal(tokenExists, null); // Token cleaned up
    const orderExists = await dynamodb.GetItem(OrdersTable, oldOrder.order_id);
    assert.ok(orderExists); // Order persists
  });
});
```

**Assertions to check:**
- ✓ Order remains queryable through GSI after state transitions
- ✓ Lifecycle cleanup doesn't orphan data
- ✓ Old order cancellation is soft-delete (preserves history)
- ✓ Invariants hold: order exists ≥ as long as any foreign key references it

---

## Pattern 4: Agent Slop Cascade

**What it looks like:** Code technically works but uses hacky workarounds. Nested conditionals, duplicated logic, no clear module boundary.

**Root cause:** AI (or developer) writes around bad design instead of rejecting it. Phase 3 TODOs weren't strict enough.

**Phase 4 Test Design:**

```typescript
// Test: Handler stays within TODO boundaries
// Phase 3 TODOs are SACRED—don't let implementation veer outside

describe('defect-pattern: agent slop prevention', () => {
  test('apply-coupon handler respects module boundary (cart vs checkout)', async () => {
    // Phase 3 TODO boundaries for apply-coupon handler:
    // TODO: Validate coupon code format (alphanumeric, max 20 chars)
    // TODO: Look up coupon from CouponTable, verify not expired
    // TODO: Return updated cart with discount amount
    // BOUNDARY: Do NOT modify CartsTable directly. Cart handler owns that.

    // Test 1: Valid coupon returns discount amount (doesn't modify cart)
    const result = await POST('/cart/apply-coupon', { code: 'SAVE10' });
    assert.ok(result.discount_amount);
    assert.equal(result.lines, undefined); // Should NOT return full cart

    // Test 2: Handler delegates cart update to proper module
    // (if someone tries to sneak in a cart update, this fails)
    const beforeCart = await GET('/cart', userId);
    await POST('/cart/apply-coupon', { code: 'SAVE10' });
    const afterCart = await GET('/cart', userId);
    // Cart structure unchanged; discount is stored in session/checkout state, not cart
    assert.deepEqual(beforeCart.lines, afterCart.lines);

    // Test 3: Invalid coupon returns error (doesn't cascade into cart corruption)
    const error = await POST('/cart/apply-coupon', { code: 'INVALID' });
    assert.equal(error.status, 400);
    const cartAfterError = await GET('/cart', userId);
    assert.ok(cartAfterError.lines); // Cart unaffected by error

    // Test 4: Verify: Handler logic is self-contained (no helper functions that modify global state)
    // This is a code review check, but simulation should detect it if the side-effects appear
  });
});
```

**Assertions to check:**
- ✓ Handler returns only its own responsibility (discount, not full cart)
- ✓ Handler doesn't modify tables it doesn't own
- ✓ Error in handler doesn't corrupt other modules' state
- ✓ Handler logic is straightforward (no nested workarounds)

---

## Using This Reference in Phase 4

**Simulation Checklist:**

Before reverting Phase 4 code, ask:

- [ ] Did I test cross-module interactions? (Pattern 1)
- [ ] Does the new data structure fit existing GSIs/queries? (Pattern 2)
- [ ] Do lifecycle and state transitions respect invariants? (Pattern 3)
- [ ] Did the handler stay within its TODO boundaries? (Pattern 4)
- [ ] If I answer "no" to any of these, what needs to change in Phases 1-3?

**If simulation fails:**
- Loop back to Phase 1, 2, or 3
- Rewrite the problematic phase
- Re-run simulation
- Don't proceed to Phase 5 until all defect patterns are addressed

---

## Your Codebase-Specific Patterns

For your order management system, these patterns manifest as:

| Pattern | Your System | High-Risk Area |
|---|---|---|
| Whack-A-Mole | Discount logic leaking into order state | When adding promotions/coupons |
| English-to-Code | Multi-address or bulk orders breaking schema | When adding customer scenarios |
| Simulation Failure | Auto-cancel not respecting query dependencies | When adding maintenance tasks |
| Agent Slop | Discount handler modifying CartTable directly | When implementing new handler |

Use this reference when designing Phase 4 tests for these features.
