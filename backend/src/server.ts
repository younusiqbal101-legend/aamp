import { envFile, envFileFound } from "./env"; // must come first: loads .env before ./app reads it
import app from "./app";
import { providerInfo } from "./provisioning";

const PORT = Number(process.env.PORT) || 5000;

/** If something already answers on this port, a second server would start silently and never get requests. */
async function alreadyRunning(): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    const body: any = await response.json();
    return body?.mode ? String(body.mode) : "unknown";
  } catch {
    return null;
  }
}

async function main() {
  const other = await alreadyRunning();
  if (other) {
    console.error(
      `\n✖ Another backend is ALREADY running on port ${PORT} (mode: ${other}).\n` +
        `  It would keep answering requests with its old settings.\n` +
        `  Stop it first (close the old terminal or press Ctrl+C in it), then start this again.\n` +
        `  Windows:  netstat -ano | findstr :${PORT}   then   taskkill /PID <number> /F\n`
    );
    process.exit(1);
  }

  const info = providerInfo();
  app.listen(PORT, () => {
    const mode = info.dryRun
      ? `APIGEE, org "${info.org}", DRY RUN (nothing is sent to Apigee)`
      : `APIGEE, org "${info.org}", LIVE (real changes will be made in Apigee)`;
    console.log(`\nBackend running on http://localhost:${PORT}`);
    console.log(`  .env file : ${envFile} ${envFileFound ? "(loaded)" : "(NOT FOUND - using defaults)"}`);
    console.log(`  Mode      : ${mode}\n`);
  });
}

void main();
