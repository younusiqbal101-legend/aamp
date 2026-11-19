import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { json, startServer, wizardPayload, waitForFinish, SAMPLE_SPEC } from "./helpers";

process.env.PROVISIONING_MODE = "mock";
process.env.MOCK_STEP_DELAY_MS = "10";

describe("happy path (mock provider)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  before(async () => {
    const { default: app } = await import("../src/app");
    server = await startServer(app);
  });
  after(() => server.close());

  it("reports health and mode", async () => {
    const { status, body } = await json(server.base, "/api/health");
    assert.equal(status, 200);
    assert.equal(body.mode, "mock");
  });

  it("serves the resource catalogue", async () => {
    const { body } = await json(server.base, "/api/resources?env=dev");
    assert.ok(body.data.products.length > 0);
    assert.ok(body.data.sharedFlows.dev.length > 0);
  });

  it("rejects an invalid spec", async () => {
    const { status } = await json(server.base, "/api/specs/validate", {
      method: "POST",
      body: JSON.stringify({ content: "foo: bar" }),
    });
    assert.equal(status, 422);
  });

  it("upload -> validate -> submit -> all 9 steps succeed", async () => {
    const validated = await json(server.base, "/api/specs/validate", {
      method: "POST",
      body: JSON.stringify({ content: SAMPLE_SPEC }),
    });
    assert.equal(validated.status, 200);
    assert.equal(validated.body.data.totalOperations, 3);
    assert.equal(validated.body.data.basePath, "/shipment/v1");

    const created = await json(server.base, "/api/requests", {
      method: "POST",
      body: JSON.stringify(wizardPayload()),
    });
    assert.equal(created.status, 201);

    const done = await waitForFinish(server.base, created.body.data.id);
    assert.equal(done.status, "COMPLETED");
    assert.equal(done.operations.length, 9);
    assert.ok(done.operations.every((op: any) => op.status === "SUCCESS"));

    const list = await json(server.base, "/api/requests");
    assert.equal(list.body.data[0].id, created.body.data.id);
  });

  it("does not echo the spec or auth config back", async () => {
    const { body } = await json(server.base, "/api/requests");
    const detail = await json(server.base, `/api/requests/${body.data[0].id}`);
    assert.equal(detail.body.data.payload.specContent, undefined);
    assert.equal(detail.body.data.payload.authConfig, undefined);
  });
});
