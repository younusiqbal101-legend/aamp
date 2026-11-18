import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { parseOpenApiSpec } from "./openApiParser";
import { newOperations, startProvisioning } from "./provisioning";
import { resources } from "./resources";
import { nextRequestId, store } from "./store";
import {
  ENVIRONMENTS,
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
  });
});

app.get("/api/resources", (_req, res) => {
  res.json({ success: true, data: resources });
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
  if (!ENVIRONMENTS.includes(environment)) {
    throw new HttpError(400, `environment must be one of: ${ENVIRONMENTS.join(", ")}`);
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
    },
    developer: {
      mode: str(developer.mode, "new"),
      name: str(developer.name),
      email: str(developer.email),
    },
    developerApp: { mode: str(developerApp.mode, "new"), name: str(developerApp.name) },
    target: { mode: str(target.mode, "existing"), name: str(target.name), url: str(target.url) },
    policies: obj(body.policies),
  };
}

// Never send the (potentially large) spec back in list/detail responses.
function view(request: ProvisioningRequest, withDetails: boolean) {
  const { payload, ...rest } = request;
  const { specContent: _omit, authConfig: _auth, ...safePayload } = payload;
  return withDetails ? { ...rest, payload: safePayload } : {
    id: rest.id,
    apiName: rest.apiName,
    environment: rest.environment,
    status: rest.status,
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
  };
}

app.get("/api/requests", (_req, res) => {
  res.json({ success: true, data: store.list().map((r) => view(r, false)) });
});

app.get("/api/requests/:id", (req, res) => {
  const request = store.get(req.params.id);
  if (!request) throw new HttpError(404, "Request not found.");
  res.json({ success: true, data: view(request, true) });
});

app.post("/api/requests", (req, res) => {
  const body = obj(req.body);
  const payload = toPayload(body);
  const now = new Date().toISOString();
  const request: ProvisioningRequest = {
    id: nextRequestId(),
    apiName: payload.apiName,
    environment: payload.environment,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    payload,
    operations: newOperations(),
    logs: [],
  };
  store.save(request);
  if (body.submit === true) startProvisioning(request);
  res.status(201).json({ success: true, data: view(request, true) });
});

app.post("/api/requests/:id/submit", (req, res) => {
  const request = store.get(req.params.id);
  if (!request) throw new HttpError(404, "Request not found.");
  if (request.status !== "DRAFT") {
    throw new HttpError(409, `Request is already ${request.status}.`);
  }
  startProvisioning(request);
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
