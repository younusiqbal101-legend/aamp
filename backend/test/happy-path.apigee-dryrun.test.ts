import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import JSZip from "jszip";
import { json, startServer, wizardPayload, waitForFinish } from "./helpers";

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "aamp-bundles-"));
process.env.PROVISIONING_MODE = "apigee";
process.env.APIGEE_ORG = "test-org";
process.env.APIGEE_DRY_RUN = "true";
process.env.APIGEE_BUNDLE_DIR = bundleDir;

describe("happy path (apigee provider, dry run)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  before(async () => {
    const { default: app } = await import("../src/app");
    server = await startServer(app);
  });
  after(() => {
    server.close();
    fs.rmSync(bundleDir, { recursive: true, force: true });
  });

  it("health shows apigee dry-run", async () => {
    const { body } = await json(server.base, "/api/health");
    assert.equal(body.mode, "apigee");
    assert.equal(body.dryRun, true);
    assert.equal(body.org, "test-org");
  });

  it("completes all 9 steps and writes a valid proxy bundle", async () => {
    const created = await json(server.base, "/api/requests", {
      method: "POST",
      body: JSON.stringify(wizardPayload()),
    });
    const done = await waitForFinish(server.base, created.body.data.id);
    assert.equal(done.status, "COMPLETED", done.logs.join("\n"));
    assert.ok(done.operations.every((op: any) => op.status === "SUCCESS"));
    assert.ok(done.logs.some((l: string) => l.includes("DRY RUN")));

    const zip = await JSZip.loadAsync(fs.readFileSync(done.result.bundlePath));
    const names = Object.keys(zip.files);
    for (const expected of [
      "apiproxy/shipment-api.xml",
      "apiproxy/proxies/default.xml",
      "apiproxy/targets/default.xml",
      "apiproxy/policies/Verify-API-Key.xml",
      "apiproxy/policies/Quota-Default.xml",
      "apiproxy/policies/SpikeArrest-Default.xml",
      "apiproxy/policies/JSON-Threat-Protection.xml",
      "apiproxy/policies/CORS-Policy.xml",
      "apiproxy/policies/RF-Resource-Not-Found.xml",
    ]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }

    const proxy = await zip.file("apiproxy/proxies/default.xml")!.async("string");
    assert.match(proxy, /<BasePath>\/shipment\/v1<\/BasePath>/);
    assert.match(proxy, /MatchesPath &quot;\/shipments\/\*&quot;/);
    assert.match(proxy, /<Flow name="GET-shipments-shipmentId">/);
    assert.match(proxy, /<Name>Verify-API-Key<\/Name>/);

    const target = await zip.file("apiproxy/targets/default.xml")!.async("string");
    assert.match(target, /<Server name="shipment-backend"\/>/);
  });

  it("fails clearly for auth types it cannot generate", async () => {
    const created = await json(server.base, "/api/requests", {
      method: "POST",
      body: JSON.stringify(wizardPayload({ authType: "JWT" })),
    });
    const done = await waitForFinish(server.base, created.body.data.id);
    assert.equal(done.status, "FAILED");
    assert.ok(done.logs.some((l: string) => /not supported for real provisioning/.test(l)));
    assert.equal(done.operations[0].status, "FAILED");
  });
});
