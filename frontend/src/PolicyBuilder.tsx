import { useEffect, useRef, useState } from "react";

type PolicyDetails = {
  enabled: boolean;
  policyName: string;
  displayName: string;
};

const sharedFlowPlacements = [
  "Proxy Endpoint Request PreFlow",
  "Proxy Endpoint Request PostFlow",
  "Proxy Endpoint Response PreFlow",
  "Proxy Endpoint Response PostFlow",
  "Target Endpoint Request PreFlow",
  "Target Endpoint Request PostFlow",
  "Target Endpoint Response PreFlow",
  "Target Endpoint Response PostFlow",
  "PostClientFlow",
] as const;

type SharedFlowPlacement = (typeof sharedFlowPlacements)[number];
type SharedFlowSelection = {
  name: string;
  placement: SharedFlowPlacement;
  calloutPolicyName: string;
};

type PolicyConfig = {
  quota: PolicyDetails & {
    limit: number;
    timeUnit: "minute" | "hour" | "day";
    identifier: "Client IP" | "Developer App" | "API Key";
  };
  spikeArrest: PolicyDetails & {
    rate: number;
    timeUnit: "ps" | "pm";
  };
  jsonThreatProtection: PolicyDetails & {
    maxDepth: number;
    maxEntries: number;
    maxStringLength: number;
  };
  cors: PolicyDetails & {
    origins: string;
    methods: string;
    headers: string;
  };
  sharedFlows: SharedFlowSelection[];
  sharedFlowMode: "existing" | "new";
  newSharedFlow: {
    name: string;
    displayName: string;
    bundleFileName: string;
  };
};

type PolicyBuilderProps = {
  environment: string;
  // Live shared flows per environment from the backend (falls back to the defaults below).
  sharedFlowsByEnvironment?: Record<string, string[]>;
  onChange: (config: PolicyConfig) => void;
  onEditingChange?: (isEditing: boolean) => void;
  needsSaveAttention?: boolean;
};

// Temporary environment-specific data for the frontend prototype.
// The backend will replace this with live Apigee Management API responses.
const defaultSharedFlows: Record<string, string[]> = {
  dev: [
    "SF-Common-Logging",
    "SF-Correlation-ID",
    "SF-Centralized-Error-Handling",
    "SF-Security-Headers",
    "SF-Request-Validation",
  ],
  test: [
    "SF-Common-Logging",
    "SF-Correlation-ID",
    "SF-Centralized-Error-Handling",
    "SF-Security-Headers",
  ],
  stage: [
    "SF-Common-Logging",
    "SF-Correlation-ID",
    "SF-Security-Headers",
  ],
  prod: [
    "SF-Common-Logging",
    "SF-Correlation-ID",
    "SF-Centralized-Error-Handling",
  ],
};

const initialConfig: PolicyConfig = {
  quota: {
    enabled: false,
    policyName: "Quota-Default",
    displayName: "Quota Policy",
    limit: 1000,
    timeUnit: "day",
    identifier: "Developer App",
  },
  spikeArrest: {
    enabled: false,
    policyName: "SpikeArrest-Default",
    displayName: "Spike Arrest Policy",
    rate: 100,
    timeUnit: "pm",
  },
  jsonThreatProtection: {
    enabled: false,
    policyName: "JSON-Threat-Protection",
    displayName: "JSON Threat Protection",
    maxDepth: 10,
    maxEntries: 100,
    maxStringLength: 5000,
  },
  cors: {
    enabled: false,
    policyName: "CORS-Policy",
    displayName: "CORS Policy",
    origins: "https://example.com",
    methods: "GET, POST, PUT, DELETE, OPTIONS",
    headers: "Content-Type, Authorization, x-api-key",
  },
  sharedFlows: [],
  sharedFlowMode: "existing",
  newSharedFlow: {
    name: "",
    displayName: "",
    bundleFileName: "",
  },
};

const escapeXml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// The FlowCallout policy deliberately uses the Shared Flow name so the
// generated bundle is easy to recognize in Apigee.
const toCalloutPolicyName = (flowName: string) => flowName;

