/**
 * Example integration test pattern for the aws-cdk-implementation skill.
 * Copy into integration-tests/<flow-name>.test.ts and adapt to the actual plan/API.
 *
 * Run with: npm run test:integration -- --stack <StackName> --region <region>
 *
 * Rules this template follows (see SKILL.md Phase 2):
 * - Resolves every resource identifier via stack outputs — nothing hardcoded.
 * - Main flow test runs first; edge cases follow, each derived from a documented
 *   error-handling/validation rule (replace the placeholders below with real ones from the plan).
 * - Every write uses unique, prefixed test data and is cleaned up in `after()`.
 * - No mocking — every call hits the real deployed API/table.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { requireOutput } from "./lib/stack-outputs.ts";

describe("example flow: <replace with real workflow name>", () => {
  let apiBaseUrl: string;
  const testId = `test-${Date.now()}`;
  const createdIds: string[] = [];

  before(async () => {
    apiBaseUrl = await requireOutput("ApiBaseUrl");
  });

  after(async () => {
    // Clean up every resource this suite created, e.g.:
    // for (const id of createdIds) {
    //   await fetch(`${apiBaseUrl}/things/${id}`, { method: "DELETE" });
    // }
  });

  test("main flow: <happy path steps, e.g. create -> read -> update -> read>", async () => {
    const createRes = await fetch(`${apiBaseUrl}/things`, {
      method: "POST",
      body: JSON.stringify({ name: `${testId}-thing` }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    createdIds.push(created.id);

    const getRes = await fetch(`${apiBaseUrl}/things/${created.id}`);
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.name, `${testId}-thing`);
  });

  test("edge case: not found returns 404", async () => {
    const res = await fetch(`${apiBaseUrl}/things/does-not-exist-${testId}`);
    assert.equal(res.status, 404);
  });

  test("edge case: invalid input returns 400", async () => {
    const res = await fetch(`${apiBaseUrl}/things`, {
      method: "POST",
      body: JSON.stringify({}), // missing required field
    });
    assert.equal(res.status, 400);
  });
});
