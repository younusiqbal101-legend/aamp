
import ProvisioningConsole from './ProvisioningConsole';
import { type ParsedOpenApiSpec } from "./openApiParser";
import { useEffect, useState, type ReactNode } from "react";
import {
  api as apiClient,
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

const steps = [
  "Upload & Validate YAML",
  "API Details",
  "Consumer & Access",
  "Target & Backend",
  "Policies & Shared Flows",
  "Review & Submit",
];

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
  const [notice, setNotice] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");

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
  const [backend, setBackend] = useState(
    "https://shipment.dev.internal.company.com"
  );

  // Policy configuration
  const [policyConfig, setPolicyConfig] = useState<Record<string, any>>(
    {}
  );

  const [requestId, setRequestId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
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

  // Backend health + catalogue on startup.
  useEffect(() => {
    apiClient
      .health()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
    apiClient
      .resources()
      .then(setResources)
      .catch(() => {
        /* keep fallbacks; health indicator shows the problem */
      });
  }, []);

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
        ? { mode: "new", name: newTarget, url: backend }
        : { mode: "existing", name: target },
    policies: policyConfig,
  });

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder = "",
    type = "text"
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );

  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: string[]
  ) => (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
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

  const nav = (label: string, destination: Page) => (
    <button
      className={`nav ${page === destination ? "active" : ""}`}
      onClick={() => setPage(destination)}
    >
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
      <div className="columns">
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

            <hr />

            <h3>C. API Product</h3>
            <p>
              API Products define which API resources and access
              conditions a consumer application can use.
            </p>

            {choose(productMode, setProductMode)}

            {productMode === "new" ? (
              <div className="form">
                {field("Product Name *", productName, setProductName)}
                {field(
                  "Display Name *",
                  productDisplayName,
                  setProductDisplayName
                )}
                {field(
                  "Description",
                  productDescription,
                  setProductDescription
                )}
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

            <hr />

            <h3>D. Developer</h3>
            <p>
              A Developer represents the consumer or partner
              registered in Apigee.
            </p>

            {choose(developerMode, setDeveloperMode)}

            {developerMode === "new" ? (
              <div className="form">
                {field(
                  "Developer Username *",
                  developerName,
                  setDeveloperName
                )}
                {field(
                  "Developer Email *",
                  developerEmail,
                  setDeveloperEmail
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

            <hr />

            <h3>E. Developer App</h3>
            <p>
              A Developer App represents the application that
              consumes the API and holds its credentials.
            </p>

            {choose(appMode, setAppMode)}

            {appMode === "new" ? (
              <div className="form">
                {field("App Name *", appName, setAppName)}
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

        {notice && <div className="notice">{notice}</div>}

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
              <>
                <h3>Validation checks</h3>
                <ul>
                  <li>OpenAPI version</li>
                  <li>API title and description</li>
                  <li>Paths and operations</li>
                  <li>Request and response schemas</li>
                  <li>Organization naming rules</li>
                </ul>
              </>,
              "aside"
            )}
          </div>
        )}

        {/* STEP 2: API DETAILS AND GENERATED RESOURCES */}
        {step === 1 && (
          <div className="openapi-step-two">
            <div className="columns">
              {panel(
                <>
                  <h2>Step 2: API Details</h2>
                  <p>
                    Review the API metadata extracted from your OpenAPI
                    document. You can adjust the portal-level details.
                  </p>

                  <div className="form">
                    {field("API Name *", api, setApi)}
                    {field("Display Name *", display, setDisplay)}
                    {field("Base Path *", basePath, setBasePath)}
                    {field("API Version *", version, setVersion)}
                    {field("Description *", description, setDescription)}
                    {select(
                      "Environment *",
                      env,
                      setEnv,
                      ["dev", "test", "stage", "prod"]
                    )}
                    {field("Owning Team", "Platform APIs", () => {})}
                    {field("Contact Email", "api-platform@company.com", () => {})}
                  </div>
                </>
              )}

              {panel(
                <>
                  <h3>OpenAPI Summary</h3>
                  <dl>
                    <dt>Specification</dt>
                    <dd>{parsedSpec?.specVersion || "Not detected"}</dd>
                    <dt>API title</dt>
                    <dd>{parsedSpec?.title || display}</dd>
                    <dt>API version</dt>
                    <dd>{parsedSpec?.version || version}</dd>
                    <dt>Resources</dt>
                    <dd>{parsedSpec?.resources.length ?? 0}</dd>
                    <dt>Operations</dt>
                    <dd>{parsedSpec?.totalOperations ?? 0}</dd>
                    <dt>Request / response schemas</dt>
                    <dd>{parsedSpec?.schemaCount ?? 0}</dd>
                    <dt>Source file</dt>
                    <dd>{fileName || "Pasted YAML"}</dd>
                  </dl>
                </>,
                "aside"
              )}
            </div>

            <section className="panel generated-resources-panel">
              <div className="generated-resources-heading">
                <div>
                  <h2>Generated API Resources & Conditional Flows</h2>
                  <p>
                    These resources and operations were extracted from the
                    uploaded OpenAPI document. Review or edit the proposed
                    Apigee flow names and conditions before continuing.
                  </p>
                </div>
                <span className="resource-count">
                  {parsedSpec?.resources.length ?? 0} resources ·{" "}
                  {parsedSpec?.totalOperations ?? 0} operations
                </span>
              </div>

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
                <h2>Step 4: Target & Backend Configuration</h2>
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
                  <div className="form">
                    {field(
                      "Target Server Name *",
                      newTarget,
                      setNewTarget
                    )}
                    {field(
                      "Backend URL *",
                      backend,
                      setBackend
                    )}
                    {field("Port", "443", () => {})}
                    {select(
                      "Protocol",
                      "HTTPS",
                      () => {},
                      ["HTTPS", "HTTP"]
                    )}
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
                  Frontend prototype only. Submission does not
                  create actual Apigee resources yet.
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
              <button className="primary" onClick={next}>
                Next: {steps[step + 1]} →
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
    <div className="shell">
      <header>
        <div className="brand">
          <b>AX</b>
          <span>Apigee <em>Control Center</em></span>
        </div>

        <div className="top-right">
          <span className="connection"><i /> Management API connected</span>
          <span>Environment: {env}</span>
          <span className="avatar">JD</span>
          <span>Developer</span>
        </div>
      </header>

      <aside className="sidebar">
        <p className="nav-section">WORKSPACE</p>
        {nav("Dashboard", "home")}
        {nav("API catalog", "catalog")}

        <button
          className={`nav ${page === "create" ? "active" : ""}`}
          onClick={goCreate}
        >
          + Create API
        </button>

        <button className="subnav" onClick={goCreate}>
          New API (YAML)
        </button>

        {nav("Deployments", "publish")}
        {nav("Resources", "resources")}
        {nav("Approvals", "approve")}

        <hr />

        <p className="nav-section">WORKFLOW</p>
        {nav("My requests", "requests")}

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
          <span className="status-light" /> Sandbox workspace
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
            {title(
              "Good morning, Jordan",
              "Here is the current health of your API platform."
            )}

            <section className="metrics-grid">
              <div className="metric"><span>Managed APIs</span><strong>12</strong><small>+2 this month</small></div>
              <div className="metric"><span>Healthy deployments</span><strong>18</strong><small>Across 4 environments</small></div>
              <div className="metric"><span>Pending approval</span><strong>03</strong><small>Needs your review</small></div>
              <div className="metric"><span>Policy compliance</span><strong>96%</strong><small>+4% from last week</small></div>
            </section>

            <div className="home-cards">
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
            </div>

            {panel(
              <>
                <h2>My Recent Requests</h2>
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
                  ["dev", "test", "stage", "prod"]
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
