import path from "node:path";

export interface ApigeeConfig {
  org: string;
  /** When true nothing is sent to Apigee; the bundle is written to disk instead. */
  dryRun: boolean;
  /** Short-lived token (e.g. from `gcloud auth print-access-token`). Optional. */
  accessToken?: string;
  /** Service account the deployed proxy runs as (optional). */
  deployServiceAccount?: string;
  /** Environment-group hostname, used to print a test URL (optional). */
  runtimeHost?: string;
  deployTimeoutMs: number;
  pollIntervalMs: number;
  /** Management API base URL. Only overridden by tests (fake Apigee server). */
  baseUrl: string;
  bundleDir: string;
}

export function loadApigeeConfig(env = process.env): ApigeeConfig {
  const org = (env.APIGEE_ORG || "").trim();
  if (!org) {
    throw new Error(
      "PROVISIONING_MODE=apigee requires APIGEE_ORG (your Google Cloud project ID that hosts Apigee X)."
    );
  }
  return {
    org,
    // Safe default: anything other than an explicit "false" is a dry run.
    dryRun: (env.APIGEE_DRY_RUN ?? "true").trim().toLowerCase() !== "false",
    accessToken: env.APIGEE_ACCESS_TOKEN?.trim() || undefined,
    deployServiceAccount: env.APIGEE_DEPLOY_SERVICE_ACCOUNT?.trim() || undefined,
    runtimeHost: env.APIGEE_RUNTIME_HOST?.trim() || undefined,
    deployTimeoutMs: Number(env.APIGEE_DEPLOY_TIMEOUT_MS) || 180_000,
    pollIntervalMs: Number(env.APIGEE_POLL_INTERVAL_MS) || 3000,
    baseUrl: (env.APIGEE_BASE_URL || "https://apigee.googleapis.com/v1").replace(/\/+$/, ""),
    bundleDir: path.resolve(env.APIGEE_BUNDLE_DIR || "bundles"),
  };
}
