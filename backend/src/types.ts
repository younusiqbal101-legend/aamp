export type OperationStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";
export type RequestStatus = "DRAFT" | "PROVISIONING" | "COMPLETED" | "FAILED";

/** Real environment names come from the Apigee org (e.g. "eval"), so any valid name is accepted. */
export type Environment = string;
export const isValidEnvironmentName = (name: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name);

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
  developer: { mode: string; name: string; firstName?: string; lastName?: string; email: string };
  developerApp: { mode: string; name: string; displayName?: string };
  target: {
    mode: string;
    name: string;
    host?: string;
    port?: string;
    protocol?: string;
    sslEnabled?: boolean;
  };
  policies: Record<string, unknown>;
  /** Wizard step (0-5) the user was on when the draft was saved. */
  wizardStep?: number;
}

export interface ProvisioningResult {
  /** Proxy revision that was imported / deployed. */
  revision?: string;
  /** Consumer key of the developer app (use as the x-api-key to test). Never the secret. */
  consumerKey?: string;
  /** Test URL for the deployed proxy, when APIGEE_RUNTIME_HOST is set. */
  proxyUrl?: string;
  /** Where the generated proxy bundle was written (dry run only). */
  bundlePath?: string;
  dryRun?: boolean;
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
  result: ProvisioningResult;
  provider?: { mode: string; dryRun: boolean | null };
}
