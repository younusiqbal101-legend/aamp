import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { json, startServer, wizardPayload, waitForFinish } from "./helpers";

/**
 * Runs the real ApigeeProvider against a fake Apigee Management API that
 * records every call, so the request sequence can be asserted without a
 * Google Cloud project.
 */
type Call = { method: string; path: string; query: URLSearchParams; contentType: string; auth: string; body: string };
const calls: Call[] = [];
const state = { deployPolls: 0, sharedFlowDeployed: true, deployError: false, existing: new Set<string>() };

const ORG = "/v1/organizations/test-org";
const fake = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const url = new URL(req.url!, "http://x");
    const call: Call = {
      method: req.method!, path: decodeURIComponent(url.pathname), query: url.searchParams,
      contentType: String(req.headers["content-type"] ?? ""),
      auth: String(req.headers.authorization ?? ""),
      body: Buffer.concat(chunks).toString("latin1"),
    };
    calls.push(call);
    const reply = (status: number, body: unknown = {}) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const { method, path } = call;

    if (method === "GET" && (path === ORG || path === `${ORG}/environments/dev`)) return reply(200);
    if (method === "POST" && path === `${ORG}/apis`) return reply(200, { name: "shipment-api", revision: "7" });
    if (path === `${ORG}/apiproducts/shipment-product`) {
      if (method === "GET") return state.existing.has("product") ? reply(200, { name: "shipment-product", proxies: ["other-api"], environments: ["test"] }) : reply(404, { error: { message: "not found" } });
      if (method === "PUT") return reply(200);
    }
    if (method === "POST" && path === `${ORG}/apiproducts`) return reply(201);
    if (path === `${ORG}/developers/logistics@example.com`) {
      return method === "GET" ? reply(404, { error: { message: "nf" } }) : reply(200);
    }
    if (method === "POST" && path === `${ORG}/developers`) return reply(201);
    if (path === `${ORG}/developers/logistics@example.com/apps/shipment-partner-app` && method === "GET") return reply(404, { error: { message: "nf" } });
    if (method === "POST" && path === `${ORG}/developers/logistics@example.com/apps`) {
      return reply(201, { credentials: [{ consumerKey: "KEY123", consumerSecret: "SECRET-never-logged" }] });
    }
    if (path === `${ORG}/environments/dev/targetservers/shipment-backend` && method === "GET") return reply(404, { error: { message: "nf" } });
    if (method === "POST" && path === `${ORG}/environments/dev/targetservers`) return reply(201);
    if (path.startsWith(`${ORG}/environments/dev/sharedflows/`) && path.endsWith("/deployments")) {
      return state.sharedFlowDeployed ? reply(200, { deployments: [{ revision: "1" }] }) : reply(404, { error: { message: "nf" } });
    }
    if (path === `${ORG}/environments/dev/apis/shipment-api/revisions/7/deployments`) {
      if (method === "POST") return reply(200, {});
      state.deployPolls += 1;
      if (state.deployError) return reply(200, { state: "ERROR", errors: [{ message: "Flow callout references a missing shared flow" }] });
      return reply(200, { state: state.deployPolls < 2 ? "PROGRESSING" : "READY" });
    }
    return reply(500, { error: { message: `unexpected ${method} ${path}` } });
  });
});

