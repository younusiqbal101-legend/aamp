import { store } from "./store";
import type { ProvisioningOperation, ProvisioningRequest } from "./types";

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

/**
 * Seam for the real Apigee X integration. Implement this with the Apigee
 * Management API (service-account auth) and swap it in createProvider().
 */
export interface ProvisioningProvider {
  readonly name: string;
  execute(step: number, request: ProvisioningRequest): Promise<void>;
}

class MockProvider implements ProvisioningProvider {
  readonly name = "mock";
  async execute(): Promise<void> {
    const delay = Number(process.env.MOCK_STEP_DELAY_MS) || 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function createProvider(): ProvisioningProvider {
  // PROVISIONING_MODE=apigee will select the real provider once it exists.
  return new MockProvider();
}

const provider = createProvider();

const stamp = () => new Date().toISOString().slice(11, 19);

export function newOperations(): ProvisioningOperation[] {
  return PIPELINE.map((op) => ({ ...op, status: "PENDING" as const }));
}

export function startProvisioning(request: ProvisioningRequest): void {
  request.status = "PROVISIONING";
  request.operations = newOperations();
  request.logs = [
    `[${stamp()}] Provisioning request accepted.`,
    `[${stamp()}] Starting API provisioning pipeline (${provider.name} provider)...`,
  ];
  store.save(request);
  void run(request);
}

async function run(request: ProvisioningRequest): Promise<void> {
  for (const op of request.operations) {
    op.status = "IN_PROGRESS";
    store.save(request);

    try {
      await provider.execute(op.id, request);
      op.status = "SUCCESS";
      request.logs.push(`[${stamp()}] SUCCESS: ${op.name}`);
      store.save(request);
    } catch (error) {
      op.status = "FAILED";
      request.status = "FAILED";
      const detail = error instanceof Error ? error.message : "Unknown error";
      request.logs.push(`[${stamp()}] FAILED: ${op.name} — ${detail}`);
      store.save(request);
      return;
    }
  }

  request.status = "COMPLETED";
  request.logs.push(
    `[${stamp()}] Pipeline completed.`,
    provider.name === "mock"
      ? `[${stamp()}] Mock provider: no Apigee resources were created.`
      : `[${stamp()}] All operations finished.`
  );
  store.save(request);
}
