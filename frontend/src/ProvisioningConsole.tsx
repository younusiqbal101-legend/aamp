
import { useEffect, useState } from "react";

type OperationStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS";

type ProvisioningOperation = {
  id: number;
  name: string;
  description: string;
  status: OperationStatus;
};

type ProvisioningConsoleProps = {
  requestId: string;
  apiName: string;
  environment: string;
  onViewRequests: () => void;
  onCreateAnother: () => void;
};

const initialOperations: ProvisioningOperation[] = [
  {
    id: 1,
    name: "Validate OpenAPI Specification",
    description: "Checking YAML structure and API definitions",
    status: "PENDING",
  },
  {
    id: 2,
    name: "Import API Proxy",
    description: "Importing the API proxy bundle into Apigee X",
    status: "PENDING",
  },
  {
    id: 3,
    name: "Create API Product",
    description: "Creating or associating the API Product",
    status: "PENDING",
  },
  {
    id: 4,
    name: "Register Developer",
    description: "Creating or reusing the selected Developer",
    status: "PENDING",
  },
  {
    id: 5,
    name: "Create Developer App",
    description: "Creating the application and associating the API Product",
    status: "PENDING",
  },
  {
    id: 6,
    name: "Configure Target Server",
    description: "Creating or reusing the environment Target Server",
    status: "PENDING",
  },
  {
    id: 7,
    name: "Configure Shared Flows",
    description: "Importing or associating the selected Shared Flows",
    status: "PENDING",
  },
  {
    id: 8,
    name: "Deploy API Proxy",
    description: "Deploying the imported proxy revision",
    status: "PENDING",
  },
  {
    id: 9,
    name: "Verify Deployment",
    description: "Checking the deployment result",
    status: "PENDING",
  },
];

function getTime() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ProvisioningConsole({
  requestId,
  apiName,
  environment,
  onViewRequests,
  onCreateAnother,
}: ProvisioningConsoleProps) {
  const [operations, setOperations] =
    useState<ProvisioningOperation[]>(initialOperations);

  const [logs, setLogs] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const completedCount = operations.filter(
    (operation) => operation.status === "SUCCESS"
  ).length;

  const progress = Math.round(
    (completedCount / operations.length) * 100
  );

  useEffect(() => {
    let currentIndex = 0;
    let intervalId: number | undefined;

    setIsComplete(false);
    setLogs([
      `[${getTime()}] Provisioning request accepted.`,
      `[${getTime()}] Starting API provisioning pipeline...`,
    ]);

    setOperations(
      initialOperations.map((operation, index) => ({
        ...operation,
        status: index === 0 ? "IN_PROGRESS" : "PENDING",
      }))
    );

    intervalId = window.setInterval(() => {
      if (currentIndex >= initialOperations.length) {
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
        return;
      }

      const completedOperation = initialOperations[currentIndex];

      setOperations((previous) =>
        previous.map((operation, index) => {
          if (index === currentIndex) {
            return { ...operation, status: "SUCCESS" };
          }

          if (index === currentIndex + 1) {
            return { ...operation, status: "IN_PROGRESS" };
          }

          return operation;
        })
      );

      setLogs((previous) => [
        ...previous,
        `[${getTime()}] SUCCESS: ${completedOperation.name}`,
      ]);

      currentIndex += 1;

      if (currentIndex === initialOperations.length) {
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }

        setIsComplete(true);

        setLogs((previous) => [
          ...previous,
          `[${getTime()}] Pipeline simulation completed.`,
          `[${getTime()}] All demo operations finished.`,
        ]);
      }
    }, 1800);

    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

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
            isComplete ? "status-completed" : "status-running"
          }`}
        >
          <span className="status-dot" />
          {isComplete
            ? "SIMULATION COMPLETED"
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

            {!isComplete && (
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
            <h2>Demo pipeline completed</h2>
            <p>
              The simulated provisioning sequence has finished.
              No Apigee resources were created or deployed by
              this demonstration.
            </p>
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

      <p className="simulation-notice">
        DEMO MODE · Progress and logs are simulated in the
        frontend. Actual provisioning will be connected to the
        backend and Apigee Management API in the next integration
        phase.
      </p>
    </div>
  );
}
