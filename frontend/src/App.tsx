
import ProvisioningConsole from './ProvisioningConsole';
import { type ParsedOpenApiSpec } from "./openApiParser";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  api as apiClient,
  type BackendHealth,
  type RequestSummary,
  type ResourceCatalog,
} from "./api";
import PolicyBuilder from "./PolicyBuilder";
import "./App.css";

type Page =
  | 'home'
  | 'catalog'
  | 'create'
  | 'requests'
  | 'publish'
  | 'resources'
  | 'approve'
  | 'provisioning';

type AuthType =
  | "API Key"
  | "Basic Authentication"
  | "OAuth 2.0"
  | "JWT";

type SidebarIconName =
  | "dashboard"
  | "create"
  | "publish"
  | "resources"
  | "approve"
  | "requests"
  | "proxies"
  | "products"
  | "consumers"
  | "servers"
  | "flows";

const sidebarIconPaths: Record<SidebarIconName, string> = {
  dashboard: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
  create: "M12 5v14M5 12h14",
  publish: "M12 16V4m0 0-4 4m4-4 4 4M5 16v3h14v-3",
  resources: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  approve: "m5 12 4 4L19 6",
  requests: "M7 3h10v18H7zM9 3.5h6v3H9zM10 11h4m-4 4h4",
  proxies: "M4 5h6v6H4zm10 8h6v6h-6zM10 8h4m-2 0v6",
  products: "M3 7V4h9l8 8-5 5-8-8Zm5 0h.01",
  consumers: "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m14-6a3 3 0 1 0 0-6m-5 3a3 3 0 1 0-6 0",
  servers: "M4 4h16v6H4zm0 10h16v6H4zm3-7h.01m0 10h.01",
  flows: "M5 7h10m0 0-3-3m3 3-3 3M19 17H9m0 0 3-3m-3 3 3 3",
};

function SidebarIcon({ name }: { name: SidebarIconName }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={sidebarIconPaths[name]} />
    </svg>
  );
}

const steps = [
  "Upload & Validate YAML",
  "API Details",
  "Consumer & Access",
  "Target & Backend",
  "Policies & Shared Flows",
  "Review & Submit",
];

const unsavedChangesMessage = "Save your changes before continuing.";

const fallbackTargets = [
  "shipment-backend",
  "payment-backend",
  "customer-backend",
];

const fallbackProducts = [
  "customer-product",
  "payment-product",
  "shipment-product",
];

const fallbackDevelopers = [
  "platform-team@example.com",
  "mobile-partner@example.com",
  "logistics@example.com",
];

