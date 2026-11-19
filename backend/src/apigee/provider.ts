import fs from "node:fs/promises";
import path from "node:path";
import { logLine } from "../log";
import { resources as mockResources } from "../resources";
import type { ProvisioningProvider, ResourceCatalog } from "../provisioning";
import type { ProvisioningRequest } from "../types";
import { buildProxyBundle, SUPPORTED_AUTH, type BuiltBundle } from "./bundle";
import { ApigeeClient, enc } from "./client";
import type { ApigeeConfig } from "./config";

const NAME_RE = /^[A-Za-z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const names = (list: unknown, key: string): string[] =>
  (Array.isArray(list) ? list : [])
    .map((item) => (typeof item === "string" ? item : item?.[key] ?? item?.name))
    .filter((n): n is string => typeof n === "string")
    .sort();

export class ApigeeProvider implements ProvisioningProvider {
  readonly name = "apigee";
  readonly dryRun: boolean;
  readonly org: string;
  private client: ApigeeClient;
  private cfg: ApigeeConfig;
  // Generated bundles are kept between step 1 (build) and step 2 (upload).
  private bundles = new Map<string, BuiltBundle>();

  constructor(cfg: ApigeeConfig) {
    this.cfg = cfg;
    this.dryRun = cfg.dryRun;
    this.org = cfg.org;
    this.client = new ApigeeClient(cfg);
  }

  private orgPath = () => `/organizations/${enc(this.cfg.org)}`;
  private envPath = (env: string) => `${this.orgPath()}/environments/${enc(env)}`;

  async execute(step: number, request: ProvisioningRequest): Promise<void> {
    switch (step) {
      case 1: return this.validate(request);
      case 2: return this.importProxy(request);
      case 3: return this.provisionProduct(request);
      case 4: return this.provisionDeveloper(request);
      case 5: return this.provisionApp(request);
      case 6: return this.provisionTargetServer(request);
      case 7: return this.checkSharedFlows(request);
      case 8: return this.deploy(request);
      case 9: return this.verify(request);
      default: throw new Error(`Unknown pipeline step ${step}`);
    }
  }

  /** Called when a request finishes (success or failure) to free memory. */
  onFinish(request: ProvisioningRequest): void {
    this.bundles.delete(request.id);
  }

  /* ---------------- live catalogue for the UI dropdowns ---------------- */

  async listResources(env: string): Promise<ResourceCatalog> {
    // Dry run needs no credentials, so dropdowns use the built-in sample lists.
    if (this.dryRun) return mockResources;
    const org = this.orgPath();
    const [products, developers, apps, targets, flows] = await Promise.all([
      this.client.call("GET", `${org}/apiproducts`),
      this.client.call("GET", `${org}/developers`),
      this.client.call("GET", `${org}/apps`, { query: { expand: "true" } }),
      this.client.call("GET", `${this.envPath(env)}/targetservers`),
      this.client.call("GET", `${org}/sharedflows`),
    ]);
    return {
      products: names(products.data.apiProduct, "name"),
      developers: names(developers.data.developer, "email"),
      apps: names(apps.data.app, "name"),
      targets: names(targets.data, "name"),
      sharedFlows: { [env]: names(flows.data.sharedFlows ?? flows.data.proxies, "name") },
    };
  }

  /* ---------------- 1. validate ---------------- */

  private async validate(req: ProvisioningRequest): Promise<void> {
    const p = req.payload;
    const problems: string[] = [];

    if (!SUPPORTED_AUTH.includes(p.authType)) {
      problems.push(
        `authentication "${p.authType}" is not supported for real provisioning yet (supported: ${SUPPORTED_AUTH.join(", ")})`
      );
    }
    if (!p.basePath.startsWith("/")) problems.push('base path must start with "/"');
    if (!NAME_RE.test(p.product.name)) problems.push("API product name is missing or has invalid characters");
    if (!EMAIL_RE.test(p.developer.email)) problems.push("developer e-mail is invalid");
    if (!NAME_RE.test(p.developerApp.name)) problems.push("developer app name is missing or has invalid characters");
    if (!NAME_RE.test(p.target.name)) problems.push("target server name is missing or has invalid characters");
    if (p.target.mode === "new") {
      try {
        const url = new URL(p.target.url ?? "");
        if (!/^https?:$/.test(url.protocol)) throw new Error();
      } catch {
        problems.push("backend URL must be a valid http(s) URL");
      }
    }
    if (problems.length) throw new Error(`Invalid request: ${problems.join("; ")}.`);

    const bundle = await buildProxyBundle(p);
    this.bundles.set(req.id, bundle);
    logLine(req, `Generated proxy bundle: ${bundle.flows.length} flows, ${bundle.policies.length} policies.`);

    if (this.dryRun) {
      logLine(req, `DRY RUN: skipping the Apigee access check for org "${this.cfg.org}".`);
      return;
    }
    await this.client.call("GET", this.orgPath());
    await this.client.call("GET", this.envPath(p.environment));
    logLine(req, `Apigee org "${this.cfg.org}" and environment "${p.environment}" are reachable.`);
  }

  /* ---------------- 2. import proxy ---------------- */

  private async importProxy(req: ProvisioningRequest): Promise<void> {
    const bundle = this.bundles.get(req.id);
    if (!bundle) throw new Error("Proxy bundle was not generated.");
    const api = req.payload.apiName;

    if (this.dryRun) {
      await fs.mkdir(this.cfg.bundleDir, { recursive: true });
      const file = path.join(this.cfg.bundleDir, `${api}-${req.id}.zip`);
      await fs.writeFile(file, bundle.buffer);
      req.result.bundlePath = file;
      req.result.revision = "1";
      logLine(req, `DRY RUN: would import "${api}" into Apigee. Bundle saved to ${file}`);
      return;
    }

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bundle.buffer)], { type: "application/zip" }), `${api}.zip`);
    const { data } = await this.client.call("POST", `${this.orgPath()}/apis`, {
      query: { name: api, action: "import" },
      form,
    });
    req.result.revision = String(data.revision);
    logLine(req, `Imported proxy "${api}" as revision ${data.revision}.`);
  }

  /* ---------------- 3. API product ---------------- */

  private async provisionProduct(req: ProvisioningRequest): Promise<void> {
    const { product, environment: env, apiName: api } = req.payload;
    const base = `${this.orgPath()}/apiproducts/${enc(product.name)}`;

    if (this.dryRun) {
      return logLine(req, `DRY RUN: would ${product.mode === "new" ? "create" : "update"} API product "${product.name}" with proxy "${api}" in "${env}".`);
    }
    const existing = await this.client.call("GET", base, { allow: [404] });

    if (existing.status === 404) {
      if (product.mode === "existing") throw new Error(`API product "${product.name}" does not exist.`);
      await this.client.call("POST", `${this.orgPath()}/apiproducts`, {
        json: {
          name: product.name,
          displayName: product.displayName || product.name,
          description: product.description ?? "",
          approvalType: "auto",
          environments: [env],
          proxies: [api],
          attributes: [{ name: "access", value: "private" }],
        },
      });
      return logLine(req, `Created API product "${product.name}".`);
    }

    // Product exists: make sure it includes this proxy and environment.
    const body = existing.data;
    const proxies: string[] = body.proxies ?? [];
    const environments: string[] = body.environments ?? [];
    if (proxies.includes(api) && environments.includes(env)) {
      return logLine(req, `API product "${product.name}" already includes "${api}" in "${env}".`);
    }
    if (!proxies.includes(api)) proxies.push(api);
    if (!environments.includes(env)) environments.push(env);
    await this.client.call("PUT", base, { json: { ...body, proxies, environments } });
    logLine(req, `Added "${api}" (${env}) to existing API product "${product.name}".`);
  }

  /* ---------------- 4. developer ---------------- */

  private async provisionDeveloper(req: ProvisioningRequest): Promise<void> {
    const { developer } = req.payload;
    if (this.dryRun) {
      return logLine(req, `DRY RUN: would ${developer.mode === "new" ? "create or reuse" : "verify"} developer ${developer.email}.`);
    }
    const found = await this.client.call("GET", `${this.orgPath()}/developers/${enc(developer.email)}`, { allow: [404] });
    if (found.status !== 404) return logLine(req, `Developer ${developer.email} already exists; reusing it.`);
    if (developer.mode === "existing") throw new Error(`Developer "${developer.email}" does not exist.`);

    await this.client.call("POST", `${this.orgPath()}/developers`, {
      json: {
        email: developer.email,
        firstName: developer.name || developer.email.split("@")[0],
        lastName: "Developer", // Apigee requires a last name; the portal only collects one name.
        userName: developer.name || developer.email.split("@")[0],
      },
    });
    logLine(req, `Created developer ${developer.email}.`);
  }

  /* ---------------- 5. developer app ---------------- */

  private async provisionApp(req: ProvisioningRequest): Promise<void> {
    const { developer, developerApp: app, product } = req.payload;
    if (this.dryRun) {
      req.result.consumerKey = "DRY-RUN-NO-KEY-CREATED";
      return logLine(req, `DRY RUN: would ${app.mode === "new" ? "create" : "reuse"} app "${app.name}" for ${developer.email} with product "${product.name}".`);
    }
    const base = `${this.orgPath()}/developers/${enc(developer.email)}/apps/${enc(app.name)}`;
    const found = await this.client.call("GET", base, { allow: [404] });

    if (found.status === 404) {
      if (app.mode === "existing") throw new Error(`Developer app "${app.name}" does not exist for ${developer.email}.`);
      const created = await this.client.call("POST", `${this.orgPath()}/developers/${enc(developer.email)}/apps`, {
        json: { name: app.name, apiProducts: [product.name] },
      });
      req.result.consumerKey = created.data.credentials?.[0]?.consumerKey;
      return logLine(req, `Created app "${app.name}" with product "${product.name}" and generated credentials.`);
    }

    const credential = (found.data.credentials ?? [])[0];
    if (!credential) throw new Error(`App "${app.name}" has no credentials to attach the product to.`);
    const products = new Set<string>(
      (credential.apiProducts ?? []).map((x: { apiproduct?: string }) => x.apiproduct).filter(Boolean)
    );
    products.add(product.name);
    await this.client.call("POST", `${base}/keys/${enc(credential.consumerKey)}`, {
      json: { apiProducts: [...products] },
    });
    req.result.consumerKey = credential.consumerKey;
    logLine(req, `Attached product "${product.name}" to existing app "${app.name}".`);
  }

  /* ---------------- 6. target server ---------------- */

  private async provisionTargetServer(req: ProvisioningRequest): Promise<void> {
    const { target, environment: env } = req.payload;
    if (this.dryRun) {
      return logLine(req, `DRY RUN: would ${target.mode === "new" ? "create or reuse" : "verify"} target server "${target.name}" in "${env}".`);
    }
    const base = `${this.envPath(env)}/targetservers`;
    const found = await this.client.call("GET", `${base}/${enc(target.name)}`, { allow: [404] });
    if (found.status !== 404) return logLine(req, `Target server "${target.name}" exists in "${env}"; reusing it.`);
    if (target.mode === "existing") throw new Error(`Target server "${target.name}" does not exist in "${env}".`);

    const url = new URL(target.url ?? "");
    const https = url.protocol === "https:";
    await this.client.call("POST", base, {
      json: {
        name: target.name,
        host: url.hostname,
        port: Number(url.port) || (https ? 443 : 80),
        isEnabled: true,
        sSLInfo: { enabled: https },
      },
    });
    logLine(req, `Created target server "${target.name}" → ${url.hostname}.`);
  }

  /* ---------------- 7. shared flows ---------------- */

  private async checkSharedFlows(req: ProvisioningRequest): Promise<void> {
    const flows = (Array.isArray((req.payload.policies as any).sharedFlows)
      ? ((req.payload.policies as any).sharedFlows as Array<{ name?: string } | string>)
      : []
    ).map((f) => (typeof f === "string" ? f : f?.name)).filter((n): n is string => !!n);

    if (flows.length === 0) return logLine(req, "No shared flows selected.");
    if (this.dryRun) return logLine(req, `DRY RUN: would verify shared flows are deployed in "${req.payload.environment}": ${flows.join(", ")}.`);

    for (const flow of flows) {
      const res = await this.client.call(
        "GET",
        `${this.envPath(req.payload.environment)}/sharedflows/${enc(flow)}/deployments`,
        { allow: [404] }
      );
      const deployed = res.status === 200 && (res.data.deployments ?? []).length > 0;
      if (!deployed) {
        throw new Error(`Shared flow "${flow}" is not deployed in "${req.payload.environment}". Deploy it first; the proxy cannot deploy without it.`);
      }
    }
    logLine(req, `Shared flows are deployed in "${req.payload.environment}": ${flows.join(", ")}.`);
  }

  /* ---------------- 8. deploy ---------------- */

  private revisionPath(req: ProvisioningRequest): string {
    const { apiName, environment } = req.payload;
    return `${this.envPath(environment)}/apis/${enc(apiName)}/revisions/${enc(req.result.revision ?? "")}/deployments`;
  }

  private async deploy(req: ProvisioningRequest): Promise<void> {
    if (!req.result.revision) throw new Error("No proxy revision to deploy.");
    if (this.dryRun) {
      return logLine(req, `DRY RUN: would deploy "${req.payload.apiName}" revision ${req.result.revision} to "${req.payload.environment}".`);
    }
    const query: Record<string, string> = { override: "true" };
    if (this.cfg.deployServiceAccount) query.serviceAccount = this.cfg.deployServiceAccount;
    await this.client.call("POST", this.revisionPath(req), { query });
    logLine(req, `Deployment of revision ${req.result.revision} started in "${req.payload.environment}".`);
  }

  /* ---------------- 9. verify ---------------- */

  private async verify(req: ProvisioningRequest): Promise<void> {
    const { apiName, basePath } = req.payload;
    req.result.dryRun = this.dryRun;

    if (this.dryRun) {
      return logLine(req, "DRY RUN: nothing was changed in Apigee. Set APIGEE_DRY_RUN=false to provision for real.");
    }
    const deadline = Date.now() + this.cfg.deployTimeoutMs;
    let lastState = "";
    while (Date.now() < deadline) {
      const { data } = await this.client.call("GET", this.revisionPath(req));
      const state = String(data.state ?? "").toUpperCase();
      if (state !== lastState) logLine(req, `Deployment state: ${state || "UNKNOWN"}.`);
      lastState = state;

      if (state === "READY") {
        if (this.cfg.runtimeHost) {
          req.result.proxyUrl = `https://${this.cfg.runtimeHost}${basePath}`;
        }
        return logLine(req, `Deployment of "${apiName}" revision ${req.result.revision} is READY.`);
      }
      if (state === "ERROR") {
        const detail = (data.errors ?? []).map((e: { message?: string }) => e.message).filter(Boolean).join("; ");
        throw new Error(`Deployment failed: ${detail || "see the Apigee console for details"}`);
      }
      await sleep(this.cfg.pollIntervalMs);
    }
    throw new Error(`Deployment did not become READY within ${Math.round(this.cfg.deployTimeoutMs / 1000)}s.`);
  }
}
