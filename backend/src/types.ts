export type OperationStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";
export type RequestStatus = "DRAFT" | "PROVISIONING" | "COMPLETED" | "FAILED";

export const ENVIRONMENTS = ["dev", "test", "stage", "prod"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export interface ProvisioningOperation {
  id: number;
  name: string;
  description: string;
  status: OperationStatus;
}

export interface RequestPayload {
  apiName: string;
  displayName: string;
  environment: Environment;
  basePath: string;
  version: string;
  description: string;
  specFileName: string;
  specContent: string;
  consumer: string;
  authType: string;
  authConfig: Record<string, unknown>;
  product: {
    mode: string;
    name: string;
    displayName?: string;
    description?: string;
    space?: string;
    environment?: string;
    access?: string;
    approval?: string;
    apiProxy?: string;
    resourcePath?: string;
    methods?: string;
    quotaLimit?: string;
    quotaInterval?: string;
    quotaUnit?: string;
    oauthScopes?: string;
  };
  developer: { mode: string; name: string; email: string };
  developerApp: { mode: string; name: string };
  target: {
    mode: string;
    name: string;
    host?: string;
    port?: string;
    protocol?: string;
    sslEnabled?: boolean;
  };
  policies: Record<string, unknown>;
}

export interface ProvisioningRequest {
  id: string;
  apiName: string;
  environment: Environment;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  payload: RequestPayload;
  operations: ProvisioningOperation[];
  logs: string[];
}