const fallbackApps = [
  "customer-mobile-app",
  "partner-portal-app",
  "shipment-partner-app",
];

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [step, setStep] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [openTopMenu, setOpenTopMenu] = useState<"notifications" | "profile" | null>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");

  // Each wizard step is a new screen. Reset the document position after React
  // has rendered it so users always begin at the top of that step.
  useEffect(() => {
    if (page === "create") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [page, step]);

  useEffect(() => {
    if (!openTopMenu) return;

    const closeMenu = (event: MouseEvent) => {
      if (!topMenuRef.current?.contains(event.target as Node)) {
        setOpenTopMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenTopMenu(null);
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openTopMenu]);

  // YAML
  const [fileName, setFileName] = useState("");
  const [yaml, setYaml] = useState("");
  const [valid, setValid] = useState(false);
  const [parsedSpec, setParsedSpec] = useState<ParsedOpenApiSpec | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // API details
  const [api, setApi] = useState("shipment-api");
  const [display, setDisplay] = useState("Shipment API");
  const [basePath, setBasePath] = useState("/shipment/v1");
  const [version, setVersion] = useState("v1");
  const [description, setDescription] = useState(
    "APIs to manage shipment operations."
  );
  const [env, setEnv] = useState("dev");
  // Real environment names come from the backend (Apigee orgs are not always dev/test/stage/prod).
  const [environmentsLoaded, setEnvironmentsLoaded] = useState(false);
  const [environments, setEnvironments] = useState([
    "dev",
    "test",
    "stage",
    "prod",
  ]);
  const [owningTeam, setOwningTeam] = useState("Platform APIs");
  const [contactEmail, setContactEmail] = useState("api-platform@company.com");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isEditingOperations, setIsEditingOperations] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [isEditingDeveloper, setIsEditingDeveloper] = useState(false);
  const [isEditingApp, setIsEditingApp] = useState(false);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [isEditingPolicies, setIsEditingPolicies] = useState(false);

  // Consumer and authentication
  const [consumer, setConsumer] = useState("Internal");
  const [auth, setAuth] = useState<AuthType>("API Key");

  // API Key configuration
  const [apiKeyHeader, setApiKeyHeader] = useState("x-api-key");

  // Basic Authentication configuration
  const [basicAuthService, setBasicAuthService] = useState(
    "https://identity.internal.company.com/verify"
  );
  const [basicAuthSecretReference, setBasicAuthSecretReference] =
    useState("basic-auth-credentials");

  // OAuth configuration
  const [oauthGrant, setOauthGrant] = useState("Client Credentials");
  const [oauthScopes, setOauthScopes] = useState(
    "shipment.read shipment.write"
  );
  const [oauthTokenPath, setOauthTokenPath] = useState(
    "/oauth/token"
  );

  // JWT configuration
  const [jwtIssuer, setJwtIssuer] = useState(
    "https://identity.example.com"
  );
  const [jwtAudience, setJwtAudience] = useState("shipment-api");
  const [jwtAlgorithm, setJwtAlgorithm] = useState("RS256");
  const [jwksUrl, setJwksUrl] = useState(
    "https://identity.example.com/.well-known/jwks.json"
  );

  // API Product
  const [productMode, setProductMode] = useState("new");
  const [productName, setProductName] = useState("shipment-product");
  const [productDisplayName, setProductDisplayName] = useState(
    "Shipment API Product"
  );
  const [existingProduct, setExistingProduct] =
    useState("customer-product");
  const [productDescription, setProductDescription] = useState(
    "Access product for Shipment API."
  );
  const [productSpace, setProductSpace] = useState("Default");
  const [productEnvironment, setProductEnvironment] = useState("dev");
  const [productAccess, setProductAccess] = useState("Private");
  const [productApproval, setProductApproval] = useState("Automatic");
  const [productProxy, setProductProxy] = useState("shipment-api");
  const [productResourcePath, setProductResourcePath] = useState("/**");
  const [productMethods, setProductMethods] = useState("GET, POST");
  const [productQuotaLimit, setProductQuotaLimit] = useState("1000");
  const [productQuotaInterval, setProductQuotaInterval] = useState("1");
  const [productQuotaUnit, setProductQuotaUnit] = useState("day");
  const [productOauthScopes, setProductOauthScopes] = useState("");

  // Developer
  const [developerMode, setDeveloperMode] = useState("new");
  const [developerName, setDeveloperName] =
    useState("logistics-partner");
  const [developerEmail, setDeveloperEmail] =
    useState("logistics@example.com");
  const [existingDeveloper, setExistingDeveloper] =
    useState("platform-team@example.com");

  // Developer App
  const [appMode, setAppMode] = useState("new");
  const [appName, setAppName] = useState("shipment-partner-app");
  const [existingApp, setExistingApp] =
    useState("customer-mobile-app");

  // Target configuration
  const [targetMode, setTargetMode] = useState("existing");
  const [target, setTarget] = useState(fallbackTargets[0]);
  const [newTarget, setNewTarget] = useState("shipment-backend-new");
  const [backend, setBackend] = useState("shipment.dev.internal.company.com");
  const [targetPort, setTargetPort] = useState("443");
  const [targetProtocol, setTargetProtocol] = useState("HTTPS");
  const [targetSsl, setTargetSsl] = useState(true);

  // Policy configuration
  const [policyConfig, setPolicyConfig] = useState<Record<string, any>>(
    {}
  );

  const [requestId, setRequestId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [backendInfo, setBackendInfo] = useState<BackendHealth | null>(null);
  const [resources, setResources] = useState<ResourceCatalog>({
    targets: fallbackTargets,
    products: fallbackProducts,
    developers: fallbackDevelopers,
    apps: fallbackApps,
    sharedFlows: {},
  });

  // Shadow the module-level fallbacks with data from the backend.
  const targets = resources.targets;
  const existingProducts = resources.products;
  const existingDevelopers = resources.developers;
  const existingApps = resources.apps;

  // Backend health (and which provisioning mode it runs in) on startup.
  useEffect(() => {
    apiClient
      .health()
      .then((info) => {
        setBackendOnline(true);
        setBackendInfo(info);
      })
      .catch(() => setBackendOnline(false));
  }, []);

  // Environments that actually exist in the Apigee org.
  useEffect(() => {
    apiClient
      .environments()
      .then((list) => {
        if (list.length === 0) return;
        setEnvironments(list);
        // Switch away from a default that does not exist (e.g. "dev" in an org that only has "eval").
        setEnv((current) => (list.includes(current) ? current : list[0]));
      })
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : "Could not load environments."
        )
      )
      .finally(() => setEnvironmentsLoaded(true));
  }, []);

  // Dropdown catalogue (live from Apigee when the backend runs in apigee mode).
  useEffect(() => {
    // Wait until the real environment names are known, otherwise we ask Apigee about a "dev" that may not exist.
    if (!environmentsLoaded) return;
    apiClient
      .resources(env)
      .then(setResources)
      .catch((error: unknown) => {
        // Keep the built-in fallback lists, but tell the user why they are stale.
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not load Apigee resources."
        );
      });
  }, [env, environmentsLoaded]);

  // Refresh request history whenever the page is opened.
  useEffect(() => {
    if (page !== "requests") return;
    apiClient
      .listRequests()
      .then(setRequests)
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : "Unable to load requests."
        )
      );
  }, [page]);

  const buildRequestInput = (submitNow: boolean) => ({
    submit: submitNow,
    apiName: api,
    displayName: display,
    environment: env,
    basePath,
    version,
    description,
    specFileName: fileName,
    specContent: yaml,
    consumer,
    authType: auth,
    authConfig:
      auth === "API Key"
        ? { header: apiKeyHeader }
        : auth === "Basic Authentication"
          ? {
              verificationEndpoint: basicAuthService,
              secretReference: basicAuthSecretReference,
            }
          : auth === "OAuth 2.0"
            ? {
                grant: oauthGrant,
                scopes: oauthScopes,
                tokenPath: oauthTokenPath,
              }
            : {
                issuer: jwtIssuer,
                audience: jwtAudience,
                algorithm: jwtAlgorithm,
                jwksUrl,
              },
    product:
      productMode === "new"
        ? {
            mode: "new",
            name: productName,
            displayName: productDisplayName,
            description: productDescription,
            space: productSpace,
            environment: productEnvironment,
            access: productAccess,
            approval: productApproval,
            apiProxy: productProxy,
            resourcePath: productResourcePath,
            methods: productMethods,
            quotaLimit: productQuotaLimit,
            quotaInterval: productQuotaInterval,
            quotaUnit: productQuotaUnit,
            oauthScopes: productOauthScopes,
          }
        : { mode: "existing", name: existingProduct },
    developer:
      developerMode === "new"
        ? { mode: "new", name: developerName, email: developerEmail }
        : { mode: "existing", name: existingDeveloper, email: existingDeveloper },
    developerApp:
      appMode === "new"
        ? { mode: "new", name: appName }
        : { mode: "existing", name: existingApp },
    target:
      targetMode === "new"
        ? {
            mode: "new",
            name: newTarget,
            host: backend,
            port: targetPort,
            protocol: targetProtocol,
            sslEnabled: targetSsl,
          }
        : { mode: "existing", name: target },
    policies: policyConfig,
  });

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder = "",
    type = "text",
    disabled = false
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );

  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: string[],
    disabled = false
  ) => (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  const title = (heading: string, subtitle: string) => (
    <div className="heading">
      <div>
        <small>APIGEE DEVELOPER PORTAL</small>
        <h1>{heading}</h1>
        <p>{subtitle}</p>
      </div>
      <span className="env">
        Apigee X · {env.toUpperCase()}
      </span>
    </div>
  );

  const choose = (
    value: string,
    setValue: (value: string) => void
  ) => (
    <div className="choose">
      <button
        type="button"
        className={value === "new" ? "picked" : ""}
        onClick={() => setValue("new")}
      >
        + Create New
      </button>

      <button
        type="button"
        className={value === "existing" ? "picked" : ""}
        onClick={() => setValue("existing")}
      >
        Choose Existing
      </button>
    </div>
  );

  const panel = (children: ReactNode, extra = "") => (
    <section className={`panel ${extra}`}>
      {children}
    </section>
  );

  const goCreate = () => {
    setPage("create");
    setStep(0);
    setNotice("");
  };

  const next = () => {
    if (step === 0 && (!valid || !parsedSpec)) {
      setNotice(
        "Upload an OpenAPI document and successfully parse it before continuing."
      );
      return;
    }

    if (step === 1 && !parsedSpec) {
      setNotice("Return to Step 1 and parse the OpenAPI document first.");
      return;
    }

    const activeEditor =
      step === 1
        ? isEditingDetails
          ? "api-details-editor"
          : isEditingOperations
            ? "operations-editor"
            : null
        : step === 2
          ? isEditingProduct
            ? "product-editor"
            : isEditingDeveloper
              ? "developer-editor"
              : isEditingApp
                ? "app-editor"
                : null
          : step === 3 && isEditingTarget
            ? "target-editor"
            : step === 4 && isEditingPolicies
              ? "policies-editor"
            : null;

    if (activeEditor) {
      setNotice(unsavedChangesMessage);
      requestAnimationFrame(() => {
        document.getElementById(activeEditor)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    setNotice("");
    setStep(Math.min(5, step + 1));
  };

  const save = async () => {
    setSubmitting(true);
    try {
      const created = await apiClient.createRequest(buildRequestInput(false));
      setNotice(`Draft ${created.id} saved.`);
      setPage("requests");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to save the draft."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const created = await apiClient.createRequest(buildRequestInput(true));
      setRequestId(created.id);
      setNotice("");
      setPage("provisioning");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to submit the request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const nav = (label: string, destination: Page, icon: SidebarIconName) => (
    <button
      className={`nav ${page === destination ? "active" : ""}`}
      onClick={() => setPage(destination)}
    >
      <SidebarIcon name={icon} />
      {label}
    </button>
  );

  const apiCatalog = [
    { name: "Customer API", proxy: "customer-api", owner: "Customer Platform", revision: "r12", environment: "prod", status: "Healthy", description: "Customer profiles, preferences and account services." },
    { name: "Payments API", proxy: "payments-api", owner: "Commerce Platform", revision: "r8", environment: "prod", status: "Healthy", description: "Secure payment initiation and transaction status." },
    { name: "Shipment API", proxy: "shipment-api", owner: "Logistics", revision: "r4", environment: "test", status: "Review needed", description: "Shipment creation, tracking and carrier operations." },
  ];

  function renderCatalog() {
    const visibleApis = apiCatalog.filter((item) =>
      `${item.name} ${item.proxy} ${item.owner}`.toLowerCase().includes(catalogQuery.toLowerCase())
    );

    return <>
      {title("API catalog", "Discover managed APIs, deployment health and ownership across your Apigee organization.")}
      <section className="catalog-toolbar">
        <label className="catalog-search">
          <span>Search APIs</span>
          <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search by API, proxy or owner" />
        </label>
        <button className="secondary" onClick={() => setCatalogQuery("")}>Clear filters</button>
        <button className="primary" onClick={goCreate}>+ Create API</button>
      </section>
      <div className="api-catalog-grid">
        {visibleApis.map((item) => <article className="api-card" key={item.proxy}>
          <div className="api-card-top"><span className="api-mark">API</span><em className={`badge ${item.status === "Healthy" ? "green" : "amber"}`}>{item.status}</em></div>
          <h2>{item.name}</h2><code>{item.proxy}</code><p>{item.description}</p>
          <dl><dt>Owner</dt><dd>{item.owner}</dd><dt>Deployment</dt><dd>{item.environment} · {item.revision}</dd></dl>
          <div className="api-card-actions"><button className="secondary" onClick={() => setPage("resources")}>View details</button><button className="text-button" onClick={() => setPage("publish")}>Deploy</button></div>
        </article>)}
      </div>
      {visibleApis.length === 0 && <section className="empty-state"><strong>No APIs found</strong><span>Try another search term or create a new API.</span></section>}
    </>;
  }

  function renderOpenApiSummary() {
    const methods = Array.from(
      new Set(parsedSpec?.resources.flatMap((resource) => resource.operations.map((operation) => operation.method)) ?? [])
    );

    return panel(
      <div className="openapi-summary-card">
        <h3>OpenAPI Summary <small>(From YAML)</small></h3>
        <div className="summary-line"><span>OpenAPI Version</span><b>{parsedSpec?.specVersion || "Not detected"}</b></div>
        <div className="summary-line"><span>API Title</span><b>{parsedSpec?.title || display}</b></div>
        <div className="summary-line"><span>Total Endpoints</span><b>{parsedSpec?.resources.length ?? 0}</b></div>
        <div className="summary-line methods-line"><span>HTTP Methods</span><div>{methods.length ? methods.map((method) => <em key={method} className={`method-chip method-${method.toLowerCase()}`}>{method}</em>) : <b>None</b>}</div></div>
        <div className="summary-line"><span>Schemas / Models</span><b>{parsedSpec?.schemaCount ?? 0}</b></div>
      </div>,
      "aside"
    );
  }

  function renderAuthenticationConfiguration() {
    if (auth === "API Key") {
      return (
        <div className="auth-config">
          <h4>API Key Configuration</h4>
          <p>
            The proxy will validate the consumer's API key using
            the VerifyAPIKey policy.
          </p>

          {field(
            "API Key Header Name",
            apiKeyHeader,
            setApiKeyHeader
          )}

          <div className="callout">
            <strong>Apigee policy:</strong>
            <code>VerifyAPIKey</code>
            <span>
              The API key will be provisioned through the
              Developer App credentials.
            </span>
          </div>
        </div>
      );
    }

    if (auth === "Basic Authentication") {
      return (
        <div className="auth-config">
          <h4>Basic Authentication Configuration</h4>
          <p>
            The proxy will extract Basic credentials and verify
            them using a trusted credential-verification service.
          </p>

          {field(
            "Credential Verification Endpoint",
            basicAuthService,
            setBasicAuthService
          )}

          {field(
            "Secret Reference",
            basicAuthSecretReference,
            setBasicAuthSecretReference
          )}

          <div className="callout">
            <strong>Implementation:</strong>
            <span>
              Basic authentication requires a secure verification
              mechanism. Apigee does not provide a dedicated
              Basic Auth verification policy.
            </span>
          </div>
        </div>
      );
    }

    if (auth === "OAuth 2.0") {
      return (
        <div className="auth-config">
          <h4>OAuth 2.0 Configuration</h4>
          <p>
            Configure the token flow, allowed scopes and token
            endpoint for this API.
          </p>

          {select(
            "OAuth Grant Type",
            oauthGrant,
            setOauthGrant,
            [
              "Client Credentials",
              "Authorization Code",
            ]
          )}

          {field(
            "Allowed OAuth Scopes",
            oauthScopes,
            setOauthScopes,
            "shipment.read shipment.write"
          )}

          {field(
            "Token Endpoint Path",
            oauthTokenPath,
            setOauthTokenPath
          )}

          <div className="callout">
            <strong>Apigee policy:</strong>
            <code>OAuthV2</code>
            <span>
              Token generation and token verification must be
              configured as separate operations where required.
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="auth-config">
        <h4>JWT Configuration</h4>
        <p>
          Configure the expected JWT issuer, audience and
          signature verification details.
        </p>

        {field("JWT Issuer", jwtIssuer, setJwtIssuer)}

        {field(
          "JWT Audience",
          jwtAudience,
          setJwtAudience
        )}

        {select(
          "Signing Algorithm",
          jwtAlgorithm,
          setJwtAlgorithm,
          ["RS256", "RS384", "RS512", "ES256"]
        )}

        {field(
          "JWKS URL",
          jwksUrl,
          setJwksUrl
        )}

        <div className="callout">
          <strong>Apigee policy:</strong>
          <code>VerifyJWT</code>
          <span>
            Apigee validates the JWT signature and configured
            claims such as issuer and audience.
          </span>
        </div>
      </div>
    );
  }

  function renderConsumerStep() {
    return (
      <div className="columns consumer-layout">
        <div className="consumer-config-sections">
        {panel(
          <>
            <h2>Step 3: Consumer, Security & Access Management</h2>
            <p>
              Configure the consumer, authentication mechanism
              and Apigee access resources together.
            </p>

            <h3>A. Consumer Type</h3>

            <div className="cards">
              {["Internal", "External"].map((type) => (
                <button
                  type="button"
                  key={type}
                  className={
                    consumer === type ? "card selected" : "card"
                  }
                  onClick={() => {
                    setConsumer(type);
                    setAuth(
                      type === "Internal" ? "API Key" : "OAuth 2.0"
                    );
                  }}
                >
                  <b>{type} Consumer</b>
                  <span>
                    {type === "Internal"
                      ? "Company applications and internal systems."
                      : "Partners, customers and third-party applications."}
                  </span>
                </button>
              ))}
            </div>

            <h3>B. Authentication Mechanism</h3>

            <p>
              Select how Apigee should verify the identity of
              the application calling this API.
            </p>

            <div className="cards">
              {(consumer === "Internal"
                ? ["API Key", "Basic Authentication"]
                : ["OAuth 2.0", "JWT"]
              ).map((method) => (
                <button
                  type="button"
                  key={method}
                  className={
                    auth === method ? "card selected" : "card"
                  }
                  onClick={() => setAuth(method as AuthType)}
                >
                  <b>{method}</b>
                  <span>
                    {method === "API Key"
                      ? "Verify the API key associated with a Developer App."
                      : method === "Basic Authentication"
                        ? "Verify username and password credentials."
                        : method === "OAuth 2.0"
                          ? "Validate OAuth access tokens and scopes."
                          : "Verify signed JWT tokens and claims."}
                  </span>
                </button>
              ))}
            </div>

            {renderAuthenticationConfiguration()}
          </>
        )}

        {panel(
          <>
            <div className="section-title-row" id="product-editor">
              <h3>C. API Product</h3>
              {productMode === "new" && (
                <button className="edit-button" type="button" onClick={() => {
                  if (isEditingProduct) {
                    setIsEditingProduct(false);
                    setNotice("");
                  } else {
                    setIsEditingProduct(true);
                  }
                }}>
                  {isEditingProduct ? "Save" : "Edit"}
                </button>
              )}
            </div>
            <p>
              API Products define which API resources and access
              conditions a consumer application can use.
            </p>

            {choose(productMode, setProductMode)}

            {productMode === "new" ? (
              <div className="form">
                {isEditingProduct && notice === unsavedChangesMessage && <p className="edit-required-message">Save your API Product changes before continuing.</p>}
                {field("Product Name *", productName, setProductName, "", "text", !isEditingProduct)}
                {field(
                  "Display Name *",
                  productDisplayName,
                  setProductDisplayName,
                  "",
                  "text",
                  !isEditingProduct
                )}
                {field(
                  "Description",
                  productDescription,
                  setProductDescription,
                  "",
                  "text",
                  !isEditingProduct
                )}
                {field("Space", productSpace, setProductSpace, "", "text", !isEditingProduct)}
                {select(
                  "Environment *",
                  productEnvironment,
                  setProductEnvironment,
                  ["dev", "test", "stage", "prod"],
                  !isEditingProduct
                )}
                {select(
                  "Access *",
                  productAccess,
                  setProductAccess,
                  ["Private", "Public"],
                  !isEditingProduct
                )}
                {select(
                  "Request approval",
                  productApproval,
                  setProductApproval,
                  ["Automatic", "Manual"],
                  !isEditingProduct
                )}
                {field("Allowed OAuth scopes", productOauthScopes, setProductOauthScopes, "e.g. shipment.read shipment.write", "text", !isEditingProduct)}
                {field("API Proxy *", productProxy, setProductProxy, "Select or enter a proxy", "text", !isEditingProduct)}
                {field("Resource path *", productResourcePath, setProductResourcePath, "e.g. /customers/**", "text", !isEditingProduct)}
                {field("Allowed HTTP methods", productMethods, setProductMethods, "e.g. GET, POST", "text", !isEditingProduct)}
                {field("API quota limit", productQuotaLimit, setProductQuotaLimit, "e.g. 1000", "text", !isEditingProduct)}
                {field("Quota interval", productQuotaInterval, setProductQuotaInterval, "e.g. 1", "text", !isEditingProduct)}
                {select("Quota unit", productQuotaUnit, setProductQuotaUnit, ["minute", "hour", "day", "month"], !isEditingProduct)}
              </div>
            ) : (
              <div className="form">
                {select(
                  "Existing API Product",
                  existingProduct,
                  setExistingProduct,
                  existingProducts
                )}
              </div>
            )}

            <div className="callout">
              The selected API Product will be associated with
              the API proxy being created.
            </div>
          </>
        )}

        {panel(
          <>
            <div className="section-title-row" id="developer-editor">
              <h3>D. Developer</h3>
              {developerMode === "new" && (
                <button className="edit-button" type="button" onClick={() => {
                  if (isEditingDeveloper) {
                    setIsEditingDeveloper(false);
                    setNotice("");
                  } else {
                    setIsEditingDeveloper(true);
                  }
                }}>
                  {isEditingDeveloper ? "Save" : "Edit"}
                </button>
              )}
            </div>
            <p>
              A Developer represents the consumer or partner
              registered in Apigee.
            </p>

            {choose(developerMode, setDeveloperMode)}

            {developerMode === "new" ? (
              <div className="form">
                {isEditingDeveloper && notice === unsavedChangesMessage && <p className="edit-required-message">Save your Developer changes before continuing.</p>}
                {field(
                  "Developer Username *",
                  developerName,
                  setDeveloperName,
                  "",
                  "text",
                  !isEditingDeveloper
                )}
                {field(
                  "Developer Email *",
                  developerEmail,
                  setDeveloperEmail,
                  "",
                  "email",
                  !isEditingDeveloper
                )}
              </div>
            ) : (
              <div className="form">
                {select(
                  "Existing Developer",
                  existingDeveloper,
                  setExistingDeveloper,
                  existingDevelopers
                )}
              </div>
            )}
          </>
        )}

        {panel(
          <>
            <div className="section-title-row" id="app-editor">
              <h3>E. Developer App</h3>
              {appMode === "new" && (
                <button className="edit-button" type="button" onClick={() => {
                  if (isEditingApp) {
                    setIsEditingApp(false);
                    setNotice("");
                  } else {
                    setIsEditingApp(true);
                  }
                }}>
                  {isEditingApp ? "Save" : "Edit"}
                </button>
              )}
            </div>
            <p>
              A Developer App represents the application that
              consumes the API and holds its credentials.
            </p>

            {choose(appMode, setAppMode)}

            {appMode === "new" ? (
              <div className="form">
                {isEditingApp && notice === unsavedChangesMessage && <p className="edit-required-message">Save your Developer App changes before continuing.</p>}
                {field("App Name *", appName, setAppName, "", "text", !isEditingApp)}
              </div>
            ) : (
              <div className="form">
                {select(
                  "Existing Developer App",
                  existingApp,
                  setExistingApp,
                  existingApps
                )}
              </div>
            )}

            <div className="callout">
              The app must belong to the selected Developer.
              The backend will validate existing product
              associations before making changes.
            </div>
          </>
        )}
        </div>

        {panel(
          <>
            <h3>Access Configuration Summary</h3>

            <dl>
              <dt>Consumer</dt>
              <dd>{consumer}</dd>

              <dt>Authentication</dt>
              <dd>{auth}</dd>

              <dt>API Product</dt>
              <dd>
                {productMode === "new"
                  ? productName
                  : existingProduct}
              </dd>

              <dt>Developer</dt>
              <dd>
                {developerMode === "new"
                  ? developerEmail
                  : existingDeveloper}
              </dd>

              <dt>Developer App</dt>
              <dd>
                {appMode === "new" ? appName : existingApp}
              </dd>
            </dl>

            <h3>Security Implementation</h3>

            <div className="callout">
              <strong>Selected mechanism</strong>
              {auth === "API Key"
                ? "VerifyAPIKey policy"
                : auth === "OAuth 2.0"
                  ? "OAuthV2 token verification"
                  : auth === "JWT"
                    ? "VerifyJWT policy"
                    : "Basic credential verification flow"}
            </div>

            <div className="callout">
              This configuration will be saved as part of the
              API request. Actual Apigee resource creation and
              policy generation will happen through the backend.
            </div>
          </>,
          "aside"
        )}
      </div>
    );
  }

  function renderWizard() {
    return (
      <>
        {title(
          "Create API",
          "Onboard a new API by uploading an OpenAPI YAML file and configuring Apigee resources."
        )}

        <div className="steps">
          {steps.map((stepName, index) => (
            <button
              key={stepName}
              className={
                index === step
                  ? "current"
                  : index < step
                    ? "done"
                    : ""
              }
              onClick={() => {
                if (index < step) {
                  setStep(index);
                  setNotice("");
                }
              }}
            >
              <b>{index < step ? "✓" : index + 1}</b>
              <span>{stepName}</span>
            </button>
          ))}
        </div>

        {notice && <div className={`notice ${notice === unsavedChangesMessage ? "notice-error" : ""}`}>{notice}</div>}

        {/* STEP 1: YAML */}
        {step === 0 && (
          <div className="columns">
            {panel(
              <>
                <h2>Step 1: Upload & Validate YAML</h2>
                <p>
                  Upload your OpenAPI specification. Mandatory
                  validation errors must be resolved before
                  proceeding.
                </p>

                <label className="drop">
                  <input
                    type="file"
                    accept=".yaml,.yml,.json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        setFileName(file.name);

                        const reader = new FileReader();

                        reader.onload = () => {
                          setYaml(String(reader.result || ""));
                          setValid(false);
                        setParsedSpec(null);
                        setValidationErrors([]);
                          setParsedSpec(null);
                          setValidationErrors([]);
                        };

                        reader.readAsText(file);
                      }
                    }}
                  />

                  <strong>⇧</strong>
                  <b>Upload OpenAPI YAML file</b>
                  <span>
                    or <em>Choose File</em>
                  </span>
                  <small>
                    Supported .yaml, .yml, .json
                  </small>
                </label>

                {fileName && (
                  <div className="file">
                    {fileName}
                    <button
                      onClick={() => {
                        setFileName("");
                        setYaml("");
                        setValid(false);
                        setParsedSpec(null);
                        setValidationErrors([]);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                <label className="field">
                  <span>Or paste YAML for this UI demo</span>
                  <textarea
                    rows={7}
                    value={yaml}
                    onChange={(event) => {
                      setYaml(event.target.value);
                      setValid(false);
                      setParsedSpec(null);
                      setValidationErrors([]);
                    }}
                    placeholder={`openapi: 3.0.3
info:
  title: Shipment API
paths: {}`}
                  />
                </label>

                <button
                  className="primary"
                  disabled={validating || !yaml.trim()}
                  onClick={async () => {
                    setValidating(true);
                    try {
                      const result = await apiClient.validateSpec(yaml);
                      setParsedSpec(result);
                      setValidationErrors([]);
                      setValid(true);

                      // Populate editable API details from the uploaded specification.
                      setDisplay(result.title);
                      const apiSlug = result.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "");
                      setApi(apiSlug.endsWith("-api") ? apiSlug : `${apiSlug}-api`);
                      setVersion(result.version || "v1");
                      setDescription(result.description || "");
                      if (result.basePath) {
                        setBasePath(result.basePath);
                      }

                      setNotice(
                        `OpenAPI specification validated by the backend. Found ${result.resources.length} resources and ${result.totalOperations} operations.`
                      );
                    } catch (error) {
                      setValid(false);
                      setParsedSpec(null);
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Unable to validate the OpenAPI document.";
                      setValidationErrors([message]);
                      setNotice("OpenAPI validation failed. Correct the errors before continuing.");
                    } finally {
                      setValidating(false);
                    }
                  }}
                >
                  {validating ? "Validating…" : "Validate & Lint YAML"}
                </button>

                {validationErrors.length > 0 && (
                  <div className="openapi-errors" role="alert">
                    <strong>Unable to parse OpenAPI specification</strong>
                    {validationErrors.map((error, index) => (
                      <p key={`${index}-${error}`}>{error}</p>
                    ))}
                  </div>
                )}

                {valid && parsedSpec && (
                  <div className="openapi-success">
                    <strong>✓ OpenAPI document parsed</strong>
                    <span>
                      {parsedSpec.resources.length} resources ·{" "}
                      {parsedSpec.totalOperations} operations ·{" "}
                      {parsedSpec.schemaCount} schemas
                    </span>
                  </div>
                )}
              </>
            )}

            {panel(
              <div className="validation-check-card">
                <h3>Validation checks</h3>
                <ul className={valid ? "validation-list is-valid" : "validation-list"}>
                  {["OpenAPI version", "API title and description", "Paths and operations", "Request and response schemas", "Organization naming rules"].map((check) => (
                    <li key={check}><i>{valid ? "✓" : "○"}</i>{check}</li>
                  ))}
                </ul>
                <small>{valid ? "All checks passed" : "Upload and validate YAML to run these checks."}</small>
              </div>,
              "aside"
            )}
          </div>
        )}

        {/* STEP 2: API DETAILS AND GENERATED RESOURCES */}
        {step === 1 && (
          <div className="openapi-step-two">
            <div className="columns">
              {panel(
                <div id="api-details-editor">
                  <div className="section-title-row">
                    <h2>Step 2: API Details</h2>
                    <button className="edit-button" type="button" onClick={() => {
                      if (isEditingDetails) {
                        setIsEditingDetails(false);
                        setNotice("");
                      } else {
                        setIsEditingDetails(true);
                      }
                    }}>
                      {isEditingDetails ? "Save" : "Edit details"}
                    </button>
                  </div>
                  <p>
                    Review the API metadata extracted from your OpenAPI
                    document. Select Edit details to make a change.
                  </p>

                  {isEditingDetails && notice === unsavedChangesMessage && (
                    <p className="edit-required-message">Save your API details before continuing.</p>
                  )}

                  <div className="form">
                    {field("Proxy Name *", api, setApi, "", "text", !isEditingDetails)}
                    {field("Display Name *", display, setDisplay, "", "text", !isEditingDetails)}
                    {field("Base Path *", basePath, setBasePath, "", "text", !isEditingDetails)}
                    {field("API Version *", version, setVersion, "", "text", !isEditingDetails)}
                    {field("Description *", description, setDescription, "", "text", !isEditingDetails)}
                    {select(
                      "Environment *",
                      env,
                      setEnv,
                      environments,
                      !isEditingDetails
                    )}
                    {field("Owning Team", owningTeam, setOwningTeam, "", "text", !isEditingDetails)}
                    {field("Contact Email", contactEmail, setContactEmail, "", "email", !isEditingDetails)}
                  </div>
                </div>
              )}

              {renderOpenApiSummary()}
            </div>

            <section className="panel generated-resources-panel" id="operations-editor">
              <div className="generated-resources-heading">
                <div>
                  <h2>Generated API Resources & Conditional Flows</h2>
                  <p>
                    These resources and operations were extracted from the
                    uploaded OpenAPI document. Review or edit the proposed
                    Apigee flow names and conditions before continuing.
                  </p>
                </div>
                <div className="generated-heading-actions">
                  <button className="edit-button" type="button" disabled={!parsedSpec} onClick={() => {
                    if (isEditingOperations) {
                      setIsEditingOperations(false);
                      setNotice("");
                    } else {
                      setIsEditingOperations(true);
                    }
                  }}>
                    {isEditingOperations ? "Save" : "Edit"}
                  </button>
                  <span className="resource-count">
                  {parsedSpec?.resources.length ?? 0} resources ·{" "}
                  {parsedSpec?.totalOperations ?? 0} operations
                  </span>
                </div>
              </div>

              {isEditingOperations && notice === unsavedChangesMessage && (
                <p className="edit-required-message">Save your operation changes before continuing.</p>
              )}

              {!parsedSpec ? (
                <div className="info">
                  Upload and successfully parse an OpenAPI document in Step 1
                  to see generated resources and flows here.
                </div>
              ) : parsedSpec.resources.length === 0 ? (
                <div className="info">
                  No HTTP operations were found in the OpenAPI paths section.
                </div>
              ) : (
                <div className="generated-resource-list">
                  {parsedSpec.resources.map((resource, resourceIndex) => (
                    <article className="generated-resource-card" key={resource.path}>
                      <div className="generated-resource-title">
                        <div>
                          <span className="generated-resource-kicker">
                            RESOURCE {resourceIndex + 1}
                          </span>
                          <h3>{resource.path}</h3>
                          <small>
                            Apigee path pattern: {resource.apigeePath}
                          </small>
                        </div>
                        <span className="resource-count">
                          {resource.operations.length} operations
                        </span>
                      </div>

                      <div className="generated-operation-list">
                        {resource.operations.map((operation) => (
                          <div
                            className={`generated-operation ${operation.enabled ? "" : "operation-disabled"}`}
                            key={operation.id}
                          >
                            <div className="generated-operation-top">
                              <label className="generated-operation-enable">
                                <input
                                  type="checkbox"
                                  checked={operation.enabled}
                                  disabled={!isEditingOperations}
                                  onChange={(event) => {
                                    setParsedSpec((previous) =>
                                      previous
                                        ? {
                                            ...previous,
                                            resources: previous.resources.map((item) => ({
                                              ...item,
                                              operations: item.operations.map((op) =>
                                                op.id === operation.id
                                                  ? { ...op, enabled: event.target.checked }
                                                  : op
                                              ),
                                            })),
                                          }
                                        : previous
                                    );
                                  }}
                                />
                                <span className={`http-method method-${operation.method.toLowerCase()}`}>
                                  {operation.method}
                                </span>
                              </label>
                              <span className="generated-operation-summary">
                                {operation.summary || operation.operationId || "No summary provided"}
                              </span>
                            </div>

                            <div className="generated-flow-fields">
                              <label>
                                <span>Apigee Flow Name</span>
                                <input
                                  value={operation.flowName}
                                  disabled={!isEditingOperations}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setParsedSpec((previous) =>
                                      previous
                                        ? {
                                            ...previous,
                                            resources: previous.resources.map((item) => ({
                                              ...item,
                                              operations: item.operations.map((op) =>
                                                op.id === operation.id
                                                  ? { ...op, flowName: value }
                                                  : op
                                              ),
                                            })),
                                          }
                                        : previous
                                    );
                                  }}
                                />
                              </label>
                              <label className="generated-condition-field">
                                <span>Conditional Flow Expression</span>
                                <input
                                  value={operation.condition}
                                  disabled={!isEditingOperations}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setParsedSpec((previous) =>
                                      previous
                                        ? {
                                            ...previous,
                                            resources: previous.resources.map((item) => ({
                                              ...item,
                                              operations: item.operations.map((op) =>
                                                op.id === operation.id
                                                  ? { ...op, condition: value }
                                                  : op
                                              ),
                                            })),
                                          }
                                        : previous
                                    );
                                  }}
                                />
                              </label>
                            </div>

                            <div className="generated-operation-meta">
                              <span>Operation ID: {operation.operationId || "Not specified"}</span>
                              <span>Parameters: {operation.parameters.length}</span>
                              <span>Request body: {operation.hasRequestBody ? "Yes" : "No"}</span>
                              <span>Responses: {operation.responseCodes.join(", ") || "Not specified"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="callout">
                <strong>Generation note</strong>
                <span>
                  Flow conditions are proposed from the HTTP method and
                  OpenAPI path. The backend will validate and generate the
                  final Apigee proxy bundle. Disabled operations will be
                  excluded from the generated proxy configuration.
                </span>
              </div>
            </section>
          </div>
        )}

        {/* STEP 3: CONSUMER AND ACCESS */}
        {step === 2 && renderConsumerStep()}

        {/* STEP 4: TARGET */}
        {step === 3 && (
          <div className="columns">
            {panel(
              <>
                <div className="section-title-row" id="target-editor">
                  <h2>Step 4: Target & Backend Configuration</h2>
                  {targetMode === "new" && (
                    <button className="edit-button" type="button" onClick={() => {
                      if (isEditingTarget) {
                        setIsEditingTarget(false);
                        setNotice("");
                      } else {
                        setIsEditingTarget(true);
                      }
                    }}>
                      {isEditingTarget ? "Save" : "Edit"}
                    </button>
                  )}
                </div>
                <p>
                  Choose an existing Target Server or create
                  a new one for the selected environment.
                </p>

                {choose(targetMode, setTargetMode)}

                {targetMode === "existing" ? (
                  <div className="form">
                    {select(
                      "Existing Target Server",
                      target,
                      setTarget,
                      targets
                    )}
                  </div>
                ) : (
                  <div className="form target-server-form">
                    {isEditingTarget && notice === unsavedChangesMessage && <p className="edit-required-message">Save your Target Server changes before continuing.</p>}
                    {field(
                      "Target Server Name *",
                      newTarget,
                      setNewTarget,
                      "",
                      "text",
                      !isEditingTarget
                    )}
                    {field(
                      "Host *",
                      backend,
                      (value) => setBackend(
                        value
                          .replace(/^https?:\/\//i, "")
                          .replace(/\/.*$/, "")
                      ),
                      "e.g. backend.internal.company.com",
                      "text",
                      !isEditingTarget
                    )}
                    <p className="field-help">Enter a hostname only—do not include <code>http://</code>, <code>https://</code>, or a path.</p>
                    {select(
                      "Protocol",
                      targetProtocol,
                      setTargetProtocol,
                      ["HTTPS", "HTTP"],
                      !isEditingTarget
                    )}
                    {field("Port *", targetPort, setTargetPort, "e.g. 443", "text", !isEditingTarget)}
                    <label className="target-ssl-toggle">
                      <input
                        type="checkbox"
                        checked={targetSsl}
                        onChange={(event) => setTargetSsl(event.target.checked)}
                        disabled={!isEditingTarget}
                      />
                      Enable SSL
                    </label>
                  </div>
                )}

                <div className="callout">
                  Target Servers are environment-level Apigee
                  resources. The backend will create or validate
                  the selected resource before deployment.
                </div>
              </>
            )}

            {panel(
              <>
                <h3>Target Summary</h3>
                <dl>
                  <dt>Selection</dt>
                  <dd>{targetMode}</dd>

                  <dt>Target Server</dt>
                  <dd>
                    {targetMode === "new" ? newTarget : target}
                  </dd>

                  <dt>Environment</dt>
                  <dd>{env}</dd>
                </dl>
              </>,
              "aside"
            )}
          </div>
        )}

        {/* STEP 5: POLICIES */}
        {step === 4 && (
          <PolicyBuilder
            sharedFlowsByEnvironment={resources.sharedFlows}
            environment={env}
            onChange={setPolicyConfig}
            onEditingChange={(editing) => {
              setIsEditingPolicies(editing);
              if (!editing) setNotice("");
            }}
            needsSaveAttention={notice === unsavedChangesMessage}
          />
        )}

        {/* STEP 6: REVIEW */}
        {step === 5 && (
          <div className="columns">
            {panel(
              <>
                <h2>Step 6: Review & Submit</h2>
                <p>
                  Review your configuration before submitting
                  the API onboarding request.
                </p>

                <h3>API Details</h3>
                <dl>
                  <dt>API Name</dt>
                  <dd>{api}</dd>

                  <dt>Display Name</dt>
                  <dd>{display}</dd>

                  <dt>Base Path</dt>
                  <dd>{basePath}</dd>

                  <dt>Version / Environment</dt>
                  <dd>{version} / {env}</dd>

                  <dt>Description</dt>
                  <dd>{description}</dd>
                </dl>

                <h3>Consumer & Authentication</h3>
                <dl>
                  <dt>Consumer</dt>
                  <dd>{consumer}</dd>

                  <dt>Authentication</dt>
                  <dd>{auth}</dd>

                  <dt>API Product</dt>
                  <dd>
                    {productMode === "new"
                      ? `${productName} (new)`
                      : `${existingProduct} (existing)`}
                  </dd>

                  <dt>Developer</dt>
                  <dd>
                    {developerMode === "new"
                      ? developerEmail
                      : existingDeveloper}
                  </dd>

                  <dt>Developer App</dt>
                  <dd>
                    {appMode === "new" ? appName : existingApp}
                  </dd>
                </dl>

                <h3>Authentication Configuration</h3>

                {auth === "API Key" && (
                  <dl>
                    <dt>Header</dt>
                    <dd>{apiKeyHeader}</dd>
                    <dt>Apigee policy</dt>
                    <dd>VerifyAPIKey</dd>
                  </dl>
                )}

                {auth === "Basic Authentication" && (
                  <dl>
                    <dt>Verification endpoint</dt>
                    <dd>{basicAuthService}</dd>
                    <dt>Secret reference</dt>
                    <dd>{basicAuthSecretReference}</dd>
                  </dl>
                )}

                {auth === "OAuth 2.0" && (
                  <dl>
                    <dt>Grant type</dt>
                    <dd>{oauthGrant}</dd>
                    <dt>Scopes</dt>
                    <dd>{oauthScopes}</dd>
                    <dt>Token path</dt>
                    <dd>{oauthTokenPath}</dd>
                  </dl>
                )}

                {auth === "JWT" && (
                  <dl>
                    <dt>Issuer</dt>
                    <dd>{jwtIssuer}</dd>
                    <dt>Audience</dt>
                    <dd>{jwtAudience}</dd>
                    <dt>Algorithm</dt>
                    <dd>{jwtAlgorithm}</dd>
                    <dt>JWKS URL</dt>
                    <dd>{jwksUrl}</dd>
                  </dl>
                )}

                <h3>Target Configuration</h3>
                <dl>
                  <dt>Target Server</dt>
                  <dd>
                    {targetMode === "new" ? newTarget : target}
                  </dd>
                  <dt>Selection</dt>
                  <dd>{targetMode}</dd>
                </dl>

                <h3>Policies & Shared Flows</h3>
                <dl>
                  <dt>Quota</dt>
                  <dd>
                    {policyConfig.quota?.enabled
                      ? policyConfig.quota.policyName
                      : "Disabled"}
                  </dd>

                  <dt>Spike Arrest</dt>
                  <dd>
                    {policyConfig.spikeArrest?.enabled
                      ? policyConfig.spikeArrest.policyName
                      : "Disabled"}
                  </dd>

                  <dt>CORS</dt>
                  <dd>
                    {policyConfig.cors?.enabled
                      ? policyConfig.cors.policyName
                      : "Disabled"}
                  </dd>

                  <dt>JSON Threat Protection</dt>
                  <dd>
                    {policyConfig.jsonThreatProtection?.enabled
                      ? policyConfig.jsonThreatProtection.policyName
                      : "Disabled"}
                  </dd>

                  <dt>Shared Flows</dt>
                  <dd>
                    {policyConfig.sharedFlows?.join(", ") || "None"}
                  </dd>
                </dl>
              </>
            )}

            {panel(
              <>
                <h3>Provisioning Plan</h3>
                <ol>
                  <li>Validate API configuration.</li>
                  <li>Generate the Apigee proxy bundle.</li>
                  <li>Provision or reuse Target Server.</li>
                  <li>Import and deploy API proxy.</li>
                  <li>Provision or reuse API Product.</li>
                  <li>Provision or reuse Developer.</li>
                  <li>Provision or reuse Developer App.</li>
                  <li>Configure consumer credentials and access.</li>
                </ol>

                <div className="callout warn">
                  {backendInfo?.mode === "apigee"
                    ? backendInfo.dryRun
                      ? "Dry run: the proxy bundle is generated and saved by the backend, but nothing is created or changed in Apigee."
                      : `Live: submitting creates or updates resources in Apigee organization "${backendInfo.org}" (${env}).`
                    : "Mock mode: submission simulates provisioning. No Apigee resources are created."}
                </div>
              </>,
              "aside"
            )}
          </div>
        )}

        <div className="footer">
          <button
            className="secondary"
            onClick={() => {
              if (step === 0) {
                setPage("home");
              } else {
                setStep(step - 1);
              }
              setNotice("");
            }}
          >
            ← Back
          </button>

          <div>
            <button className="secondary" onClick={save} disabled={submitting}>
              Save as Draft
            </button>

            {step < 5 ? (
              <button
                className="primary"
                onClick={next}
                disabled={step === 0 && (!valid || !parsedSpec)}
                title={step === 0 && (!valid || !parsedSpec) ? "Upload and validate the OpenAPI YAML to continue" : undefined}
              >
                Next
              </button>
            ) : (
              <button className="primary" onClick={submit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Request →"}
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`shell ${darkMode ? "dark-mode" : ""}`}>
      <header>
        <div className="header-left">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label="Toggle navigation"
            title="Toggle navigation"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="brand">
            <b>AX</b>
            <span>Apigee <em>Control Center</em></span>
          </div>
        </div>

        <div className="top-right" ref={topMenuRef}>
          <button
            type="button"
            className="toolbar-icon"
            onClick={() => setDarkMode((enabled) => !enabled)}
            aria-label={darkMode ? "Use light theme" : "Use dark theme"}
            title={darkMode ? "Use light theme" : "Use dark theme"}
          >
            {darkMode ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.1-7.1-1.4 1.4M6.3 17.7l-1.4 1.4m14.2 0-1.4-1.4M6.3 6.3 4.9 4.9" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" /></svg>
            )}
          </button>
          <button
            type="button"
            className="toolbar-icon notification-button"
            onClick={() => setOpenTopMenu((menu) => menu === "notifications" ? null : "notifications")}
            aria-label="Notifications"
            aria-expanded={openTopMenu === "notifications"}
            title="Notifications"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            <i aria-hidden="true" />
          </button>
          <button
            type="button"
            className="avatar"
            onClick={() => setOpenTopMenu((menu) => menu === "profile" ? null : "profile")}
            aria-label="Open profile"
            aria-expanded={openTopMenu === "profile"}
            title="Profile"
          >
            JD
          </button>

          {openTopMenu === "notifications" && (
            <section className="top-menu notifications-menu" aria-label="Notifications">
              <div className="top-menu-heading"><strong>Notifications</strong><span>2 new</span></div>
              <button type="button" className="notification-item" onClick={() => setOpenTopMenu(null)}>
                <b>Request REQ-1044 is ready for review</b>
                <small>Shipment API · 10 minutes ago</small>
              </button>
              <button type="button" className="notification-item" onClick={() => setOpenTopMenu(null)}>
                <b>Payment API was published to dev</b>
                <small>Deployment completed · 1 hour ago</small>
              </button>
              <button type="button" className="view-all-notifications" onClick={() => setOpenTopMenu(null)}>View all notifications</button>
            </section>
          )}

          {openTopMenu === "profile" && (
            <section className="top-menu profile-menu" aria-label="Profile menu">
              <div className="profile-summary">
                <span className="profile-avatar-large">JD</span>
                <div><strong>Jane Developer</strong><small>developer@company.com</small></div>
              </div>
              <button type="button" className="profile-menu-item" onClick={() => setOpenTopMenu(null)}>Manage your account</button>
              <button type="button" className="profile-menu-item" onClick={() => setOpenTopMenu(null)}>Settings</button>
              <button type="button" className="profile-menu-item sign-out" onClick={() => { setPage("home"); setOpenTopMenu(null); }}>Sign out</button>
            </section>
          )}
        <div className="top-right">
          <span className="connection">
            <i />{" "}
            {backendInfo?.mode === "apigee"
              ? `Apigee ${backendInfo.org}${backendInfo.dryRun ? " · dry run" : ""}`
              : backendOnline === false
                ? "Backend offline"
                : "Mock backend"}
          </span>
          <span>Environment: {env}</span>
          <span className="avatar">JD</span>
          <span>Developer</span>
        </div>
      </header>

      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        {nav("Dashboard", "home", "dashboard")}

        <button
          className={`nav create-nav ${page === "create" ? "active" : ""}`}
          onClick={goCreate}
        >
          <SidebarIcon name="create" /> Create API
        </button>

        {nav("Publish API", "publish", "publish")}
        {nav("Access / Read Only", "resources", "resources")}
        {nav("Approve Requests", "approve", "approve")}

        <hr />

        {nav("My requests", "requests", "requests")}

        <hr />

        <button className="nav" onClick={() => setPage("resources")}>
          ▱ API Proxies
        </button>

        <button className="nav" onClick={() => setPage("resources")}>
          ⬡ API Products
        </button>

        <button className="nav" onClick={() => setPage("resources")}>
          ♙ Consumers
        </button>

        <button className="nav" onClick={() => setPage("resources")}>
          ▤ Target Servers
        </button>

        <button className="nav" onClick={() => setPage("resources")}>
          ◷ Shared Flows
        </button>

        <div className="sidebar-bottom">
          <span className="status-light" /> Sandbox workspace{" "}
          {backendOnline === null
            ? "● Connecting to backend…"
            : backendOnline
              ? "● Backend connected"
              : "● Backend offline"}
        </div>
      </aside>

      <main>
        {page === "create" ? (
          renderWizard()
        ) : page === "provisioning" ? (
          <ProvisioningConsole
            requestId={requestId}
            apiName={api}
            environment={env}
            onViewRequests={() => setPage("requests")}
            onCreateAnother={goCreate}
          />
        ) : page === "catalog" ? renderCatalog() : page === "home" ? (
          <>
            <section className="dashboard-welcome">
              <h1>Welcome</h1>
              <p>Choose the operation you want to perform.</p>
              <span aria-hidden="true" />
            </section>

            <section className="home-cards dashboard-actions" aria-label="Quick actions">
              {[
                [
                  "Create",
                  "Onboard a new API using OpenAPI YAML.",
                  "Create API",
                  "blue",
                ],
                [
                  "Publish",
                  "Publish an existing proxy to an environment.",
                  "Publish API",
                  "purple",
                ],
                [
                  "Access / Read Only",
                  "View APIs, products and configuration.",
                  "View Resources",
                  "green",
                ],
                [
                  "Approve",
                  "Review onboarding requests.",
                  "Review Requests",
                  "orange",
                ],
              ].map((card, index) => (
                <button
                  key={card[0]}
                  className={`home-card ${card[3]}`}
                  onClick={() =>
                    index === 0
                      ? goCreate()
                      : setPage(
                          index === 1
                            ? "publish"
                            : index === 2
                              ? "resources"
                              : "approve"
                        )
                  }
                >
                  <i>{["⌘", "⇧", "◎", "◇"][index]}</i>
                  <h2>{card[0]}</h2>
                  <p>{card[1]}</p>
                  <b>{card[2]} →</b>
                </button>
              ))}
            </section>

            <section className="dashboard-section health-monitor">
              <div className="dashboard-section-heading">
                <div>
                  <small>PLATFORM STATUS</small>
                  <h2>Health Monitor</h2>
                  <p>Current health of your API platform.</p>
                </div>
              </div>

              <div className="metrics-grid">
                <div className="metric"><span>Managed APIs</span><strong>12</strong><small>+2 this month</small></div>
                <div className="metric"><span>Healthy deployments</span><strong>18</strong><small>Across 4 environments</small></div>
                <div className="metric"><span>Pending approval</span><strong>03</strong><small>Needs your review</small></div>
                <div className="metric"><span>Policy compliance</span><strong>96%</strong><small>+4% from last week</small></div>
              </div>
            </section>

            <section className="dashboard-section dashboard-requests">
            {panel(
              <>
                <h2>My Requests</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>API Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Environment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>REQ-1046</td>
                      <td>customer-api</td>
                      <td>Create API</td>
                      <td>
                        <em className="badge green">Completed</em>
                      </td>
                      <td>dev</td>
                    </tr>
                    <tr>
                      <td>REQ-1045</td>
                      <td>payment-api</td>
                      <td>Create API</td>
                      <td>
                        <em className="badge amber">In Progress</em>
                      </td>
                      <td>test</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
            </section>
          </>
        ) : page === "requests" ? (
          <>
            {title(
              "My Requests",
              "Track drafts, submitted requests and provisioning progress."
            )}

            {panel(
              <>
                <h2>Request History</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>API</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan={4}>No requests yet.</td>
                      </tr>
                    )}
                    {requests.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.apiName}</td>
                        <td>Create API</td>
                        <td>
                          <em
                            className={`badge ${
                              item.status === "COMPLETED"
                                ? "green"
                                : item.status === "FAILED"
                                  ? "red"
                                  : "amber"
                            }`}
                          >
                            {item.status}
                          </em>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>{notice}</p>
              </>
            )}
          </>
        ) : page === "resources" ? (
          <>
            {title(
              "Access / Read Only",
              "Browse existing Apigee resources. Demo data until backend integration."
            )}

            <div className="resource-grid">
              {[
                ["API Proxies", "12"],
                ["API Products", "8"],
                ["Developers", "24"],
                ["Developer Apps", "31"],
                ["Target Servers", "6"],
                ["Shared Flows", "4"],
              ].map((item) =>
                panel(
                  <>
                    <strong className="count">{item[1]}</strong>
                    <h2>{item[0]}</h2>
                    <p>Browse existing Apigee resources.</p>
                    <button className="secondary">
                      View {item[0]}
                    </button>
                  </>
                )
              )}
            </div>
          </>
        ) : page === "publish" ? (
          <>
            {title(
              "Publish API",
              "Deploy an existing proxy revision to an Apigee environment."
            )}

            {panel(
              <>
                <h2>Publish an existing proxy</h2>

                {select(
                  "API Proxy",
                  "customer-api",
                  () => {},
                  ["customer-api", "payment-api", "shipment-api"]
                )}

                {select("Revision", "3", () => {}, ["3", "2", "1"])}

                {select(
                  "Target Environment",
                  env,
                  setEnv,
                  environments
                )}

                <button
                  className="primary"
                  onClick={() =>
                    setNotice(
                      "Demo publish request prepared; no deployment performed."
                    )
                  }
                >
                  Review Publish →
                </button>

                <p>{notice}</p>
              </>,
              "narrow"
            )}
          </>
        ) : (
          <>
            {title(
              "Approve Requests",
              "Review onboarding requests before provisioning."
            )}

            {panel(
              <>
                <h2>Requests awaiting approval</h2>

                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>API</th>
                      <th>Requested by</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>REQ-1044</td>
                      <td>shipment-api</td>
                      <td>logistics-team</td>
                      <td>
                        <button
                          className="primary"
                          onClick={() =>
                            setNotice(
                              "Demo approval recorded; backend workflow not connected."
                            )
                          }
                        >
                          Review / Approve
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <p>{notice}</p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