describe("happy path (apigee provider, live calls against a fake Apigee)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  before(async () => {
    await new Promise<void>((resolve) => fake.listen(0, resolve));
    process.env.PROVISIONING_MODE = "apigee";
    process.env.APIGEE_ORG = "test-org";
    process.env.APIGEE_DRY_RUN = "false";
    process.env.APIGEE_ACCESS_TOKEN = "test-token";
    process.env.APIGEE_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
    process.env.APIGEE_POLL_INTERVAL_MS = "20";
    process.env.APIGEE_RUNTIME_HOST = "api.example.com";
    const { default: app } = await import("../src/app");
    server = await startServer(app);
  });
  after(() => { server.close(); fake.close(); });

  const submit = async (overrides: Record<string, unknown> = {}) => {
    calls.length = 0;
    state.deployPolls = 0;
    const created = await json(server.base, "/api/requests", { method: "POST", body: JSON.stringify(wizardPayload(overrides)) });
    return waitForFinish(server.base, created.body.data.id);
  };

  it("provisions new resources and deploys the proxy (all 9 steps)", async () => {
    const done = await submit();
    assert.equal(done.status, "COMPLETED", done.logs.join("\n"));
    assert.ok(done.operations.every((op: any) => op.status === "SUCCESS"));
    assert.equal(done.result.revision, "7");
    assert.equal(done.result.consumerKey, "KEY123");
    assert.equal(done.result.proxyUrl, "https://api.example.com/shipment/v1");

    // every call is authenticated
    assert.ok(calls.every((c) => c.auth === "Bearer test-token"));

    const seq = calls.map((c) => `${c.method} ${c.path.replace("/v1/organizations/test-org", "")}`);
    const at = (needle: string) => seq.findIndex((s) => s === needle);
    // order of the pipeline
    assert.ok(at("POST /apis") > at("GET /environments/dev"));
    assert.ok(at("POST /apiproducts") > at("POST /apis"));
    assert.ok(at("POST /developers") > at("POST /apiproducts"));
    assert.ok(at("POST /developers/logistics@example.com/apps") > at("POST /developers"));
    assert.ok(at("POST /environments/dev/targetservers") > at("POST /developers/logistics@example.com/apps"));
    assert.ok(at("POST /environments/dev/apis/shipment-api/revisions/7/deployments") > at("POST /environments/dev/targetservers"));

    // proxy import: multipart upload with a zip in the "file" field
    const imp = calls.find((c) => c.method === "POST" && c.path.endsWith("/apis"))!;
    assert.equal(imp.query.get("action"), "import");
    assert.equal(imp.query.get("name"), "shipment-api");
    assert.match(imp.contentType, /^multipart\/form-data; boundary=/);
    assert.match(imp.body, /name="file"; filename="shipment-api\.zip"/);
    assert.ok(imp.body.includes("PK\x03\x04"), "zip payload present");

    // product / app / target server bodies
    const product = JSON.parse(calls.find((c) => c.method === "POST" && c.path.endsWith("/apiproducts"))!.body);
    assert.deepEqual(product.proxies, ["shipment-api"]);
    assert.deepEqual(product.environments, ["dev"]);
    const app = JSON.parse(calls.find((c) => c.method === "POST" && c.path.endsWith("/apps"))!.body);
    assert.deepEqual(app, { name: "shipment-partner-app", apiProducts: ["shipment-product"] });
    const target = JSON.parse(calls.find((c) => c.method === "POST" && c.path.endsWith("/targetservers"))!.body);
    assert.equal(target.host, "mocktarget.apigee.net");
    assert.equal(target.port, 443);
    assert.deepEqual(target.sSLInfo, { enabled: true });

    // deploy uses override=true, then polls until READY
    const deploy = calls.find((c) => c.method === "POST" && c.path.endsWith("/deployments"))!;
    assert.equal(deploy.query.get("override"), "true");
    assert.ok(state.deployPolls >= 2);

    // secrets are never written to the request log
    assert.ok(!done.logs.join("\n").includes("SECRET-never-logged"));
  });

  it("adds the proxy to an existing API product instead of re-creating it", async () => {
    state.existing.add("product");
    const done = await submit({ product: { mode: "existing", name: "shipment-product" } });
    state.existing.delete("product");
    assert.equal(done.status, "COMPLETED", done.logs.join("\n"));
    const put = calls.find((c) => c.method === "PUT")!;
    const body = JSON.parse(put.body);
    assert.deepEqual(body.proxies.sort(), ["other-api", "shipment-api"]);
    assert.deepEqual(body.environments.sort(), ["dev", "test"]);
    assert.ok(!calls.some((c) => c.method === "POST" && c.path.endsWith("/apiproducts")));
  });

  it("fails at step 7 when a selected shared flow is not deployed", async () => {
    state.sharedFlowDeployed = false;
    const done = await submit({
      policies: { sharedFlows: [{ name: "SF-Common-Logging", placement: "Proxy Endpoint Request PreFlow", calloutPolicyName: "FC-Logging" }] },
    });
    state.sharedFlowDeployed = true;
    assert.equal(done.status, "FAILED");
    assert.equal(done.operations[6].status, "FAILED");
    assert.ok(done.logs.some((l: string) => /SF-Common-Logging.*not deployed/.test(l)));
    assert.ok(!calls.some((c) => c.path.endsWith("/deployments") && c.method === "POST"), "must not deploy");
  });

  it("fails at step 9 when Apigee reports a deployment ERROR", async () => {
    state.deployError = true;
    const done = await submit();
    state.deployError = false;
    assert.equal(done.status, "FAILED");
    assert.equal(done.operations[8].status, "FAILED");
    assert.ok(done.logs.some((l: string) => l.includes("missing shared flow")));
  });
});
