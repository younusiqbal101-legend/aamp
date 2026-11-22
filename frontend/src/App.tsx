
import ProvisioningConsole from './ProvisioningConsole';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Inbox,
  Bell,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Eye,
  FilePlus,
  GitBranch,
  Layers,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  Server,
  Sun,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
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

const sidebarIcons: Record<SidebarIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  create: Plus,
  publish: Upload,
  resources: Eye,
  approve: CircleCheck,
  requests: ClipboardList,
  proxies: Layers,
  products: Package,
  consumers: Users,
  servers: Server,
  flows: GitBranch,
};

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const Icon = sidebarIcons[name];
  return <Icon className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" />;
}

const steps = [
  "Upload & Validate YAML",
  "API Details",
  "Consumer & Access",
  "Target & Backend",
  "Policies & Shared Flows",
  "Review & Submit",
];

const homeCardIcons: LucideIcon[] = [FilePlus, Upload, Eye, CircleCheck];

const unsavedChangesMessage = "Save your changes before continuing.";

// The signed-in user. This portal has no login yet, so this is a placeholder: set your name and email here.
const portalUser: { name: string; email: string | null } = { name: "Portal user", email: null };
const portalUserInitials = portalUser.name
  .split(/s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .join("")
  .slice(0, 2)
  .toUpperCase();

// Empty state used inside tables: icon, short message and an optional action.
function TableEmpty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="table-empty">
      <Inbox size={28} strokeWidth={1.6} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{text}</span>
      {action}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [step, setStep] = useState(0);
  // On phones the sidebar starts hidden and opens as an overlay from the menu button.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.matchMedia("(max-width: 900px)").matches
  );
  const [darkMode, setDarkMode] = useState(false);
  const [openTopMenu, setOpenTopMenu] = useState<"notifications" | "profile" | null>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const methodsDropdownRef = useRef<HTMLLabelElement>(null);
  const [notice, setNotice] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [methodsDropdownOpen, setMethodsDropdownOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  // Command palette (Ctrl+K / Cmd+K): a centred page search.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        setPaletteQuery("");
        setPaletteIndex(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [requestSort, setRequestSort] = useState<{ key: "id" | "apiName" | "status"; dir: "asc" | "desc" }>({ key: "id", dir: "asc" });
  const [searchOpen, setSearchOpen] = useState(false);

  // Each wizard step is a new screen. Reset the document position after React
  // has rendered it so users always begin at the top of that step.
  useEffect(() => {
    if (page === "create") {
      document.querySelector("main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
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

  useEffect(() => {
    if (!methodsDropdownOpen) return;
    const closeDropdown = (event: MouseEvent) => {
      if (!methodsDropdownRef.current?.contains(event.target as Node)) {
        setMethodsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, [methodsDropdownOpen]);

  // YAML
  const [fileName, setFileName] = useState("");
  const [yaml, setYaml] = useState("");
  const [valid, setValid] = useState(false);
  const [parsedSpec, setParsedSpec] = useState<ParsedOpenApiSpec | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // API details
  const [api, setApi] = useState("");
  const [display, setDisplay] = useState("");
  const [basePath, setBasePath] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [env, setEnv] = useState("");
  // Real environment names come from the backend (Apigee orgs are not always dev/test/stage/prod).
  const [environmentsLoaded, setEnvironmentsLoaded] = useState(false);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [owningTeam, setOwningTeam] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [detailsValidationAttempted, setDetailsValidationAttempted] = useState(false);
  const [isEditingOperations, setIsEditingOperations] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [isEditingDeveloper, setIsEditingDeveloper] = useState(false);
  const [isEditingApp, setIsEditingApp] = useState(false);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [productValidationAttempted, setProductValidationAttempted] = useState(false);
  const [appValidationAttempted, setAppValidationAttempted] = useState(false);
  const [targetValidationAttempted, setTargetValidationAttempted] = useState(false);
  const [isEditingPolicies, setIsEditingPolicies] = useState(false);

  // Consumer and authentication
  const [consumer, setConsumer] = useState("Internal");
  const [auth, setAuth] = useState<AuthType>("API Key");

  // API Key configuration
  const [apiKeyHeader, setApiKeyHeader] = useState("x-api-key");

  // Basic Authentication configuration
  const [basicAuthService, setBasicAuthService] = useState("");
  const [basicAuthSecretReference, setBasicAuthSecretReference] = useState("");

  // OAuth configuration
  const [oauthGrant, setOauthGrant] = useState("Client Credentials");
  const [oauthScopes, setOauthScopes] = useState("");
  const [oauthTokenPath, setOauthTokenPath] = useState(
    "/oauth/token"
  );

  // JWT configuration
  const [jwtIssuer, setJwtIssuer] = useState("");
  const [jwtAudience, setJwtAudience] = useState("");
  const [jwtAlgorithm, setJwtAlgorithm] = useState("RS256");
  const [jwksUrl, setJwksUrl] = useState("");

  // API Product
  const [productMode, setProductMode] = useState("new");
  const [productName, setProductName] = useState("");
  const [productDisplayName, setProductDisplayName] = useState("");
  const [existingProduct, setExistingProduct] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productSpace, setProductSpace] = useState("");
  const [productEnvironment, setProductEnvironment] = useState("");
  const [productAccess, setProductAccess] = useState("");
  const [productApproval, setProductApproval] = useState("");
  const [productProxy, setProductProxy] = useState("");
  const [productResourcePath, setProductResourcePath] = useState("/**");
  const [productMethods, setProductMethods] = useState("");
  const [productQuotaLimit, setProductQuotaLimit] = useState("1000");
  const [productQuotaInterval, setProductQuotaInterval] = useState("1");
  const [productQuotaUnit, setProductQuotaUnit] = useState("");
  const [productOauthScopes, setProductOauthScopes] = useState("");

  // Developer
  const [developerMode, setDeveloperMode] = useState("new");
  const [developerFirstName, setDeveloperFirstName] = useState("");
  const [developerLastName, setDeveloperLastName] = useState("");
  const [developerName, setDeveloperName] = useState("");
  const [developerEmail, setDeveloperEmail] = useState("");
  const [developerValidationAttempted, setDeveloperValidationAttempted] = useState(false);
  const [existingDeveloper, setExistingDeveloper] = useState("");

  // Developer App
  const [appMode, setAppMode] = useState("new");
  const [appName, setAppName] = useState("");
  const [existingApp, setExistingApp] = useState("");

  // Target configuration
  const [targetMode, setTargetMode] = useState("existing");
  const [target, setTarget] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [backend, setBackend] = useState("");
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
    proxies: [],
    basePaths: [],
    targets: [],
    products: [],
    developers: [],
    apps: [],
    sharedFlows: {},
  });

  const existingProxies = resources.proxies;
  const targets = resources.targets;
  const existingProducts = resources.products;
  const existingDevelopers = resources.developers;
  const existingApps = resources.apps;
  const proxyOptions = Array.from(new Set([...existingProxies, api].filter(Boolean))).sort();
  const methodOptions = ["GET", "PATCH", "POST", "PUT", "DELETE", "HEAD", "CONNECT", "OPTIONS", "TRACE"];
  const selectedProductMethods = productMethods.split(",").map((method) => method.trim()).filter(Boolean);

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
        setEnv((current) => (list.includes(current) ? current : list[0]));
        setProductEnvironment((current) => (list.includes(current) ? current : ""));
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
    if (!environmentsLoaded || !env) return;
    apiClient
      .resources(env)
      .then((catalog) => {
        setResources(catalog);
        setExistingProduct((current) => catalog.products.includes(current) ? current : "");
        setExistingDeveloper((current) => catalog.developers.includes(current) ? current : "");
        setExistingApp((current) => catalog.apps.includes(current) ? current : "");
        setTarget((current) => catalog.targets.includes(current) ? current : "");
      })
      .catch((error: unknown) => {
        setResources({ proxies: [], basePaths: [], targets: [], products: [], developers: [], apps: [], sharedFlows: {} });
        setNotice(error instanceof Error ? error.message : "Could not load Apigee resources.");
      })
      .finally(() => setResourcesLoaded(true));
  }, [env, environmentsLoaded]);

  // Refresh request history whenever the page is opened.
  useEffect(() => {
    if (page !== "requests" && page !== "approve" && page !== "home") return;
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
        ? {
            mode: "new",
            name: developerName,
            firstName: developerFirstName,
            lastName: developerLastName,
            email: developerEmail,
          }
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
    disabled = false,
    error: string | null = null
  ) => (
    <label className={`field${error ? " has-error" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error && <small className="field-error"><CircleAlert size={14} aria-hidden="true" /> {error}</small>}
    </label>
  );

  const developerField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    type: string,
    error: string | null
  ) => (
    <label className={`field${error ? " has-error" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={!isEditingDeveloper}
        aria-invalid={Boolean(error)}
      />
      {error && <small className="field-error"><CircleAlert size={14} aria-hidden="true" /> {error}</small>}
    </label>
  );

  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: string[],
    disabled = false,
    error: string | null = null
  ) => (
    <label className={`field${error ? " has-error" : ""}`}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="" disabled>{`Select ${label.replace(" *", "")}`}</option>
        {options.length === 0 && <option value="" disabled>No live resources available</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <small className="field-error"><CircleAlert size={14} aria-hidden="true" /> {error}</small>}
    </label>
  );

  const toggleProductMethod = (method: string) => {
    setProductMethods(
      selectedProductMethods.includes(method)
        ? selectedProductMethods.filter((value) => value !== method).join(", ")
        : [...selectedProductMethods, method].join(", ")
    );
  };

  // Page header row: title on the left, optional primary action and the org chip on the right.
  const title = (heading: string, subtitle: string, action?: ReactNode) => (
    <div className="heading">
      <div>
        <small>APIGEE DEVELOPER PORTAL</small>
        <h1>{heading}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">
        {action}
        <span className="env">
          Apigee X · {env.toUpperCase()}
        </span>
      </div>
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

  // On phones the sidebar is an overlay: close it once a page is chosen.
  const closeSidebarOnSmallScreen = () => {
    if (window.matchMedia("(max-width: 900px)").matches) setSidebarCollapsed(true);
  };

  const goCreate = () => {
    setPage("create");
    setStep(0);
    setNotice("");
    closeSidebarOnSmallScreen();
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

    if (step === 1 && (!api.trim() || !display.trim() || !basePath.trim() || !version.trim() || !description.trim() || !env)) {
      setIsEditingDetails(true);
      setDetailsValidationAttempted(true);
      setNotice("Complete all required API Details fields before continuing.");
      requestAnimationFrame(() => {
        document.getElementById("api-details-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (step === 1 && existingProxies.some((name) => name.trim().toLowerCase() === api.trim().toLowerCase())) {
      setIsEditingDetails(true);
      setDetailsValidationAttempted(true);
      setNotice(`A proxy named "${api}" already exists in ${env}. Use a different proxy name.`);
      return;
    }
    if (step === 1 && resources.basePaths.some((path) => path.replace(/\/$/, "") === basePath.trim().replace(/\/$/, ""))) {
      setIsEditingDetails(true);
      setDetailsValidationAttempted(true);
      setNotice(`The base path "${basePath}" is already deployed in ${env}. Use a different base path.`);
      return;
    }

    const showRequiredError = (editorId: string, message: string) => {
      setNotice(message);
      requestAnimationFrame(() => {
        document.getElementById(editorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    if (step === 2) {
      if (productMode === "new" && (!productName.trim() || !productDisplayName.trim() || !productEnvironment || !productAccess || !productApproval || !productProxy || !productResourcePath.trim())) {
        setIsEditingProduct(true);
        showRequiredError("product-editor", "Complete all required API Product fields before continuing.");
        return;
      }
      if (productMode === "new" && existingProducts.includes(productName)) {
        setIsEditingProduct(true);
        showRequiredError("product-editor", `An API Product named "${productName}" already exists. Use a different name.`);
        return;
      }
      if (productMode === "existing" && !existingProduct) {
        setIsEditingProduct(true);
        showRequiredError("product-editor", "Select an existing API Product before continuing.");
        return;
      }
      if (developerMode === "new" && (!developerFirstName.trim() || !developerLastName.trim() || !developerEmail.trim() || !developerName.trim())) {
        setIsEditingDeveloper(true);
        setDeveloperValidationAttempted(true);
        showRequiredError("developer-editor", "Complete all required Developer fields before continuing.");
        return;
      }
      if (developerMode === "existing" && !existingDeveloper) {
        setIsEditingDeveloper(true);
        showRequiredError("developer-editor", "Select an existing Developer before continuing.");
        return;
      }
      if (appMode === "new" && !appName.trim()) {
        setIsEditingApp(true);
        showRequiredError("app-editor", "Enter an App Name before continuing.");
        return;
      }
      if (appMode === "new" && existingApps.includes(appName)) {
        setIsEditingApp(true);
        showRequiredError("app-editor", `A Developer App named "${appName}" already exists. Use a different name.`);
        return;
      }
      if (appMode === "existing" && !existingApp) {
        setIsEditingApp(true);
        showRequiredError("app-editor", "Select an existing Developer App before continuing.");
        return;
      }
    }

    if (step === 3) {
      if (targetMode === "existing" && !target) {
        setIsEditingTarget(true);
        showRequiredError("target-editor", "Select an existing Target Server before continuing.");
        return;
      }
      if (targetMode === "new" && (!newTarget.trim() || !backend.trim() || !targetPort.trim() || !targetProtocol)) {
        setIsEditingTarget(true);
        showRequiredError("target-editor", "Complete all required Target Server fields before continuing.");
        return;
      }
      if (targetMode === "new" && targets.includes(newTarget)) {
        setIsEditingTarget(true);
        showRequiredError("target-editor", `A Target Server named "${newTarget}" already exists in ${env}. Use a different name.`);
        return;
      }
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
      title={label}
      onClick={() => {
        setPage(destination);
        closeSidebarOnSmallScreen();
      }}
    >
      <SidebarIcon name={icon} />
      <span className="nav-label">{label}</span>
    </button>
  );

  const apiCatalog = existingProducts.map((name) => ({
    name,
    environment: env,
    owner: "Not available",
    revision: "Not available",
  }));

  function renderCatalog() {
    const visibleApis = apiCatalog.filter((item) =>
      item.name.toLowerCase().includes(catalogQuery.toLowerCase())
    );

    return <>
      {title("API catalog", "Browse API products available in your Apigee organization.")}
      <section className="catalog-toolbar">
        <label className="catalog-search">
          <span>Search APIs</span>
          <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search API products" />
        </label>
        <button className="secondary" onClick={() => setCatalogQuery("")}>Clear filters</button>
        <button className="primary" onClick={goCreate}>+ Create API</button>
      </section>
      <div className="api-catalog-grid">
        {visibleApis.map((item) => <article className="api-card" key={item.name}>
          <div className="api-card-top"><span className="api-mark">PRODUCT</span><em className="badge green">Available</em></div>
          <h2>{item.name}</h2><code>{item.name}</code><p>API product returned by the connected Apigee organization.</p>
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
              <button className="edit-button" type="button" onClick={() => {
                  if (isEditingProduct) {
                    if (productMode === "new" && (!productName.trim() || !productDisplayName.trim() || !productEnvironment || !productAccess || !productApproval || !productProxy || !productResourcePath.trim())) {
                      setProductValidationAttempted(true);
                      return;
                    }
                    if (productMode === "new" && existingProducts.some((name) => name.trim().toLowerCase() === productName.trim().toLowerCase())) {
                      setNotice(`An API Product named "${productName}" already exists. Use a different name.`);
                      return;
                    }
                    setIsEditingProduct(false);
                    setProductValidationAttempted(false);
                    setNotice("");
                  } else {
                    setIsEditingProduct(true);
                  }
                }}>
                  {isEditingProduct ? "Save" : "Edit"}
                </button>
            </div>
            <p>
              API Products define which API resources and access
              conditions a consumer application can use.
            </p>

            {choose(productMode, (mode) => {
              setProductMode(mode);
              setIsEditingProduct(false);
            })}

            {productMode === "new" ? (
              <div className="form">
                {isEditingProduct && notice === unsavedChangesMessage && <p className="edit-required-message">Save your API Product changes before continuing.</p>}
                {isEditingProduct && productValidationAttempted && <p className="edit-required-message">Please complete all required API Product fields.</p>}
                {notice.includes("API Product") && notice !== unsavedChangesMessage && <p className="edit-required-message">{notice}</p>}
                <div className="product-settings-box">
                  {field("Product Name *", productName, setProductName, "Product name", "text", !isEditingProduct)}
                  {field(
                    "Display Name *",
                    productDisplayName,
                    setProductDisplayName,
                    "Display name",
                    "text",
                    !isEditingProduct
                  )}
                  {field(
                    "Description",
                    productDescription,
                    setProductDescription,
                    "Description",
                    "text",
                    !isEditingProduct
                  )}
                </div>
                <div className="product-form-divider" aria-hidden="true" />
                <div className="product-settings-box">
                  {field("Space", productSpace, setProductSpace, "Space", "text", !isEditingProduct)}
                  {select(
                    "Environment *",
                    productEnvironment,
                    setProductEnvironment,
                    environments,
                    !isEditingProduct
                  )}
                  {select(
                    "Access *",
                    productAccess,
                    setProductAccess,
                    ["Private", "Public", "Internal only"],
                    !isEditingProduct
                  )}
                  {select(
                    "Request approval",
                    productApproval,
                    setProductApproval,
                    ["Automatic", "Manual"],
                    !isEditingProduct
                  )}
                  {field("Allowed OAuth scopes", productOauthScopes, setProductOauthScopes, "Allowed OAuth scope", "text", !isEditingProduct)}
                  <div className="product-form-divider" aria-hidden="true" />
                  <div className="quota-fields">
                    <input
                      value={productQuotaLimit}
                      onChange={(event) => setProductQuotaLimit(event.target.value)}
                      placeholder="API quota limit"
                      disabled={!isEditingProduct}
                      aria-label="API quota limit"
                    />
                    <span>Request every</span>
                    <input
                      value={productQuotaInterval}
                      onChange={(event) => setProductQuotaInterval(event.target.value)}
                      placeholder="Time interval"
                      disabled={!isEditingProduct}
                      aria-label="Time interval"
                    />
                    <select
                      value={productQuotaUnit}
                      onChange={(event) => setProductQuotaUnit(event.target.value)}
                      disabled={!isEditingProduct}
                      aria-label="Quota unit"
                    >
                      <option value="" disabled>Unit</option>
                      {["second", "minute", "hour", "day", "month", "year"].map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="product-form-divider" aria-hidden="true" />
                <div className="product-settings-box proxy-settings-box">
                  <select
                    value={productProxy}
                    onChange={(event) => setProductProxy(event.target.value)}
                    disabled={!isEditingProduct}
                    aria-label="API Proxy"
                  >
                    <option value="" disabled>API Proxy *</option>
                    {proxyOptions.map((proxy) => <option key={proxy} value={proxy}>{proxy}</option>)}
                  </select>
                  <h4 className="proxy-operation-title">Operation</h4>
                  <input
                    value={productResourcePath}
                    onChange={(event) => setProductResourcePath(event.target.value)}
                    placeholder="Path *"
                    disabled={!isEditingProduct}
                    aria-label="Path"
                  />
                  <label className="field method-picker" ref={methodsDropdownRef}>
                    <button
                      type="button"
                      className="method-picker-trigger"
                      onClick={() => setMethodsDropdownOpen((open) => !open)}
                      disabled={!isEditingProduct}
                      aria-expanded={methodsDropdownOpen}
                    >
                      <span className={selectedProductMethods.length ? "method-picker-value" : "method-picker-placeholder"}>
                        {selectedProductMethods.length ? selectedProductMethods.join(", ") : "Methods"}
                      </span>
                      <span aria-hidden="true"><ChevronDown size={16} /></span>
                    </button>
                    {methodsDropdownOpen && (
                      <div className="method-picker-menu">
                        {methodOptions.map((method) => (
                          <label key={method} className="method-picker-option">
                            <input
                              type="checkbox"
                              checked={selectedProductMethods.includes(method)}
                              onChange={() => toggleProductMethod(method)}
                            />
                            {method}
                          </label>
                        ))}
                      </div>
                    )}
                    <small className="method-picker-help">The HTTP methods allowed on the resource path. When none is specified, all methods are allowed.</small>
                  </label>
                </div>
              </div>
            ) : (
              <div className="form">
                {select(
                  "Existing API Product",
                  existingProduct,
                  setExistingProduct,
                  existingProducts,
                  !isEditingProduct
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
              <button className="edit-button" type="button" onClick={() => {
                  if (isEditingDeveloper) {
                    if (
                      developerMode === "new" &&
                      (!developerFirstName.trim() || !developerLastName.trim() || !developerEmail.trim() || !developerName.trim())
                    ) {
                      setDeveloperValidationAttempted(true);
                      return;
                    }
                    if (developerMode === "new" && existingDevelopers.some((email) => email.trim().toLowerCase() === developerEmail.trim().toLowerCase())) {
                      setNotice(`A Developer with email "${developerEmail}" already exists. Use a different email.`);
                      return;
                    }
                    setIsEditingDeveloper(false);
                    setDeveloperValidationAttempted(false);
                    setNotice("");
                  } else {
                    setIsEditingDeveloper(true);
                  }
                }}>
                  {isEditingDeveloper ? "Save" : "Edit"}
                </button>
            </div>
            <p>
              A Developer represents the consumer or partner
              registered in Apigee.
            </p>

            {choose(developerMode, (mode) => {
              setDeveloperMode(mode);
              setIsEditingDeveloper(false);
              setDeveloperValidationAttempted(false);
            })}

            {developerMode === "new" ? (
              <div className="form">
                {isEditingDeveloper && notice === unsavedChangesMessage && <p className="edit-required-message">Save your Developer changes before continuing.</p>}
                {(notice === "Complete all required Developer fields before continuing." || notice === "Select an existing Developer before continuing." || notice.startsWith("A Developer with email")) && <p className="edit-required-message">{notice}</p>}
                {developerField(
                  "First Name *",
                  developerFirstName,
                  setDeveloperFirstName,
                  "First name *",
                  "text",
                  developerValidationAttempted && !developerFirstName.trim() ? "Enter developer's first name" : null
                )}
                {developerField(
                  "Last Name *",
                  developerLastName,
                  setDeveloperLastName,
                  "Last name *",
                  "text",
                  developerValidationAttempted && !developerLastName.trim() ? "Enter developer's last name" : null
                )}
                {developerField(
                  "Email *",
                  developerEmail,
                  setDeveloperEmail,
                  "Email *",
                  "email",
                  developerValidationAttempted && !developerEmail.trim() ? "Enter developer's email" : null
                )}
                {developerField(
                  "Username *",
                  developerName,
                  setDeveloperName,
                  "Username *",
                  "text",
                  developerValidationAttempted && !developerName.trim() ? "Enter developer's username" : null
                )}
              </div>
            ) : (
              <div className="form">
                {select(
                  "Existing Developer",
                  existingDeveloper,
                  setExistingDeveloper,
                  existingDevelopers,
                  !isEditingDeveloper
                )}
              </div>
            )}
          </>
        )}

        {panel(
          <>
            <div className="section-title-row" id="app-editor">
              <h3>E. Developer App</h3>
              <button className="edit-button" type="button" onClick={() => {
                  if (isEditingApp) {
                    if (appMode === "new" && !appName.trim()) {
                      setAppValidationAttempted(true);
                      return;
                    }
                    if (appMode === "new" && existingApps.some((name) => name.trim().toLowerCase() === appName.trim().toLowerCase())) {
                      setNotice(`A Developer App named "${appName}" already exists. Use a different name.`);
                      return;
                    }
                    setIsEditingApp(false);
                    setAppValidationAttempted(false);
                    setNotice("");
                  } else {
                    setIsEditingApp(true);
                  }
                }}>
                  {isEditingApp ? "Save" : "Edit"}
                </button>
            </div>
            <p>
              A Developer App represents the application that
              consumes the API and holds its credentials.
            </p>

            {choose(appMode, (mode) => {
              setAppMode(mode);
              setIsEditingApp(false);
            })}

            {appMode === "new" ? (
              <div className="form">
                {isEditingApp && notice === unsavedChangesMessage && <p className="edit-required-message">Save your Developer App changes before continuing.</p>}
                {isEditingApp && appValidationAttempted && <p className="edit-required-message">Enter an App Name.</p>}
                {notice.includes("Developer App") && notice !== unsavedChangesMessage && <p className="edit-required-message">{notice}</p>}
                {field("App Name *", appName, setAppName, "App name", "text", !isEditingApp, appValidationAttempted && !appName.trim() ? "Enter app name" : null)}
              </div>
            ) : (
              <div className="form">
                {select(
                  "Existing Developer App",
                  existingApp,
                  setExistingApp,
                  existingApps,
                  !isEditingApp
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
              <b>{index < step ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : index + 1}</b>
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

                  <strong><Upload size={24} aria-hidden="true" /></strong>
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
                  <span>Or paste OpenAPI YAML</span>
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
                    <strong><CircleCheck size={16} aria-hidden="true" /> OpenAPI document parsed</strong>
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
                    <li key={check}><i>{valid ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}</i>{check}</li>
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
                        if (!api.trim() || !display.trim() || !basePath.trim() || !version.trim() || !description.trim() || !env) {
                          setDetailsValidationAttempted(true);
                          setNotice("Complete all required API Details fields before saving.");
                          return;
                        }
                        if (existingProxies.some((name) => name.trim().toLowerCase() === api.trim().toLowerCase())) {
                          setDetailsValidationAttempted(true);
                          setNotice(`A proxy named "${api}" already exists in ${env}. Use a different proxy name.`);
                          return;
                        }
                        if (resources.basePaths.some((path) => path.replace(/\/$/, "") === basePath.trim().replace(/\/$/, ""))) {
                          setDetailsValidationAttempted(true);
                          setNotice(`The base path "${basePath}" is already deployed in ${env}. Use a different base path.`);
                          return;
                        }
                        setIsEditingDetails(false);
                        setDetailsValidationAttempted(false);
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
                  {isEditingDetails && detailsValidationAttempted && (
                    <p className="edit-required-message">{notice || "Complete all required API Details fields before saving."}</p>
                  )}

                  <div className="form">
                    {field("Proxy Name *", api, setApi, "", "text", !isEditingDetails, detailsValidationAttempted && !api.trim() ? "Enter proxy name" : null)}
                    {field("Display Name *", display, setDisplay, "", "text", !isEditingDetails, detailsValidationAttempted && !display.trim() ? "Enter display name" : null)}
                    {field("Base Path *", basePath, setBasePath, "", "text", !isEditingDetails, detailsValidationAttempted && !basePath.trim() ? "Enter base path" : null)}
                    {field("API Version *", version, setVersion, "", "text", !isEditingDetails, detailsValidationAttempted && !version.trim() ? "Enter API version" : null)}
                    {field("Description *", description, setDescription, "", "text", !isEditingDetails, detailsValidationAttempted && !description.trim() ? "Enter description" : null)}
                    {select(
                      "Environment *",
                      env,
                      setEnv,
                      environments,
                      !isEditingDetails,
                      detailsValidationAttempted && !env ? "Select environment" : null
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
                  <button className="edit-button" type="button" onClick={() => {
                      if (isEditingTarget) {
                        if (targetMode === "new" && (!newTarget.trim() || !backend.trim() || !targetPort.trim() || !targetProtocol)) {
                          setTargetValidationAttempted(true);
                          return;
                        }
                        if (targetMode === "new" && targets.some((name) => name.trim().toLowerCase() === newTarget.trim().toLowerCase())) {
                          setNotice(`A Target Server named "${newTarget}" already exists in ${env}. Use a different name.`);
                          return;
                        }
                        setIsEditingTarget(false);
                        setTargetValidationAttempted(false);
                        setNotice("");
                      } else {
                        setIsEditingTarget(true);
                      }
                    }}>
                      {isEditingTarget ? "Save" : "Edit"}
                    </button>
                </div>
                <p>
                  Choose an existing Target Server or create
                  a new one for the selected environment.
                </p>

                {choose(targetMode, (mode) => {
                  setTargetMode(mode);
                  setIsEditingTarget(false);
                })}

                {targetMode === "existing" ? (
                  <div className="form">
                    {select(
                      "Existing Target Server",
                      target,
                      setTarget,
                      targets,
                      !isEditingTarget
                    )}
                  </div>
                ) : (
                  <div className="form target-server-form">
                    {isEditingTarget && notice === unsavedChangesMessage && <p className="edit-required-message">Save your Target Server changes before continuing.</p>}
                    {isEditingTarget && targetValidationAttempted && <p className="edit-required-message">Complete all required Target Server fields.</p>}
                    {notice.includes("Target Server") && notice !== unsavedChangesMessage && <p className="edit-required-message">{notice}</p>}
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
                  {backendInfo?.dryRun
                    ? "Dry run: the proxy bundle is generated and saved by the backend, but nothing is created or changed in Apigee."
                    : `Live: submitting creates or updates resources in Apigee organization "${backendInfo?.org}" (${env}).`}
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
            <ArrowLeft size={16} aria-hidden="true" /> Back
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
                {submitting ? "Submitting…" : <>Submit Request <ArrowRight size={16} aria-hidden="true" /></>}
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // Header search: jumps to a page. It does not query Apigee.
  const headerPageLinks: { label: string; go: () => void }[] = [
    { label: "Dashboard", go: () => setPage("home") },
    { label: "Create API", go: goCreate },
    { label: "Publish API", go: () => setPage("publish") },
    { label: "Access / Read Only", go: () => setPage("resources") },
    { label: "Approve Requests", go: () => setPage("approve") },
    { label: "My requests", go: () => setPage("requests") },
  ];
  const headerMatches = headerQuery.trim()
    ? headerPageLinks.filter((item) =>
        item.label.toLowerCase().includes(headerQuery.trim().toLowerCase())
      )
    : [];
  const openHeaderPage = (item: { go: () => void }) => {
    item.go();
    closeSidebarOnSmallScreen();
    setHeaderQuery("");
    setSearchOpen(false);
  };

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
            <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div className="brand">
            <span>Apigee <em>Control Center</em></span>
          </div>
          {/* Org chip hidden for now.
          <span className="connection">
            <i aria-hidden="true" />
            {backendInfo?.mode === "apigee"
              ? `Apigee ${backendInfo.org}${backendInfo.dryRun ? " (dry run)" : ""}`
              : backendOnline === false
                ? "Backend offline"
                : "Backend connected"}
          </span>
          */}
        </div>

        <div
          className={`header-search ${searchOpen ? "is-open" : ""}`}
          role="search"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setHeaderQuery("");
              setSearchOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setHeaderQuery("");
              setSearchOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="search-toggle"
            aria-label={searchOpen ? "Close search" : "Open search"}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <label className="search-field">
            <span className="sr-only">Search pages</span>
            <Search size={18} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="search"
              value={headerQuery}
              onChange={(event) => setHeaderQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && headerMatches[0]) {
                  openHeaderPage(headerMatches[0]);
                }
              }}
              placeholder="Search pages"
              autoComplete="off"
              aria-controls="header-search-results"
            />
          </label>
          {headerMatches.length > 0 && (
            <ul className="search-results" id="header-search-results">
              {headerMatches.map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => openHeaderPage(item)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
              <Sun size={18} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Moon size={18} strokeWidth={1.8} aria-hidden="true" />
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
            <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
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
            {portalUserInitials}
          </button>

          {openTopMenu === "notifications" && (
            <section className="top-menu notifications-menu" aria-label="Notifications">
              <div className="top-menu-heading"><strong>Notifications</strong><span>{requests.length} recent</span></div>
              <button type="button" className="notification-item" onClick={() => setOpenTopMenu(null)}>
                <b>Open My Requests to see live request updates</b>
                <small>Updates are supplied by the backend.</small>
              </button>
              <button type="button" className="notification-item" onClick={() => setOpenTopMenu(null)}>
                <b>No static notifications are shown</b>
                <small>Live notifications will appear here when available.</small>
              </button>
              <button type="button" className="view-all-notifications" onClick={() => setOpenTopMenu(null)}>View all notifications</button>
            </section>
          )}

          {openTopMenu === "profile" && (
            <section className="top-menu profile-menu" aria-label="Account menu">
              <div className="profile-summary">
                <span className="profile-avatar-large">{portalUserInitials}</span>
                <div>
                  <strong>{portalUser.name}</strong>
                  <small>{portalUser.email ?? "Signed in to this portal"}</small>
                </div>
              </div>
              <div className="profile-section-label">Organisation</div>
            <div className="profile-org">
                <CircleCheck size={18} aria-hidden="true" className={backendInfo?.mode === "apigee" ? "is-connected" : "is-offline"} />
                <div>
                  <strong>{backendInfo?.org ?? "Not connected"}</strong>
                  <small>
                    {backendInfo?.mode === "apigee"
                      ? `Apigee X · ${env.toUpperCase() || "—"}${backendInfo.dryRun ? " · dry run" : ""}`
                      : "Backend offline"}
                  </small>
                </div>
              </div>
              <p className="profile-note">Only one organisation is connected to this portal.</p>
            </section>
          )}
        </div>
        <div className="legacy-header-status">
          <span className="connection">
            <i />{" "}
            {backendInfo?.mode === "apigee"
              ? `Apigee ${backendInfo.org}${backendInfo.dryRun ? " · dry run" : ""}`
              : backendOnline === false
                ? "Backend offline"
                : "Connecting to backend"}
          </span>
        </div>
      </header>

      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        {nav("Dashboard", "home", "dashboard")}

        <button
          className={`nav create-nav ${page === "create" ? "active" : ""}`}
          title="Create API"
          onClick={goCreate}
        >
          <SidebarIcon name="create" /><span className="nav-label">Create API</span>
        </button>

        {nav("Publish API", "publish", "publish")}
        {nav("Access / Read Only", "resources", "resources")}
        {nav("Approve Requests", "approve", "approve")}

        <hr />

        {nav("My requests", "requests", "requests")}

        <hr />

        <button className="nav" onClick={() => { setPage("resources"); closeSidebarOnSmallScreen(); }}>
          <Layers className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" /><span className="nav-label">API Proxies</span>
        </button>

        <button className="nav" onClick={() => { setPage("resources"); closeSidebarOnSmallScreen(); }}>
          <Package className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" /><span className="nav-label">API Products</span>
        </button>

        <button className="nav" onClick={() => { setPage("resources"); closeSidebarOnSmallScreen(); }}>
          <Users className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" /><span className="nav-label">Consumers</span>
        </button>

        <button className="nav" onClick={() => { setPage("resources"); closeSidebarOnSmallScreen(); }}>
          <Server className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" /><span className="nav-label">Target Servers</span>
        </button>

        <button className="nav" onClick={() => { setPage("resources"); closeSidebarOnSmallScreen(); }}>
          <GitBranch className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" /><span className="nav-label">Shared Flows</span>
        </button>

      </aside>

      {/* Phone/tablet: tapping outside the open sidebar closes it. */}
      {!sidebarCollapsed && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

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
                  <i>{(() => { const Icon = homeCardIcons[index]; return <Icon size={22} strokeWidth={1.8} aria-hidden="true" />; })()}</i>
                  <h2>{card[0]}</h2>
                  <p>{card[1]}</p>
                  <b>{card[2]} <ArrowRight size={14} aria-hidden="true" /></b>
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
                <div className="metric"><span>API Products</span><strong>{resourcesLoaded ? existingProducts.length : <span className="skeleton skeleton-num" aria-label="Loading" />}</strong><small>Available in Apigee</small></div>
                <div className="metric"><span>Target Servers</span><strong>{resourcesLoaded ? targets.length : <span className="skeleton skeleton-num" aria-label="Loading" />}</strong><small>Available in {env || "the selected environment"}</small></div>
                <div className="metric"><span>Requests in progress</span><strong>{requests.filter((item) => item.status === "PROVISIONING").length}</strong><small>Live provisioning status</small></div>
                <div className="metric"><span>Pending drafts</span><strong>{requests.filter((item) => item.status === "DRAFT").length}</strong><small>Awaiting submission</small></div>
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
                    {requests.length === 0 ? (
                      <tr><td colSpan={5}><TableEmpty title="No requests yet" text="Your onboarding requests will appear here." /></td></tr>
                    ) : requests.slice(0, 5).map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td><td>{item.apiName}</td><td>Create API</td>
                        <td><em className={`badge ${item.status === "COMPLETED" ? "green" : item.status === "FAILED" ? "red" : "amber"}`}>{item.status}</em></td>
                        <td>{item.environment}</td>
                      </tr>
                    ))}
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
              "Track drafts, submitted requests and provisioning progress.",
              <button className="primary" type="button" onClick={goCreate}>+ Create API</button>
            )}

            {panel(
              <>
                <h2>Request History</h2>
                <table>
                  <thead>
                    <tr>
                      {([["id", "Request ID"], ["apiName", "API"], ["type", "Type"], ["status", "Status"]] as const).map(([key, label]) => {
                        const sortable = key !== "type";
                        const active = requestSort.key === key;
                        const Icon = !sortable || !active ? ArrowUpDown : requestSort.dir === "asc" ? ArrowUp : ArrowDown;
                        return (
                          <th key={key} aria-sort={active ? (requestSort.dir === "asc" ? "ascending" : "descending") : undefined}>
                            {sortable ? (
                              <button
                                type="button"
                                className="sort-button"
                                onClick={() => setRequestSort((current) => ({ key: key as "id" | "apiName" | "status", dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }))}
                              >
                                {label}
                                <Icon size={14} aria-hidden="true" />
                              </button>
                            ) : (
                              label
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan={4}><TableEmpty title="No requests yet" text="Create an API to start your first onboarding request." action={<button className="primary" type="button" onClick={goCreate}>+ Create API</button>} /></td>
                      </tr>
                    )}
                    {[...requests]
                      .sort((a, b) => {
                        const pick = (r: RequestSummary) => (requestSort.key === "apiName" ? r.apiName : requestSort.key === "status" ? r.status : r.id);
                        const result = String(pick(a)).localeCompare(String(pick(b)), undefined, { numeric: true });
                        return requestSort.dir === "asc" ? result : -result;
                      })
                      .map((item) => (
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
              "Browse resources currently available in Apigee."
            )}

            <div className="resource-grid">
              {[
                ["API Products", String(existingProducts.length)],
                ["Developers", String(existingDevelopers.length)],
                ["Developer Apps", String(existingApps.length)],
                ["Target Servers", String(targets.length)],
                ["Shared Flows", String(resources.sharedFlows[env]?.length ?? 0)],
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
                  existingProducts[0] ?? "",
                  () => {},
                  existingProducts
                )}

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
                      "Publishing is handled by the live provisioning workflow after an onboarding request is submitted."
                    )
                  }
                >
                  Review Publish <ArrowRight size={16} aria-hidden="true" />
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
                    {requests.filter((item) => item.status === "DRAFT").length === 0 && (
                      <tr><td colSpan={4}><TableEmpty title="Nothing waiting for review" text="New onboarding requests will appear here for approval." /></td></tr>
                    )}
                    {requests.filter((item) => item.status === "DRAFT").map((item) => (
                      <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.apiName}</td>
                      <td>—</td>
                      <td>
                        <button
                          className="primary"
                          onClick={() => setPage("requests")}
                        >
                          View Request
                        </button>
                      </td>
                    </tr>
                    ))}
                  </tbody>
                </table>

                <p>{notice}</p>
              </>
            )}
          </>
        )}
      </main>

      {paletteOpen && (() => {
        const matches = headerPageLinks.filter((item) =>
          item.label.toLowerCase().includes(paletteQuery.trim().toLowerCase())
        );
        const choose = (item: { go: () => void }) => {
          openHeaderPage(item);
          setPaletteOpen(false);
        };
        return (
          <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}>
            <div
              className="palette"
              role="dialog"
              aria-modal="true"
              aria-label="Search pages"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <input
                autoFocus
                className="palette-input"
                placeholder="Search pages"
                value={paletteQuery}
                onChange={(event) => {
                  setPaletteQuery(event.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setPaletteIndex((i) => Math.min(i + 1, matches.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setPaletteIndex((i) => Math.max(i - 1, 0));
                  } else if (event.key === "Enter" && matches[paletteIndex]) {
                    choose(matches[paletteIndex]);
                  } else if (event.key === "Escape") {
                    setPaletteOpen(false);
                  }
                }}
                aria-controls="palette-results"
                aria-label="Search pages"
              />
              <ul className="palette-list" id="palette-results" role="listbox">
                {matches.map((item, index) => (
                  <li key={item.label} role="option" aria-selected={index === paletteIndex}>
                    <button
                      type="button"
                      className={index === paletteIndex ? "is-active" : ""}
                      onMouseEnter={() => setPaletteIndex(index)}
                      onClick={() => choose(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
              {matches.length === 0 && <p className="palette-empty">No pages match “{paletteQuery}”.</p>}
              <div className="palette-footer">
                <span>↑ ↓ to move</span>
                <span>Enter to open</span>
                <span>Esc to close</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
