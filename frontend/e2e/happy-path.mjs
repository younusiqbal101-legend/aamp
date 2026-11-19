// UI happy path: upload swagger -> validate -> all wizard steps -> submit -> provisioning completes.
//
//   1. start the backend  (cd backend && npm run dev)
//   2. start the frontend (cd frontend && npm run dev)
//   3. cd frontend && npx playwright install chromium   # once
//   4. npm run e2e
//
// Env: APP_URL (default http://localhost:5173), SPEC (default ../samples/shipment-api.yaml),
//      HEADED=1 to watch it run, CHROME_PATH to use an existing Chrome/Chromium binary.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const SPEC = process.env.SPEC ?? path.resolve(here, "../../samples/shipment-api.yaml");

const problems = [];
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  executablePath: process.env.CHROME_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()} (${m.location().url})`));
page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));

const step = (n, msg) => console.log(`${n}. ${msg}`);
try {
  await page.goto(APP_URL);
  await page.getByText("Backend connected", { exact: false }).or(page.locator(".connection")).first().waitFor();
  step(1, `app loaded (${(await page.locator(".connection").innerText()).trim()})`);

  await page.locator("button.subnav").click();
  await page.setInputFiles("input[type=file]", SPEC);
  await page.getByText("Validate & Lint YAML").click();
  await page.getByText("validated by the backend").waitFor({ timeout: 10_000 });
  step(2, "spec uploaded and validated by the backend");

  for (let n = 2; n <= 5; n++) {
    await page.locator("button.primary", { hasText: "Next" }).click();
    await page.waitForTimeout(250);
    step(3, `step ${n}: ${await page.locator("h2:visible").first().innerText()}`);
  }
  await page.locator("button.primary", { hasText: "Next" }).click();
  await page.getByText("Review & Submit").first().waitFor();

  await page.getByRole("button", { name: /Submit Request/ }).click();
  await page.getByText("Provisioning Console").waitFor({ timeout: 10_000 });
  await page.getByText("PROVISIONING COMPLETED").waitFor({ timeout: 240_000 });
  const card = (await page.locator(".acknowledgement-card").innerText()).replace(/\s+/g, " ");
  step(4, `provisioning finished: ${card}`);

  await page.getByText("View My Requests").click();
  await page.locator("td", { hasText: "COMPLETED" }).first().waitFor();
  step(5, "request listed as COMPLETED in My Requests");
} catch (error) {
  problems.push(`test failed: ${error.message}`);
  await page.screenshot({ path: "e2e-failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

if (problems.length) {
  console.error("\nFAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("\nHAPPY PATH PASSED (no console or network errors)");
