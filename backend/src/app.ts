import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { parseOpenApiSpec } from "./openApiParser";
import { newOperations, provider, providerInfo, startProvisioning } from "./provisioning";
import { nextRequestId, store } from "./store";
import { createPublished, listPublished } from "./publishedCatalog";
import {
  isValidEnvironmentName,
  type Environment,
  type ProvisioningRequest,
  type RequestPayload,
} from "./types";

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "5mb" }));

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const str = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const obj = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Apigee Developer Portal backend is running",
    timestamp: new Date().toISOString(),
    ...providerInfo(),
  });
});

app.get("/api/environments", async (_req, res) => {
  try {
    res.json({ success: true, data: await provider.listEnvironments() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new HttpError(502, `Could not load environments: ${detail}`);
  }
});

app.get("/api/developer-apps", async (req, res) => {
  const email = str(req.query.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Select a valid developer email.");
  try { res.json({ success: true, data: await provider.listDeveloperApps(email) }); }
  catch (error) { throw new HttpError(502, `Could not load developer apps: ${error instanceof Error ? error.message : "unknown error"}`); }
});

app.get("/api/developer-app-owners", async (_req, res) => {
  try { res.json({ success: true, data: await provider.listAppsWithOwners() }); }
  catch (error) { throw new HttpError(502, `Could not load developer apps: ${error instanceof Error ? error.message : "unknown error"}`); }
});

app.get("/api/resources", async (req, res) => {
  const env = str(req.query.env);
  if (!isValidEnvironmentName(env)) {
    throw new HttpError(400, "env is not a valid environment name.");
  }
  try {
    res.json({ success: true, data: await provider.listResources(env) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new HttpError(502, `Could not load resources: ${detail}`);
  }
});

app.get("/api/published-apis", async (_req, res) => {
  res.json({ success: true, data: await listPublished() });
});

app.post("/api/published-apis", async (req, res) => {
  const product = str(req.body?.product).trim();
  const title = str(req.body?.title).trim();
  const description = str(req.body?.description).trim();
  const specContent = str(req.body?.specContent);
  const environment = str(req.body?.environment);
  if (!product || !title || !specContent || !isValidEnvironmentName(environment)) throw new HttpError(400, "Select a product and enter a title, environment and OpenAPI document.");
  try { parseOpenApiSpec(specContent); } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Invalid OpenAPI document."); }
  const resources = await provider.listResources(environment);
  if (!resources.products.includes(product)) throw new HttpError(400, "The selected API product was not found in Apigee.");
  const entry = { product, title, description, specContent, publishedAt: new Date().toISOString() };
  try { await createPublished(entry); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new HttpError(409, "This API product is already published.");
    throw error;
  }
  res.status(201).json({ success: true, data: entry });
});

app.post("/api/specs/validate", (req, res) => {
  const content = str(req.body?.content);
  try {
    const spec = parseOpenApiSpec(content);
    res.json({ success: true, data: spec });
  } catch (error) {
    res.status(422).json({
      success: false,
      errors: [error instanceof Error ? error.message : "Invalid specification."],
    });
  }
});

function toPayload(body: Record<string, unknown>): RequestPayload {
  const environment = str(body.environment) as Environment;
  if (!isValidEnvironmentName(environment)) {
    throw new HttpError(400, "environment is not a valid environment name.");
  }
  const apiName = str(body.apiName).trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(apiName)) {
    throw new HttpError(400, "apiName must be lowercase letters, digits and hyphens.");
  }
  const specContent = str(body.specContent);
  try {
    parseOpenApiSpec(specContent);
  } catch (error) {
    throw new HttpError(422, error instanceof Error ? error.message : "Invalid specification.");
  }
  const product = obj(body.product);
  const developer = obj(body.developer);
  const developerApp = obj(body.developerApp);
  const target = obj(body.target);

  return {
    apiName,
    displayName: str(body.displayName, apiName),
    environment,
    basePath: str(body.basePath),
    version: str(body.version),
    description: str(body.description),
    specFileName: str(body.specFileName),
    specContent,
    consumer: str(body.consumer),
    authType: str(body.authType),
    authConfig: obj(body.authConfig),
    product: {
      mode: str(product.mode, "new"),
      name: str(product.name),
      displayName: str(product.displayName),
      description: str(product.description),
      space: str(product.space),
      environment: str(product.environment),
      access: str(product.access),
      approval: str(product.approval),
      apiProxy: str(product.apiProxy),
      resourcePath: str(product.resourcePath),
      methods: str(product.methods),
      quotaLimit: str(product.quotaLimit),
      quotaInterval: str(product.quotaInterval),
      quotaUnit: str(product.quotaUnit),
      oauthScopes: str(product.oauthScopes),
    },
    developer: {
      mode: str(developer.mode, "new"),
      name: str(developer.name),
      firstName: str(developer.firstName),
      lastName: str(developer.lastName),
      email: str(developer.email),
    },
    developerApp: { mode: str(developerApp.mode, "new"), name: str(developerApp.name), displayName: str(developerApp.displayName) },
    target: {
      mode: str(target.mode, "existing"),
      name: str(target.name),
      host: str(target.host),
      port: str(target.port),
      protocol: str(target.protocol),
      sslEnabled: Boolean(target.sslEnabled),
    },
    policies: obj(body.policies),
    wizardStep: Number.isInteger(body.wizardStep)
      ? Math.min(5, Math.max(0, body.wizardStep as number))
      : 0,
  };
}

// Never send the (potentially large) spec back in list/detail responses,
// except for drafts: reopening a draft needs its spec and auth settings.
function view(request: ProvisioningRequest, withDetails: boolean) {
  const { payload, ...rest } = request;
  const { specContent: _omit, authConfig: _auth, ...safePayload } = payload;
  const resumable = request.status === "DRAFT";
  return withDetails ? { ...rest, payload: resumable ? payload : safePayload } : {
    id: rest.id,
    apiName: rest.apiName,
    environment: rest.environment,
    status: rest.status,
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
    dryRun: rest.result.dryRun ?? rest.provider?.dryRun ?? null,
  };
}

app.get("/api/requests", async (_req, res) => {
  const requests = await store.list();
  res.json({ success: true, data: requests.map((r) => view(r, false)) });
});

app.get("/api/requests/:id", async (req, res) => {
  const request = await store.get(req.params.id);
  if (!request) throw new HttpError(404, "Request not found.");
  res.json({ success: true, data: view(request, true) });
});

app.post("/api/requests", async (req, res) => {
  const body = obj(req.body);
  const payload = toPayload(body);
  const now = new Date().toISOString();
  const request: ProvisioningRequest = {
    id: await nextRequestId(),
    apiName: payload.apiName,
    environment: payload.environment,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    payload,
    operations: newOperations(payload),
    logs: [],
    result: {},
  };
  await store.save(request);
  if (body.submit === true) await startProvisioning(request);
  res.status(201).json({ success: true, data: view(request, true) });
});

// Saves changes to an existing draft (same ID), so reopening and saving again
// does not create a new request.
app.put("/api/requests/:id", async (req, res) => {
  const request = await store.get(req.params.id);
  if (!request) throw new HttpError(404, "Request not found.");
  if (request.status !== "DRAFT") {
    throw new HttpError(409, `Only drafts can be changed; this request is ${request.status}.`);
  }
  const payload = toPayload(obj(req.body));
  request.apiName = payload.apiName;
  request.environment = payload.environment;
  request.payload = payload;
  request.operations = newOperations(payload);
  await store.save(request);
  res.json({ success: true, data: view(request, true) });
});

app.post("/api/requests/:id/submit", async (req, res) => {
  const request = await store.get(req.params.id);
  if (!request) throw new HttpError(404, "Request not found.");
  if (request.status !== "DRAFT") {
    throw new HttpError(409, `Request is already ${request.status}.`);
  }
  await startProvisioning(request);
  res.json({ success: true, data: view(request, true) });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Not found." });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 413) {
    res.status(status).json({ success: false, message: "Invalid or oversized request body." });
    return;
  }
  console.error(error);
  res.status(500).json({ success: false, message: "Internal server error." });
});

export default app;
