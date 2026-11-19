import { useEffect, useState } from "react";
import {
  api,
  type ProviderInfo,
  type ProvisioningOperation,
  type ProvisioningResult,
  type RequestStatus,
} from "./api";

type ProvisioningConsoleProps = {
  requestId: string;
  apiName: string;
  environment: string;
  onViewRequests: () => void;
  onCreateAnother: () => void;
};

const POLL_INTERVAL_MS = 1000;
const MAX_CONSECUTIVE_ERRORS = 5;

export default function ProvisioningConsole({
  requestId,
  apiName,
  environment,
  onViewRequests,
  onCreateAnother,
}: ProvisioningConsoleProps) {
  const [operations, setOperations] = useState<ProvisioningOperation[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<RequestStatus>("PROVISIONING");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<ProviderInfo | undefined>();
  const [result, setResult] = useState<ProvisioningResult>({});

  const isComplete = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const isFinished = isComplete || isFailed;

  const completedCount = operations.filter(
    (operation) => operation.status === "SUCCESS"
  ).length;

  const progress = operations.length
    ? Math.round((completedCount / operations.length) * 100)
    : 0;

  // Poll the backend for the real pipeline state until it finishes.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const request = await api.getRequest(requestId);
        if (cancelled) return;

        consecutiveErrors = 0;
        setError("");
        setOperations(request.operations);
        setLogs(request.logs);
        setStatus(request.status);
        setProvider(request.provider);
        setResult(request.result ?? {});

        if (request.status === "COMPLETED" || request.status === "FAILED") {
          return;
        }
      } catch (err) {
        if (cancelled) return;
        consecutiveErrors += 1;
        setError(
          err instanceof Error ? err.message : "Unable to load request status."
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [requestId]);

  return (
    <div className="provisioning-page">
      <div className="provisioning-header">
        <div>
          <div className="eyebrow">APIGEE DEVELOPER PORTAL</div>
          <h1>Provisioning Console</h1>
          <p>
            Track your API resources as they move through the
            provisioning pipeline.
          </p>
        </div>

        <span
          className={`pipeline-status ${
            isFinished ? "status-completed" : "status-running"
          }`}
        >
          <span className="status-dot" />
          {isComplete
            ? "PROVISIONING COMPLETED"
            : isFailed
              ? "PROVISIONING FAILED"
              : "PROVISIONING IN PROGRESS"}
        </span>
      </div>

      <div className="provisioning-summary">
        <div className="summary-item">
          <span>REQUEST ID</span>
          <strong>{requestId}</strong>
        </div>

        <div className="summary-item">
          <span>API NAME</span>
          <strong>{apiName}</strong>
        </div>

        <div className="summary-item">
          <span>ENVIRONMENT</span>
          <strong>{environment}</strong>
        </div>

        <div className="summary-item">
          <span>OPERATIONS</span>
          <strong>
            {completedCount} / {operations.length}
          </strong>
        </div>
      </div>

      <section className="pipeline-card">
        <div className="pipeline-card-header">
          <div>
            <h2>Provisioning Pipeline</h2>
            <p>
              Execution status of each provisioning operation
            </p>
          </div>

          <strong className="progress-number">{progress}%</strong>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="operation-list">
          {operations.map((operation, index) => (
            <div className="operation-row" key={operation.id}>
              <div
                className={`operation-indicator indicator-${operation.status.toLowerCase()}`}
              >
                {operation.status === "SUCCESS" && "✓"}

                {operation.status === "IN_PROGRESS" && (
                  <span className="loading-spinner" />
                )}

                {operation.status === "PENDING" && index + 1}

                {operation.status === "FAILED" && "✕"}
              </div>

              <div className="operation-details">
                <strong>{operation.name}</strong>
                <span>{operation.description}</span>
              </div>

              <div
                className={`operation-status status-${operation.status.toLowerCase()}`}
              >
                {operation.status === "IN_PROGRESS"
                  ? "CREATING"
                  : operation.status}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="execution-logs">
        <div className="logs-header">
          <div>
            <h2>Execution Logs</h2>
            <p>Live activity from the provisioning pipeline</p>
          </div>

          <span className="live-indicator">
            <span className="status-dot" />
            LIVE
          </span>
        </div>

        <div className="logs-terminal">
          <div className="terminal-title">
            <span />
            <span />
            <span />
            <strong>provisioning-console</strong>
          </div>

          <div className="terminal-content">
            {logs.map((log, index) => (
              <div className="log-line" key={`${index}-${log}`}>
                <span className="log-prompt">$</span>
                <span>{log}</span>
              </div>
            ))}

            {!isFinished && (
              <div className="log-line terminal-waiting">
                <span className="log-prompt">$</span>
                <span>Waiting for next operation...</span>
                <span className="terminal-cursor" />
              </div>
            )}
          </div>
        </div>
      </section>

      {isComplete && (
        <section className="acknowledgement-card">
          <div className="acknowledgement-icon">✓</div>

          <div>
            {provider?.mode === "apigee" && provider.dryRun ? (
              <>
                <h2>Dry run completed</h2>
                <p>
                  The proxy bundle for {apiName} was generated and
                  validated. Nothing was created or changed in Apigee.
                  {result.bundlePath && (
                    <>
                      {" "}Bundle saved at <code>{result.bundlePath}</code>.
                    </>
                  )}{" "}
                  Set <code>APIGEE_DRY_RUN=false</code> on the backend
                  to provision for real.
                </p>
              </>
            ) : provider?.mode === "apigee" ? (
              <>
                <h2>Deployed to Apigee</h2>
                <p>
                  {apiName} revision {result.revision} is deployed in{" "}
                  {environment}.
                </p>
                {result.consumerKey && (
                  <p>
                    API key (consumer key):{" "}
                    <code>{result.consumerKey}</code>
                  </p>
                )}
                {result.proxyUrl ? (
                  <p>
                    Test it:{" "}
                    <code>
                      curl -H "x-api-key: {result.consumerKey ?? "KEY"}" {result.proxyUrl}
                    </code>
                  </p>
                ) : (
                  <p>
                    Set <code>APIGEE_RUNTIME_HOST</code> on the backend to
                    see a ready-made test URL here.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </section>
      )}

      <div className="provisioning-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={onViewRequests}
        >
          View My Requests
        </button>

        <button
          type="button"
          className="primary-action"
          onClick={onCreateAnother}
        >
          Create Another API
        </button>
      </div>

      {error && (
        <p className="simulation-notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
