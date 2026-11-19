import JSZip from "jszip";
import { parseOpenApiSpec } from "../openApiParser";
import type { RequestPayload } from "../types";

/* ---------- small helpers ---------- */

export const esc = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Apigee policy / flow names: letters, digits, '.', '_', '-'. */
export const safeName = (value: string, fallback = "policy"): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;

const rec = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const txt = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;
const posInt = (value: unknown, fallback: number): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

type Step = { name: string; condition?: string };
type Location =
  | "proxyReqPre" | "proxyReqPost" | "proxyResPre" | "proxyResPost"
  | "targetReqPre" | "targetReqPost" | "targetResPre" | "targetResPost"
  | "postClient";

const PLACEMENTS: Record<string, Location> = {
  "Proxy Endpoint Request PreFlow": "proxyReqPre",
  "Proxy Endpoint Request PostFlow": "proxyReqPost",
  "Proxy Endpoint Response PreFlow": "proxyResPre",
  "Proxy Endpoint Response PostFlow": "proxyResPost",
  "Target Endpoint Request PreFlow": "targetReqPre",
  "Target Endpoint Request PostFlow": "targetReqPost",
  "Target Endpoint Response PreFlow": "targetResPre",
  "Target Endpoint Response PostFlow": "targetResPost",
  PostClientFlow: "postClient",
};

const stepsXml = (tag: "Request" | "Response", steps: Step[]): string =>
  steps.length === 0
    ? `<${tag}/>`
    : `<${tag}>${steps
        .map(
          (s) =>
            `<Step><Name>${esc(s.name)}</Name>` +
            (s.condition ? `<Condition>${esc(s.condition)}</Condition>` : "") +
            `</Step>`
        )
        .join("")}</${tag}>`;

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

/* ---------- public API ---------- */

/** Auth schemes the generator can build a correct policy for. */
export const SUPPORTED_AUTH = ["API Key"];

export interface BuiltBundle {
  buffer: Buffer;
  /** Paths inside the zip, for logging / tests. */
  files: string[];
  policies: string[];
  flows: string[];
}