function buildEndpointXml(config: PolicyConfig): string {
  const policySteps = [
    config.quota.enabled && config.quota.policyName,
    config.spikeArrest.enabled && config.spikeArrest.policyName,
    config.jsonThreatProtection.enabled && config.jsonThreatProtection.policyName,
    config.cors.enabled && config.cors.policyName,
  ].filter(Boolean) as string[];

  const stepsAt = (placement: SharedFlowPlacement) =>
    config.sharedFlows
      .filter((flow) => flow.placement === placement)
      .map((flow) => flow.calloutPolicyName);

  const stepXml = (steps: string[], indent: string) =>
    steps.map((name) => `${indent}<Step><Name>${escapeXml(name)}</Name></Step>`).join("\n");

  const directionXml = (
    label: string,
    direction: "Request" | "Response",
    steps: string[]
  ) => [
    `    <!-- ${label} -->`,
    `    <${direction}>`,
    steps.length
      ? stepXml(steps, "      ")
      : "      <!-- No steps configured -->",
    `    </${direction}>`,
  ].join("\n");

  const endpointXml = (
    endpoint: "ProxyEndpoint" | "TargetEndpoint",
    requestPre: string[],
    requestPost: string[],
    responsePre: string[],
    responsePost: string[]
  ) => [
    `<${endpoint} name="default">`,
    "  <PreFlow name=\"PreFlow\">",
    directionXml("Request PreFlow", "Request", requestPre),
    directionXml("Response PreFlow", "Response", responsePre),
    "  </PreFlow>",
    "  <PostFlow name=\"PostFlow\">",
    directionXml("Request PostFlow", "Request", requestPost),
    directionXml("Response PostFlow", "Response", responsePost),
    "  </PostFlow>",
    ...(endpoint === "ProxyEndpoint"
      ? [
          "  <HTTPProxyConnection>",
          "    <BasePath>/api</BasePath>",
          "  </HTTPProxyConnection>",
          "  <RouteRule name=\"default\">",
          "    <TargetEndpoint>default</TargetEndpoint>",
          "  </RouteRule>",
        ]
      : []),
    `</${endpoint}>`,
  ].join("\n");

  const proxyXml = endpointXml(
    "ProxyEndpoint",
    [...policySteps, ...stepsAt("Proxy Endpoint Request PreFlow")],
    stepsAt("Proxy Endpoint Request PostFlow"),
    stepsAt("Proxy Endpoint Response PreFlow"),
    stepsAt("Proxy Endpoint Response PostFlow")
  );
  const targetXml = endpointXml(
    "TargetEndpoint",
    stepsAt("Target Endpoint Request PreFlow"),
    stepsAt("Target Endpoint Request PostFlow"),
    stepsAt("Target Endpoint Response PreFlow"),
    stepsAt("Target Endpoint Response PostFlow")
  );
  const postClient = stepsAt("PostClientFlow");

  return [
    proxyXml,
    "",
    targetXml,
    "",
    "<!-- ProxyEndpoint PostClientFlow -->",
    "<PostClientFlow>",
    "  <Response>",
    postClient.length
      ? stepXml(postClient, "    ")
      : "    <!-- No steps configured -->",
    "  </Response>",
    "</PostClientFlow>",
    ...(config.sharedFlows.length
      ? [
          "",
          "<!-- Generated FlowCallout policies -->",
          ...config.sharedFlows.flatMap((flow) => [
            `<FlowCallout name="${escapeXml(flow.calloutPolicyName)}">`,
            `  <DisplayName>${escapeXml(flow.name)}</DisplayName>`,
            `  <SharedFlowBundle>${escapeXml(flow.name)}</SharedFlowBundle>`,
            "</FlowCallout>",
            "",
          ]),
        ]
      : []),
  ].join("\n");
}

