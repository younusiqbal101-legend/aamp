import type { ParsedOpenApiSpec } from "./openApiParser";

export type OperationStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";
export type RequestStatus = "DRAFT" | "PROVISIONING" | "COMPLETED" | "FAILED";

export type ProvisioningOperation = {
  id: number;
  name: string;
  description: string;
  status: OperationStatus;
};

export type RequestSummary = {
  id: string;
  apiName: string;
  environment: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProvisioningResult = {
  revision?: string;
  consumerKey?: string;
  proxyUrl?: string;
  bundlePath?: string;
  dryRun?: boolean;
};

export type ProviderInfo = {
  mode: "apigee";
  dryRun: boolean | null;
};

export type BackendHealth = {
  success: boolean;
  mode: string;
  dryRun: boolean | null;
  org: string | null;
};

export type RequestDetail = RequestSummary & {
  operations: ProvisioningOperation[];
  logs: string[];
  provider?: ProviderInfo;
  result?: ProvisioningResult;
};

export type ResourceCatalog = {
  targets: string[];
  products: string[];
  developers: string[];
  apps: string[];
  sharedFlows: Record<string, string[]>;
};

export type CreateRequestInput = {
  submit: boolean;
  apiName: string;
  displayName: string;
  environment: string;
  basePath: string;
  version: string;
  description: string;
  specFileName: string;
  specContent: string;
  consumer: string;
  authType: string;
  authConfig: Record<string, unknown>;
  product: Record<string, unknown>;
  developer: Record<string, unknown>;
  developerApp: Record<string, unknown>;
  target: Record<string, unknown>;
  policies: Record<string, unknown>;
};

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Make sure it is running on port 5000."
    );
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    const message =
      body?.errors?.join(" ") ||
      body?.message ||
      `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body?.data ?? body;
}

export const api = {
  // /health returns its fields at the top level (no "data" wrapper).
  health: () => request<BackendHealth>("/health"),
  environments: () => request<string[]>("/environments"),
  resources: (env: string) =>
    request<ResourceCatalog>(`/resources?env=${encodeURIComponent(env)}`),
  validateSpec: (content: string) =>
    request<ParsedOpenApiSpec>("/specs/validate", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  createRequest: (input: CreateRequestInput) =>
    request<RequestDetail>("/requests", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listRequests: () => request<RequestSummary[]>("/requests"),
  getRequest: (id: string) => request<RequestDetail>(`/requests/${id}`),
};
