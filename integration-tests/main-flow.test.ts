/**
 * Integration test suite for CrossBox Gym platform.
 * Tests main workflows and edge cases against deployed AWS stack.
 *
 * Runs via: npm run test:integration -- --stack <StackName> --region <region>
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { requireOutput } from "./lib/stack-outputs.ts";

describe("CrossBox Gym Integration Tests", () => {
  let apiUrl: string;
  let userPoolId: string;
  let userPoolClientId: string;

  before(async () => {
    apiUrl = await requireOutput("ApiUrl");
    userPoolId = await requireOutput("UserPoolId");
    userPoolClientId = await requireOutput("UserPoolClientId");
    const mainTableName = await requireOutput("MainTableName");
    const frontendUrl = await requireOutput("AppCloudFrontUrl").catch(() => "http://localhost:5173");
    process.env.MAIN_TABLE_NAME = mainTableName;
    process.env.USER_POOL_ID = userPoolId;
    process.env.USER_POOL_CLIENT_ID = userPoolClientId;
    process.env.FRONTEND_URL = frontendUrl.startsWith("http") ? frontendUrl : `https://${frontendUrl}`;
  });

  describe("Checkout & Webhook Flow", () => {
    test("POST /checkout/session returns checkout URL", async () => {
      const res = await fetch(`${apiUrl}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: `test-${Date.now()}@example.com`,
        }),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as { url: string };
      assert.ok(data.url, "Expected checkout URL in response");
    });

    test("EventBridge checkout.session.completed processes checkout completed (mock mode)", async () => {
      const { handler: stripeEventHandler } = await import("../lib/handlers/stripe-webhook/index.ts");
      const testEmail = `test-user-${Date.now()}@example.com`;
      const eventBridgeEnvelope = {
        source: "aws.partner/stripe.com",
        "detail-type": "checkout.session.completed",
        detail: {
          type: "checkout.session.completed",
          data: {
            object: {
              customer_details: { email: testEmail },
              subscription: `sub_test_${Date.now()}`,
              customer: `cus_test_${Date.now()}`,
            },
          },
        },
      };

      const res = await stripeEventHandler(eventBridgeEnvelope);
      assert.equal(res.received, true);
    });
  });

  describe("Device Verification & Access Control", () => {
    test("POST /device/verify with invalid device API key returns denied", async () => {
      const res = await fetch(`${apiUrl}/device/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "invalid_key_123",
        },
        body: JSON.stringify({ qr_code: "dummy_qr" }),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as { result: string; reason: string };
      assert.equal(data.result, "denied");
      assert.equal(data.reason, "invalid_device");
    });

    test("POST /device/verify without x-api-key header returns denied", async () => {
      const res = await fetch(`${apiUrl}/device/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_code: "dummy_qr" }),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as { result: string; reason: string };
      assert.equal(data.result, "denied");
      assert.equal(data.reason, "invalid_device");
    });
  });

  describe("Auth & Edge Cases", () => {
    test("POST /auth/magic-link sends magic link", async () => {
      const res = await fetch(`${apiUrl}/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `test-auth-${Date.now()}@example.com` }),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as { message: string };
      assert.ok(data.message.includes("Magic link"));
    });

    test("GET /member/dashboard without auth header returns 401", async () => {
      const res = await fetch(`${apiUrl}/member/dashboard`);
      assert.equal(res.status, 401);
    });

    test("GET /admin/locations without auth header returns 401", async () => {
      const res = await fetch(`${apiUrl}/admin/locations`);
      assert.equal(res.status, 401);
    });

    test("POST /auth/login with bad credentials returns 401", async () => {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          password: "WrongPassword123!",
        }),
      });
      assert.equal(res.status, 401);
    });
  });
});
