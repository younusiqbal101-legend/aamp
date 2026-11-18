import { parse } from "yaml";

export type GeneratedOperation = {
  id: string;
  method: string;
  path: string;
  operationId: string;
  summary: string;
  flowName: string;
  condition: string;
  enabled: boolean;
  parameters: string[];
  hasRequestBody: boolean;
  responseCodes: string[];
};

export type GeneratedResource = {
  path: string;
  apigeePath: string;
  operations: GeneratedOperation[];
};

export type ParsedOpenApiSpec = {
  specVersion: string;
  title: string;
  version: string;
  description: string;
  basePath: string;
  resources: GeneratedResource[];
  totalOperations: number;
  schemaCount: number;
};

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toApigeePath(openApiPath: string): string {
  // OpenAPI path parameters are represented as one path segment in MatchesPath.
  return openApiPath.replace(/\{[^/{}]+\}/g, "*");
}

function toFlowName(method: string, path: string): string {
  const pathName = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9]+/g, "-"))
    .join("-");

  const safePath = pathName || "root";
  return `${method.toUpperCase()}-${safePath}`
    .replace(/-+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "");
}

function getBasePath(document: JsonRecord, swagger: boolean): string {
  if (swagger) {
    const basePath = asString(document.basePath);
    return basePath || "";
  }

  const servers = Array.isArray(document.servers) ? document.servers : [];
  const firstServer = servers.find(isRecord);

  if (!firstServer) return "";

  const serverUrl = asString(firstServer.url);
  if (!serverUrl) return "";

  try {
    const parsed = new URL(serverUrl, "https://openapi-placeholder.invalid");
    return parsed.pathname === "/" ? "" : parsed.pathname;
  } catch {
    const withoutQuery = serverUrl.split("?")[0].split("#")[0];
    const path = withoutQuery.replace(/^https?:\/\/[^/]+/i, "");
    return path || "";
  }
}

function countSchemas(document: JsonRecord, swagger: boolean): number {
  const container = swagger
    ? document.definitions
    : isRecord(document.components)
      ? document.components.schemas
      : undefined;

  return isRecord(container) ? Object.keys(container).length : 0;
}

export function parseOpenApiSpec(source: string): ParsedOpenApiSpec {
  if (!source.trim()) {
    throw new Error("The uploaded file is empty.");
  }

  let parsed: unknown;

  try {
    parsed = parse(source);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unknown YAML syntax error.";
    throw new Error(`YAML syntax error: ${detail}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("The OpenAPI document must have an object at its root.");
  }

  const openApiVersion = asString(parsed.openapi);
  const swaggerVersion = asString(parsed.swagger);
  const isOpenApi3 = /^3\.\d+(\.\d+)?$/.test(openApiVersion);
  const isSwagger2 = swaggerVersion === "2.0";

  if (!isOpenApi3 && !isSwagger2) {
    throw new Error(
      'Unsupported specification. This portal currently accepts OpenAPI 3.x or Swagger 2.0 documents.'
    );
  }

  const info = isRecord(parsed.info) ? parsed.info : null;

  if (!info) {
    throw new Error("The specification is missing the required info object.");
  }

  const title = asString(info.title).trim();
  const version = asString(info.version).trim();
  const description = asString(info.description).trim();

  if (!title) {
    throw new Error("The info.title field is required.");
  }

  if (!version) {
    throw new Error("The info.version field is required.");
  }

  const paths = isRecord(parsed.paths) ? parsed.paths : null;

  if (!paths || Object.keys(paths).length === 0) {
    throw new Error("The specification must contain at least one path.");
  }

  const resources: GeneratedResource[] = [];
  let totalOperations = 0;

  for (const [path, pathItemValue] of Object.entries(paths)) {
    if (!path.startsWith("/")) {
      throw new Error(`OpenAPI path "${path}" must start with "/".`);
    }

    if (!isRecord(pathItemValue)) {
      continue;
    }

    const operations: GeneratedOperation[] = [];
    const apigeePath = toApigeePath(path);

    for (const method of HTTP_METHODS) {
      const operationValue = pathItemValue[method];

      if (operationValue === undefined) continue;

      if (!isRecord(operationValue)) {
        throw new Error(`${method.toUpperCase()} ${path} must be an operation object.`);
      }

      const upperMethod = method.toUpperCase();
      const operationId = asString(operationValue.operationId);
      const summary = asString(operationValue.summary) ||
        asString(operationValue.description);

      const parameters = [
        ...(Array.isArray(pathItemValue.parameters) ? pathItemValue.parameters : []),
        ...(Array.isArray(operationValue.parameters) ? operationValue.parameters : []),
      ]
        .filter(isRecord)
        .map((parameter) => {
          const name = asString(parameter.name);
          const location = asString(parameter.in);
          return name && location ? `${name} (${location})` : name || location;
        })
        .filter(Boolean);

      const requestBody = isRecord(operationValue.requestBody)
        ? operationValue.requestBody
        : null;

      const responses = isRecord(operationValue.responses)
        ? Object.keys(operationValue.responses)
        : [];

      const condition =
        `(request.verb = "${upperMethod}") and ` +
        `(proxy.pathsuffix MatchesPath "${apigeePath}")`;

      operations.push({
        id: `${upperMethod}:${path}`,
        method: upperMethod,
        path,
        operationId,
        summary,
        flowName: toFlowName(upperMethod, path),
        condition,
        enabled: true,
        parameters,
        hasRequestBody: Boolean(requestBody) || ["POST", "PUT", "PATCH"].includes(upperMethod),
        responseCodes: responses,
      });

      totalOperations += 1;
    }

    if (operations.length > 0) {
      resources.push({ path, apigeePath, operations });
    }
  }

  if (totalOperations === 0) {
    throw new Error("No supported HTTP operations were found under paths.");
  }

  return {
    specVersion: isOpenApi3 ? `OpenAPI ${openApiVersion}` : `Swagger ${swaggerVersion}`,
    title,
    version,
    description,
    basePath: getBasePath(parsed, isSwagger2),
    resources,
    totalOperations,
    schemaCount: countSchemas(parsed, isSwagger2),
  };
}
