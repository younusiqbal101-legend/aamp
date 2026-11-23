import { loadApigeeConfig } from "./apigee/config";
import { ApigeeProvider } from "./apigee/provider";
import { logLine } from "./log";
import { store } from "./store";
import { type ProvisioningOperation, type ProvisioningRequest } from "./types";

export const PIPELINE: Omit<ProvisioningOperation, "status">[] = [
  { id: 1, name: "Validate OpenAPI Specification", description: "Checking YAML structure and API definitions" },
  { id: 2, name: "Import API Proxy", description: "Importing the API proxy bundle into Apigee X" },
  { id: 3, name: "Create API Product", description: "Creating or associating the API Product" },
  { id: 4, name: "Register Developer", description: "Creating or reusing the selected Developer" },
  { id: 5, name: "Create Developer App", description: "Creating the application and associating the API Product" },
  { id: 6, name: "Configure Target Server", description: "Creating or reusing the environment Target Server" },
  { id: 7, name: "Configure Shared Flows", description: "Importing or associating the selected Shared Flows" },
  { id: 8, name: "Deploy API Proxy", description: "Deploying the imported proxy revision" },
  { id: 9, name: "Verify Deployment", description: "Checking the deployment result" },
];

export interface ResourceCatalog {
  proxies: string[];
  basePaths: string[];
  targets: string[];
  products: string[];
  developers: string[];
  apps: string[];
  sharedFlows: Record<string, string[]>;
}

export interface ProvisioningProvider {
  readonly name: string;
  execute(step: number, request: ProvisioningRequest): Promise<void>;
  /** Live catalogue for the UI dropdowns. */
  listResources(env: string): Promise<ResourceCatalog>;
  listDeveloperApps(email: string): Promise<string[]>;
  listAppsWithOwners(): Promise<Array<{ name: string; email: string }>>;
  /** Environment names that exist in the target Apigee org. */
  listEnvironments(): Promise<string[]>;
  /** Free any per-request state once the pipeline has ended. */
  onFinish?(request: ProvisioningRequest): void;
}

function createProvider(): ProvisioningProvider {
  const mode = (process.env.PROVISIONING_MODE || "apigee").trim().toLowerCase();
  if (mode === "apigee") return new ApigeeProvider(loadApigeeConfig());
  throw new Error(`Unsupported PROVISIONING_MODE "${mode}". Use "apigee".`);
}

export const provider: ProvisioningProvider = createProvider();

export function providerInfo() {
  const apigee = provider instanceof ApigeeProvider ? provider : null;
  return {
    mode: provider.name,
    dryRun: apigee ? apigee.dryRun : null,
    org: apigee ? apigee.org : null,
  };
}

export function newOperations(payload?: ProvisioningRequest["payload"]): ProvisioningOperation[] {
  return PIPELINE.map((op) => {
    if (payload && op.id === 3) return { ...op, name: payload.product.mode === "existing" ? "Associate Existing API Product" : "Create API Product", description: payload.product.mode === "existing" ? "Associate the proxy with the selected API product" : "Create the API product", status: "PENDING" as const };
    if (payload && op.id === 4) return { ...op, name: payload.developer.mode === "existing" ? "Verify Existing Developer" : "Create Developer", description: payload.developer.mode === "existing" ? "Verify the selected developer" : "Create the developer", status: "PENDING" as const };
    if (payload && op.id === 5) return { ...op, name: payload.developerApp.mode === "existing" ? "Associate Existing Developer App" : "Create Developer App", description: payload.developerApp.mode === "existing" ? "Associate the API product with the selected app" : "Create the app and associate the API product", status: "PENDING" as const };
    if (payload && op.id === 6) return { ...op, name: payload.target.mode === "existing" ? "Verify Existing Target Server" : "Create Target Server", description: payload.target.mode === "existing" ? "Verify the selected target server" : "Create the target server", status: "PENDING" as const };
    return { ...op, status: "PENDING" as const };
  });
}

export function startProvisioning(request: ProvisioningRequest): void {
  request.status = "PROVISIONING";
  request.operations = newOperations(request.payload);
  request.result = {};
  request.logs = [];
  logLine(request, "Provisioning request accepted.");
  const info = providerInfo();
  request.provider = { mode: info.mode, dryRun: info.dryRun };
  logLine(
    request,
    `Starting pipeline (Apigee provider, org "${info.org}", ${info.dryRun ? "DRY RUN" : "LIVE"}).`
  );
  store.save(request);
  void run(request);
}

async function run(request: ProvisioningRequest): Promise<void> {
  try {
    for (const op of request.operations) {
      op.status = "IN_PROGRESS";
      store.save(request);

      try {
        await provider.execute(op.id, request);
        op.status = "SUCCESS";
        logLine(request, `SUCCESS: ${op.name}`);
        store.save(request);
      } catch (error) {
        op.status = "FAILED";
        request.status = "FAILED";
        const detail = error instanceof Error ? error.message : "Unknown error";
        logLine(request, `FAILED: ${op.name} — ${detail}`);
        store.save(request);
        return;
      }
    }

    request.status = "COMPLETED";
    logLine(request, "Pipeline completed.");
    store.save(request);
  } finally {
    provider.onFinish?.(request);
  }
}