export default function PolicyBuilder({
  environment,
  sharedFlowsByEnvironment,
  onChange,
  onEditingChange,
  needsSaveAttention = false,
}: PolicyBuilderProps) {
  const [config, setConfig] =
    useState<PolicyConfig>(initialConfig);

  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedExistingFlow, setSelectedExistingFlow] =
    useState("");
  const [selectedFlowPlacement, setSelectedFlowPlacement] =
    useState<SharedFlowPlacement>("Proxy Endpoint Request PreFlow");
  const [isFlowMenuOpen, setIsFlowMenuOpen] = useState(false);
  const [isPlacementMenuOpen, setIsPlacementMenuOpen] = useState(false);
  const [isEditingPolicies, setIsEditingPolicies] = useState(false);
  const [isEditingNewSharedFlow, setIsEditingNewSharedFlow] = useState(false);
  const sharedFlowSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    onChange(config);
  }, [config, onChange]);

  useEffect(() => {
    onEditingChange?.(isEditingPolicies || isEditingNewSharedFlow);
  }, [isEditingNewSharedFlow, isEditingPolicies, onEditingChange]);

  useEffect(() => {
    if (!isFlowMenuOpen && !isPlacementMenuOpen) return;

    const closeMenus = (event: MouseEvent) => {
      if (!sharedFlowSectionRef.current?.contains(event.target as Node)) {
        setIsFlowMenuOpen(false);
        setIsPlacementMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFlowMenuOpen(false);
        setIsPlacementMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFlowMenuOpen, isPlacementMenuOpen]);

  const availableSharedFlows =
    sharedFlowsByEnvironment?.[environment.toLowerCase()] ??
    defaultSharedFlows[environment.toLowerCase()] ??
    [];

  function chooseExistingSharedFlow(flow: string) {
    setSelectedExistingFlow(flow);
    setIsFlowMenuOpen(false);
  }

  function chooseFlowPlacement(placement: SharedFlowPlacement) {
    setSelectedFlowPlacement(placement);
    setIsPlacementMenuOpen(false);
  }

  function updatePolicy(
    policy:
      | "quota"
      | "spikeArrest"
      | "jsonThreatProtection"
      | "cors",
    field: string,
    value: string | number | boolean
  ) {
    setConfig((current) => {
      const updated = { ...current };

      (updated[policy] as any) = {
        ...updated[policy],
        [field]: value,
      };

      return updated;
    });
  }

  function togglePolicy(
    policy:
      | "quota"
      | "spikeArrest"
      | "jsonThreatProtection"
      | "cors"
  ) {
    const enabled = !config[policy].enabled;

    updatePolicy(policy, "enabled", enabled);

    setExpanded((current) =>
      enabled
        ? [...current.filter((item) => item !== policy), policy]
        : current.filter((item) => item !== policy)
    );
  }

  function toggleExpanded(policy: string) {
    setExpanded((current) =>
      current.includes(policy)
        ? current.filter((item) => item !== policy)
        : [...current, policy]
    );
  }

  function addExistingSharedFlow() {
    if (!selectedExistingFlow) return;

    setConfig((current) => ({
      ...current,
      sharedFlows: current.sharedFlows.some(
        (flow) =>
          flow.name === selectedExistingFlow &&
          flow.placement === selectedFlowPlacement
      )
        ? current.sharedFlows
        : [
            ...current.sharedFlows,
            {
              name: selectedExistingFlow,
              placement: selectedFlowPlacement,
              calloutPolicyName: toCalloutPolicyName(
                selectedExistingFlow
              ),
            },
          ],
    }));

    setSelectedExistingFlow("");
  }

  function removeSharedFlow(flowToRemove: SharedFlowSelection) {
    setConfig((current) => ({
      ...current,
      sharedFlows: current.sharedFlows.filter(
        (flow) =>
          flow.name !== flowToRemove.name ||
          flow.placement !== flowToRemove.placement
      ),
    }));
  }

  function updateNewSharedFlow(
    field: "name" | "displayName" | "bundleFileName",
    value: string
  ) {
    setConfig((current) => ({
      ...current,
      newSharedFlow: {
        ...current.newSharedFlow,
        [field]: value,
      },
    }));
  }

  function addNewSharedFlow() {
    const flowName = config.newSharedFlow.name.trim();

    if (
      !flowName ||
      !config.newSharedFlow.bundleFileName
    ) {
      return;
    }

    setConfig((current) => ({
      ...current,
      sharedFlows: current.sharedFlows.some(
        (flow) =>
          flow.name === flowName &&
          flow.placement === selectedFlowPlacement
      )
        ? current.sharedFlows
        : [
            ...current.sharedFlows,
            {
              name: flowName,
              placement: selectedFlowPlacement,
              calloutPolicyName: toCalloutPolicyName(
                flowName
              ),
            },
          ],
    }));
  }

  const policyRows = [
    {
      key: "quota",
      title: "Quota",
      description: "Limit requests over a defined period.",
    },
    {
      key: "spikeArrest",
      title: "Spike Arrest",
      description:
        "Protect the backend from sudden traffic bursts.",
    },
    {
      key: "jsonThreatProtection",
      title: "JSON Threat Protection",
      description: "Set limits on incoming JSON payloads.",
    },
    {
      key: "cors",
      title: "CORS",
      description:
        "Configure browser-based cross-origin access.",
    },
  ] as const;

  const selectedCount = policyRows.filter(
    (row) => config[row.key].enabled
  ).length;
  const endpointXml = buildEndpointXml(config);

  return (
    <div className="policy-builder compact-policy-builder" id="policies-editor">
      <div className="policy-builder-heading">
        <div>
          <h2>Step 5: Policies & Shared Flows</h2>
          <p>
            Select a policy to add it. Its Apigee policy name,
            display name and configuration will appear below.
          </p>
        </div>

        <div className="environment-indicator">
          Environment:{" "}
          <strong>{environment || "Not selected"}</strong>
        </div>
      </div>

      {(isEditingPolicies || isEditingNewSharedFlow) && needsSaveAttention && (
        <p className="edit-required-message">Save your policy or Shared Flow changes before continuing.</p>
      )}

      <div className="policy-workspace">
      <div className="policy-editor">
      <section className="compact-policy-section">
        <div className="compact-section-title">
          <div>
            <h3>Available Policies</h3>
            <p>{selectedCount} policies selected</p>
          </div>
          <button
            type="button"
            className="edit-button"
            onClick={() => setIsEditingPolicies((editing) => !editing)}
          >
            {isEditingPolicies ? "Save" : "Edit"}
          </button>
        </div>

        <fieldset className="policy-edit-fields" disabled={!isEditingPolicies}>
        <div className="compact-policy-grid">
          {policyRows.map((row) => {
          const policy = config[row.key];
          const isExpanded = expanded.includes(row.key);

          return (
            <div
              className={`compact-policy-row ${
                policy.enabled ? "is-selected" : ""
              }`}
              key={row.key}
            >
              <div className="compact-policy-summary">
                <label className="compact-policy-check">
                  <input
                    type="checkbox"
                    checked={policy.enabled}
                    onChange={() => togglePolicy(row.key)}
                  />

                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.description}</small>
                  </span>
                </label>

                {policy.enabled && (
                  <button
                    type="button"
                    className="compact-policy-toggle"
                    onClick={() => toggleExpanded(row.key)}
                    aria-label={
                      isExpanded
                        ? `Collapse ${row.title} configuration`
                        : `Expand ${row.title} configuration`
                    }
                    title={
                      isExpanded
                        ? "Collapse configuration"
                        : "Expand configuration"
                    }
                  >
                    <span
                      className={`dropdown-caret policy-toggle-caret ${
                        isExpanded ? "is-open" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>

              {policy.enabled && isExpanded && (
                <div className="compact-policy-config">
                  <div className="compact-policy-identity">
                    <label>
                      Policy name
                      <input
                        value={policy.policyName}
                        onChange={(event) =>
                          updatePolicy(
                            row.key,
                            "policyName",
                            event.target.value
                          )
                        }
                        placeholder="Enter policy name"
                      />
                    </label>

                    <label>
                      Display name
                      <input
                        value={policy.displayName}
                        onChange={(event) =>
                          updatePolicy(
                            row.key,
                            "displayName",
                            event.target.value
                          )
                        }
                        placeholder="Enter display name"
                      />
                    </label>
                  </div>

                  {row.key === "quota" && (
                    <div className="compact-policy-fields">
                      <label>
                        Allowed request count
                        <input
                          type="number"
                          min="1"
                          value={config.quota.limit}
                          onChange={(event) =>
                            updatePolicy(
                              "quota",
                              "limit",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>

                      <label>
                        Time unit
                        <select
                          value={config.quota.timeUnit}
                          onChange={(event) =>
                            updatePolicy(
                              "quota",
                              "timeUnit",
                              event.target.value
                            )
                          }
                        >
                          <option value="minute">Minute</option>
                          <option value="hour">Hour</option>
                          <option value="day">Day</option>
                        </select>
                      </label>

                      <label>
                        Identifier
                        <select
                          value={config.quota.identifier}
                          onChange={(event) =>
                            updatePolicy(
                              "quota",
                              "identifier",
                              event.target.value
                            )
                          }
                        >
                          <option>Developer App</option>
                          <option>API Key</option>
                          <option>Client IP</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {row.key === "spikeArrest" && (
                    <div className="compact-policy-fields">
                      <label>
                        Request rate
                        <input
                          type="number"
                          min="1"
                          value={config.spikeArrest.rate}
                          onChange={(event) =>
                            updatePolicy(
                              "spikeArrest",
                              "rate",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>

                      <label>
                        Rate period
                        <select
                          value={config.spikeArrest.timeUnit}
                          onChange={(event) =>
                            updatePolicy(
                              "spikeArrest",
                              "timeUnit",
                              event.target.value
                            )
                          }
                        >
                          <option value="ps">
                            Per second (ps)
                          </option>
                          <option value="pm">
                            Per minute (pm)
                          </option>
                        </select>
                      </label>
                    </div>
                  )}

                  {row.key === "jsonThreatProtection" && (
                    <div className="compact-policy-fields">
                      <label>
                        Maximum nesting depth
                        <input
                          type="number"
                          min="1"
                          value={
                            config.jsonThreatProtection.maxDepth
                          }
                          onChange={(event) =>
                            updatePolicy(
                              "jsonThreatProtection",
                              "maxDepth",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>

                      <label>
                        Maximum object entries
                        <input
                          type="number"
                          min="1"
                          value={
                            config.jsonThreatProtection.maxEntries
                          }
                          onChange={(event) =>
                            updatePolicy(
                              "jsonThreatProtection",
                              "maxEntries",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>

                      <label>
                        Maximum string length
                        <input
                          type="number"
                          min="1"
                          value={
                            config.jsonThreatProtection
                              .maxStringLength
                          }
                          onChange={(event) =>
                            updatePolicy(
                              "jsonThreatProtection",
                              "maxStringLength",
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                    </div>
                  )}

                  {row.key === "cors" && (
                    <div className="compact-policy-fields compact-policy-fields-one">
                      <label>
                        Allowed origins
                        <input
                          value={config.cors.origins}
                          onChange={(event) =>
                            updatePolicy(
                              "cors",
                              "origins",
                              event.target.value
                            )
                          }
                          placeholder="https://app.example.com"
                        />
                      </label>

                      <label>
                        Allowed methods
                        <input
                          value={config.cors.methods}
                          onChange={(event) =>
                            updatePolicy(
                              "cors",
                              "methods",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        Allowed headers
                        <input
                          value={config.cors.headers}
                          onChange={(event) =>
                            updatePolicy(
                              "cors",
                              "headers",
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })}
        </div>
        </fieldset>
      </section>

      <section className="compact-policy-section shared-flow-section" ref={sharedFlowSectionRef}>
        <div className="compact-section-title">
          <div>
            <h3>Shared Flows</h3>
            <p>
              Create a Shared Flow or reuse one already
              available in{" "}
              <strong>
                {environment || "the selected environment"}
              </strong>.
            </p>
          </div>

          <span>{config.sharedFlows.length} selected</span>
        </div>

        <div className="shared-flow-mode">
          <button
            type="button"
            className={
              config.sharedFlowMode === "existing"
                ? "active"
                : ""
            }
            onClick={() =>
              setConfig((current) => ({
                ...current,
                sharedFlowMode: "existing",
              }))
            }
          >
            Choose Existing
          </button>

          <button
            type="button"
            className={
              config.sharedFlowMode === "new" ? "active" : ""
            }
            onClick={() =>
              setConfig((current) => ({
                ...current,
                sharedFlowMode: "new",
              }))
            }
          >
            Create New
          </button>
        </div>

        <div className="shared-flow-placement">
          <span>Add to API flow</span>
          <div className="shared-flow-placement-picker">
            <button
              type="button"
              className="shared-flow-combobox"
              aria-expanded={isPlacementMenuOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setIsPlacementMenuOpen((open) => !open);
                setIsFlowMenuOpen(false);
              }}
            >
              <span>{selectedFlowPlacement}</span>
              <span className="dropdown-caret" aria-hidden="true" />
            </button>

            {isPlacementMenuOpen && (
              <div className="shared-flow-menu placement-menu" role="listbox">
                <div className="shared-flow-options">
                  {sharedFlowPlacements.map((placement) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedFlowPlacement === placement}
                      key={placement}
                      onClick={() => chooseFlowPlacement(placement)}
                    >
                      {placement}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {config.sharedFlowMode === "existing" ? (
          <div className="shared-flow-existing">
            <label className="shared-flow-select-label">
              Shared Flow in {environment}
              <div className="shared-flow-select-row shared-flow-picker">
                <button
                  type="button"
                  className="shared-flow-combobox"
                  aria-expanded={isFlowMenuOpen}
                  aria-haspopup="listbox"
                  onClick={() => {
                    setIsFlowMenuOpen((open) => !open);
                    setIsPlacementMenuOpen(false);
                  }}
                >
                  <span>{selectedExistingFlow || "Select a Shared Flow"}</span>
                  <span className="dropdown-caret" aria-hidden="true" />
                </button>

                {isFlowMenuOpen && (
                  <div className="shared-flow-menu" role="listbox">
                    <div className="shared-flow-options">
                      {availableSharedFlows.map((flow) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedExistingFlow === flow}
                          key={flow}
                          onClick={() => chooseExistingSharedFlow(flow)}
                        >
                          {flow}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="compact-config-button"
                  disabled={!selectedExistingFlow}
                  onClick={addExistingSharedFlow}
                >
                  Add Shared Flow
                </button>
              </div>
            </label>

            {availableSharedFlows.length === 0 && (
              <p className="policy-help">
                No sample Shared Flows are configured for this
                environment. The live portal will load this
                list from Apigee.
              </p>
            )}
          </div>
        ) : (
          <div className="shared-flow-create">
            <div className="section-title-row">
              <h4>New Shared Flow</h4>
              <button
                type="button"
                className="edit-button"
                onClick={() => setIsEditingNewSharedFlow((editing) => !editing)}
              >
                {isEditingNewSharedFlow ? "Save" : "Edit"}
              </button>
            </div>
            <fieldset className="policy-edit-fields" disabled={!isEditingNewSharedFlow}>
              <div className="compact-policy-identity">
              <label>
                Shared Flow name *
                <input
                  value={config.newSharedFlow.name}
                  onChange={(event) =>
                    updateNewSharedFlow(
                      "name",
                      event.target.value
                    )
                  }
                  placeholder="SF-My-Shared-Flow"
                />
              </label>

              <label>
                Display name
                <input
                  value={config.newSharedFlow.displayName}
                  onChange={(event) =>
                    updateNewSharedFlow(
                      "displayName",
                      event.target.value
                    )
                  }
                  placeholder="My Shared Flow"
                />
              </label>
            </div>

            <label className="shared-flow-upload">
              Shared Flow bundle ZIP *
              <input
                type="file"
                accept=".zip"
                onChange={(event) =>
                  updateNewSharedFlow(
                    "bundleFileName",
                    event.target.files?.[0]?.name ?? ""
                  )
                }
              />

              <small>
                Select the ZIP bundle containing the Apigee
                Shared Flow definition.
              </small>
            </label>

            <button
              type="button"
              className="compact-config-button"
              disabled={
                !config.newSharedFlow.name.trim() ||
                !config.newSharedFlow.bundleFileName
              }
              onClick={addNewSharedFlow}
            >
              Add New Shared Flow to Request
            </button>
            </fieldset>
          </div>
        )}

        {config.sharedFlows.length > 0 && (
          <div className="selected-shared-flows">
            <strong>
              Shared Flows included in this API request
            </strong>

            {config.sharedFlows.map((flow) => (
              <div
                className="selected-shared-flow"
                key={`${flow.name}-${flow.placement}`}
              >
                <span>
                  <strong>{flow.name}</strong>
                  <small>{flow.placement}</small>
                  <small>FlowCallout: {flow.calloutPolicyName}</small>
                </span>

                <button
                  type="button"
                  onClick={() => removeSharedFlow(flow)}
                  aria-label={`Remove ${flow.name} from ${flow.placement}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="policy-help">
          Existing Shared Flows must be deployed in the
          selected environment. New Shared Flows require a
          valid ZIP bundle and will be provisioned separately
          from the API proxy.
        </p>

        <p className="policy-help">
          Prototype note: the dropdown currently uses sample
          environment data. Once the backend is connected, it
          will retrieve the actual Shared Flow list from the
          selected Apigee environment.
        </p>
      </section>
      </div>

      <aside className="policy-xml-preview" aria-label="Generated Apigee endpoint XML">
        <div className="policy-xml-heading">
          <div>
            <h3>Generated Endpoint XML</h3>
            <p>Policy execution order in the Proxy and Target endpoints.</p>
          </div>
          <em>{selectedCount} selected</em>
        </div>
        <pre><code>{endpointXml}</code></pre>
      </aside>
      </div>
    </div>
  );
}
