import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

export const SAMPLE_SPEC = fs.readFileSync(
  path.resolve(__dirname, "../../samples/shipment-api.yaml"),
  "utf8"
);

/** The same shape the frontend wizard submits. */
export function wizardPayload(overrides: Record<string, unknown> = {}) {
  return {
    submit: true,
    apiName: "shipment-api",
    displayName: "Shipment API",
    environment: "dev",
    basePath: "/shipment/v1",
    version: "v1",
    description: "APIs to manage shipment operations.",
    specFileName: "shipment-api.yaml",
    specContent: SAMPLE_SPEC,
    consumer: "Internal",
    authType: "API Key",
    authConfig: { header: "x-api-key" },
    product: { mode: "new", name: "shipment-product", displayName: "Shipment API Product" },
    developer: { mode: "new", name: "logistics-partner", email: "logistics@example.com" },
    developerApp: { mode: "new", name: "shipment-partner-app" },
    target: { mode: "new", name: "shipment-backend", url: "https://mocktarget.apigee.net" },
    policies: {
      quota: { enabled: true, policyName: "Quota-Default", displayName: "Quota", limit: 1000, timeUnit: "day", identifier: "Developer App" },
      spikeArrest: { enabled: true, policyName: "SpikeArrest-Default", displayName: "Spike Arrest", rate: 100, timeUnit: "pm" },
      jsonThreatProtection: { enabled: true, policyName: "JSON-Threat-Protection", displayName: "JSON Threat", maxDepth: 10, maxEntries: 100, maxStringLength: 5000 },
      cors: { enabled: true, policyName: "CORS-Policy", displayName: "CORS", origins: "*", methods: "GET, POST, OPTIONS", headers: "Content-Type, x-api-key" },
      sharedFlows: [],
    },
    ...overrides,
  };
}

export async function startServer(app: { listen: (port: number, cb: () => void) => any }) {
  return new Promise<{ base: string; close: () => void }>((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ base: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

export async function json(base: string, route: string, init?: RequestInit) {
  const response = await fetch(base + route, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  return { status: response.status, body: (await response.json()) as any };
}

export async function waitForFinish(base: string, id: string, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await json(base, `/api/requests/${id}`);
    if (["COMPLETED", "FAILED"].includes(body.data.status)) return body.data;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for the request to finish");
}