export async function buildProxyBundle(
  payload: RequestPayload
): Promise<BuiltBundle> {
  if (!SUPPORTED_AUTH.includes(payload.authType)) {
    throw new Error(
      `Authentication "${payload.authType}" cannot be generated yet. ` +
        `Supported for real provisioning: ${SUPPORTED_AUTH.join(", ")}.`
    );
  }

  const spec = parseOpenApiSpec(payload.specContent);
  const policyFiles = new Map<string, string>();
  const addPolicy = (name: string, xml: string) => {
    if (policyFiles.has(name)) {
      throw new Error(`Duplicate policy name "${name}". Policy names must be unique.`);
    }
    policyFiles.set(name, XML_HEADER + xml);
  };

  const loc: Record<Location, Step[]> = {
    proxyReqPre: [], proxyReqPost: [], proxyResPre: [], proxyResPost: [],
    targetReqPre: [], targetReqPost: [], targetResPre: [], targetResPost: [],
    postClient: [],
  };

  const policies = rec(payload.policies);
  const quota = rec(policies.quota);
  const spike = rec(policies.spikeArrest);
  const threat = rec(policies.jsonThreatProtection);
  const cors = rec(policies.cors);
  const corsOn = cors.enabled === true;

  // CORS pre-flight (OPTIONS) must not be blocked by auth / quota.
  const skipOptions = corsOn ? '(request.verb != "OPTIONS")' : undefined;

  /* Spike Arrest */
  if (spike.enabled === true) {
    const name = safeName(txt(spike.policyName, "SpikeArrest-Default"));
    const unit = spike.timeUnit === "ps" ? "ps" : "pm";
    addPolicy(
      name,
      `<SpikeArrest continueOnError="false" enabled="true" name="${esc(name)}">` +
        `<DisplayName>${esc(txt(spike.displayName, name))}</DisplayName>` +
        `<Rate>${posInt(spike.rate, 100)}${unit}</Rate></SpikeArrest>`
    );
    loc.proxyReqPre.push({ name, condition: skipOptions });
  }

  /* Authentication: API Key */
  const header = txt(rec(payload.authConfig).header, "x-api-key");
  if (!/^[A-Za-z0-9-]+$/.test(header)) {
    throw new Error(`Invalid API key header name "${header}".`);
  }
  const verifyName = "Verify-API-Key";
  addPolicy(
    verifyName,
    `<VerifyAPIKey continueOnError="false" enabled="true" name="${verifyName}">` +
      `<DisplayName>Verify API Key</DisplayName>` +
      `<APIKey ref="request.header.${esc(header)}"/></VerifyAPIKey>`
  );
  loc.proxyReqPre.push({ name: verifyName, condition: skipOptions });

  /* Quota */
  if (quota.enabled === true) {
    const name = safeName(txt(quota.policyName, "Quota-Default"));
    const unit = ["minute", "hour", "day"].includes(String(quota.timeUnit))
      ? String(quota.timeUnit)
      : "day";
    const identifier =
      quota.identifier === "Client IP"
        ? "client.ip"
        : quota.identifier === "API Key"
          ? `verifyapikey.${verifyName}.client_id`
          : `verifyapikey.${verifyName}.app.name`;
    addPolicy(
      name,
      `<Quota continueOnError="false" enabled="true" name="${esc(name)}">` +
        `<DisplayName>${esc(txt(quota.displayName, name))}</DisplayName>` +
        `<Allow count="${posInt(quota.limit, 1000)}"/><Interval>1</Interval>` +
        `<TimeUnit>${unit}</TimeUnit><Identifier ref="${esc(identifier)}"/>` +
        `<Distributed>true</Distributed><Synchronous>true</Synchronous></Quota>`
    );
    loc.proxyReqPre.push({ name, condition: skipOptions });
  }

  /* JSON Threat Protection (only meaningful with a body) */
  if (threat.enabled === true) {
    const name = safeName(txt(threat.policyName, "JSON-Threat-Protection"));
    addPolicy(
      name,
      `<JSONThreatProtection continueOnError="false" enabled="true" name="${esc(name)}">` +
        `<DisplayName>${esc(txt(threat.displayName, name))}</DisplayName>` +
        `<ContainerDepth>${posInt(threat.maxDepth, 10)}</ContainerDepth>` +
        `<ObjectEntryCount>${posInt(threat.maxEntries, 100)}</ObjectEntryCount>` +
        `<StringValueLength>${posInt(threat.maxStringLength, 5000)}</StringValueLength>` +
        `<Source>request</Source></JSONThreatProtection>`
    );
    loc.proxyReqPre.push({
      name,
      condition:
        '(request.verb = "POST") or (request.verb = "PUT") or (request.verb = "PATCH")',
    });
  }

  /* Shared flows via FlowCallout, at the placement chosen in the UI */
  const sharedFlows = Array.isArray(policies.sharedFlows) ? policies.sharedFlows : [];
  for (const item of sharedFlows) {
    const sf = typeof item === "string" ? { name: item } : rec(item);
    const sfName = txt(sf.name);
    if (!sfName) continue;
    const callout = safeName(txt(sf.calloutPolicyName, `FC-${sfName}`));
    addPolicy(
      callout,
      `<FlowCallout continueOnError="false" enabled="true" name="${esc(callout)}">` +
        `<DisplayName>${esc(callout)}</DisplayName>` +
        `<SharedFlowBundle>${esc(sfName)}</SharedFlowBundle></FlowCallout>`
    );
    loc[PLACEMENTS[txt(sf.placement)] ?? "proxyReqPre"].push({ name: callout });
  }

  /* CORS */
  const corsSteps: Step[] = [];
  if (corsOn) {
    const base = safeName(txt(cors.policyName, "CORS-Policy"));
    const origins = txt(cors.origins, "*").split(",").map((o) => o.trim()).filter(Boolean);
    const methods = txt(cors.methods, "GET, POST, PUT, DELETE, OPTIONS");
    const headers = txt(cors.headers, "Content-Type, Authorization");
    origins.forEach((origin, index) => {
      const name = origins.length === 1 ? base : `${base}-${index + 1}`;
      addPolicy(
        name,
        `<AssignMessage continueOnError="false" enabled="true" name="${esc(name)}">` +
          `<DisplayName>${esc(name)}</DisplayName><Set><Headers>` +
          `<Header name="Access-Control-Allow-Origin">${esc(origin)}</Header>` +
          `<Header name="Access-Control-Allow-Methods">${esc(methods)}</Header>` +
          `<Header name="Access-Control-Allow-Headers">${esc(headers)}</Header>` +
          `<Header name="Access-Control-Max-Age">3628800</Header></Headers></Set>` +
          `<IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>` +
          `<AssignTo createNew="false" transport="http" type="response"/></AssignMessage>`
      );
      corsSteps.push({
        name,
        condition:
          origin === "*" || origins.length === 1
            ? undefined
            : `request.header.origin = "${origin.replace(/"/g, "")}"`,
      });
    });
    loc.proxyResPost.push(...corsSteps);
  }

  /* 404 for anything the OpenAPI spec does not describe */
  const notFound = "RF-Resource-Not-Found";
  addPolicy(
    notFound,
    `<RaiseFault continueOnError="false" enabled="true" name="${notFound}">` +
      `<DisplayName>Resource Not Found</DisplayName><FaultResponse><Set>` +
      `<Payload contentType="application/json">{"error":"resource_not_found","message":"No resource matches this request."}</Payload>` +
      `<StatusCode>404</StatusCode><ReasonPhrase>Not Found</ReasonPhrase></Set></FaultResponse>` +
      `<IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables></RaiseFault>`
  );

  /* One conditional flow per OpenAPI operation (names de-duplicated) */
  const usedFlowNames = new Set<string>();
  const flowXml: string[] = [];
  const flowNames: string[] = [];

  if (corsOn) {
    flowNames.push("OptionsPreFlight");
    flowXml.push(
      `<Flow name="OptionsPreFlight"><Request/>${stepsXml("Response", corsSteps)}` +
        `<Condition>request.verb = "OPTIONS"</Condition></Flow>`
    );
  }
  for (const resource of spec.resources) {
    for (const op of resource.operations) {
      let name = safeName(op.flowName, "flow");
      for (let n = 2; usedFlowNames.has(name); n++) name = `${safeName(op.flowName)}-${n}`;
      usedFlowNames.add(name);
      flowNames.push(name);
      flowXml.push(
        `<Flow name="${esc(name)}"><Description>${esc(op.summary || op.operationId || name)}</Description>` +
          `<Request/><Response/><Condition>${esc(op.condition)}</Condition></Flow>`
      );
    }
  }
  flowNames.push("NotFound");
  flowXml.push(
    `<Flow name="NotFound"><Request>${`<Step><Name>${notFound}</Name></Step>`}</Request><Response/></Flow>`
  );

  /* Proxy endpoint */
  const basePath = txt(payload.basePath, "/" + payload.apiName).replace(/\/+$/, "") || "/";
  const proxyEndpoint =
    XML_HEADER +
    `<ProxyEndpoint name="default">` +
    `<PreFlow name="PreFlow">${stepsXml("Request", loc.proxyReqPre)}${stepsXml("Response", loc.proxyResPre)}</PreFlow>` +
    `<Flows>${flowXml.join("")}</Flows>` +
    `<PostFlow name="PostFlow">${stepsXml("Request", loc.proxyReqPost)}${stepsXml("Response", loc.proxyResPost)}</PostFlow>` +
    (loc.postClient.length
      ? `<PostClientFlow name="PostClientFlow">${stepsXml("Response", loc.postClient)}</PostClientFlow>`
      : "") +
    `<HTTPProxyConnection><BasePath>${esc(basePath)}</BasePath></HTTPProxyConnection>` +
    (corsOn
      ? `<RouteRule name="NoRoute"><Condition>request.verb = "OPTIONS"</Condition></RouteRule>`
      : "") +
    `<RouteRule name="default"><TargetEndpoint>default</TargetEndpoint></RouteRule>` +
    `</ProxyEndpoint>`;

  /* Target endpoint: always through a Target Server (created in step 6) */
  const targetName = payload.target.name;
  let targetPath = "";
  if (payload.target.mode === "new" && payload.target.url) {
    try {
      const pathname = new URL(payload.target.url).pathname.replace(/\/+$/, "");
      if (pathname) targetPath = pathname;
    } catch {
      /* validated earlier by the provider */
    }
  }
  const targetEndpoint =
    XML_HEADER +
    `<TargetEndpoint name="default">` +
    `<PreFlow name="PreFlow">${stepsXml("Request", loc.targetReqPre)}${stepsXml("Response", loc.targetResPre)}</PreFlow>` +
    `<Flows/>` +
    `<PostFlow name="PostFlow">${stepsXml("Request", loc.targetReqPost)}${stepsXml("Response", loc.targetResPost)}</PostFlow>` +
    `<HTTPTargetConnection><LoadBalancer><Server name="${esc(targetName)}"/></LoadBalancer>` +
    (targetPath ? `<Path>${esc(targetPath)}</Path>` : "") +
    `</HTTPTargetConnection></TargetEndpoint>`;

  const descriptor =
    XML_HEADER +
    `<APIProxy revision="1" name="${esc(payload.apiName)}">` +
    `<DisplayName>${esc(payload.displayName || payload.apiName)}</DisplayName>` +
    `<Description>${esc(payload.description)}</Description></APIProxy>`;

  const zip = new JSZip();
  zip.file(`apiproxy/${payload.apiName}.xml`, descriptor);
  zip.file("apiproxy/proxies/default.xml", proxyEndpoint);
  zip.file("apiproxy/targets/default.xml", targetEndpoint);
  for (const [name, xml] of policyFiles) zip.file(`apiproxy/policies/${name}.xml`, xml);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return {
    buffer,
    files: Object.keys(zip.files).filter((f) => !zip.files[f].dir),
    policies: [...policyFiles.keys()],
    flows: flowNames,
  };
}
