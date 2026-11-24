# aamp

Web-based developer portal for uploading, validating and onboarding OpenAPI specifications to Apigee X.

```
frontend/   React + Vite + TypeScript  (http://localhost:5173)
backend/    Express + TypeScript       (http://localhost:5000, proxied by Vite under /api)
samples/    Sample OpenAPI files for testing
```

## Database (PostgreSQL) – optional

**You can skip this section.** If `DATABASE_URL` in `backend/.env` is empty or still contains `CHANGE-ME` (the default in `.env.example`), the backend starts with an in-memory store. Requests work normally, but they are lost when the backend restarts, and the startup banner says `Storage : IN-MEMORY`.

To keep requests across restarts, set up PostgreSQL once per machine:

1. **Install PostgreSQL 18.** On Windows: `winget install PostgreSQL.PostgreSQL.18`, or use the installer from https://www.postgresql.org/download/. The installer asks for a password for the `postgres` user; keep it. The default port is `5432`.
2. **Create the database** `aamp`. In pgAdmin 4, right-click **Databases → Create → Database** and name it `aamp`. Or run `CREATE DATABASE aamp;` in psql.
3. **Set the connection string** in `backend/.env` (copy it from `.env.example` first):
   ```
   DATABASE_URL=postgres://postgres:YOUR-PASSWORD@localhost:5432/aamp
   ```
   Replace `YOUR-PASSWORD` with the password from step 1. If you chose a different port, change `5432`.
4. **Start the backend.** The `provisioning_requests` table and its ID sequence are created automatically on the first start.

Each developer runs their own database, so requests made on one machine don't appear on another.

**Common startup errors**

| Message | Fix |
| --- | --- |
| `DATABASE_URL is not set` | Add the `DATABASE_URL` line to `backend/.env` (step 3). |
| `ECONNREFUSED` / `connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL isn't running, or the port in `DATABASE_URL` is wrong. Check the `postgresql-x64-18` service in Windows Services. |
| `password authentication failed` | The password in `DATABASE_URL` doesn't match the one set at install. |
| `database "aamp" does not exist` | Create the database (step 2). |
| `permission denied for schema public` | The database user can't create the table. Use the `postgres` user, or grant it `CREATE` on the `public` schema. |

## Quick start

```bash
cd backend  && npm install && cp .env.example .env && npm run dev     # Windows: copy .env.example .env
cd frontend && npm install && npm run dev
```

Open http://localhost:5173, choose **Create API → New API (YAML)**, upload `samples/shipment-api.yaml`
and click through the six steps. The sidebar/top bar shows which mode the backend is in.

## Tests

```bash
cd backend && npm test          # Apigee provider tests

# Browser happy path: upload swagger -> every wizard step -> submit -> provisioning completes
# (backend and frontend must be running)
cd frontend && npx playwright install chromium   # once
npm run e2e                                      # HEADED=1 npm run e2e to watch it
```

## Provisioning to a real Apigee X organization

The backend uses the Apigee provider, configured through `backend/.env`:

| Setting | What happens on **Submit Request** |
| --- | --- |
| `APIGEE_DRY_RUN=true` | The proxy bundle is generated and validated and saved to `backend/bundles/*.zip`. **No resources are created or updated.** |
| `APIGEE_DRY_RUN=false` | Resources are created / updated in your Apigee organization (see below). |

### What the 9 steps do against Apigee

1. **Validate** – checks the request, generates the proxy bundle from the form + OpenAPI spec, confirms the org and environment are reachable.
2. **Import API Proxy** – uploads the bundle (new proxy, or a new revision of an existing one).
3. **API Product** – creates it, or adds the proxy and environment to an existing product.
4. **Developer** – creates it, or reuses an existing one.
5. **Developer App** – creates it (which generates the API key) or attaches the product to an existing app.
6. **Target Server** – creates it in the environment, or verifies an existing one.
7. **Shared Flows** – verifies every selected shared flow is *deployed* in the environment (the proxy cannot deploy otherwise).
8. **Deploy** – deploys the new revision (`override=true`, replacing the previously deployed revision).
9. **Verify** – polls until the deployment is `READY`; fails with Apigee's error message on `ERROR`.

The generated proxy has: Spike Arrest → Verify API Key → Quota → JSON Threat Protection (only the ones you enabled),
shared-flow callouts at the placement chosen in the UI, CORS (with OPTIONS pre-flight handling),
one conditional flow per OpenAPI operation, a 404 catch-all for everything else, and a route to the Target Server.

### Setup, step by step

1. **Prerequisites**: an Apigee X organization, an environment (e.g. `dev`) attached to an environment group, and a Google identity allowed to manage Apigee (for example the *Apigee API Admin* role, or a custom role with equivalent permissions).
2. **Credentials** (pick one; see `.env.example`):
   - `gcloud auth application-default login` — simplest for local work, nothing to put in `.env`.
   - `APIGEE_ACCESS_TOKEN=$(gcloud auth print-access-token)` — expires in about an hour.
   - A service-account key file via `GOOGLE_APPLICATION_CREDENTIALS`.
3. **Configure** `backend/.env`:
   ```
   PROVISIONING_MODE=apigee
   APIGEE_ORG=<your-gcp-project-id>
   APIGEE_DRY_RUN=true
   APIGEE_RUNTIME_HOST=<environment group hostname>   # optional, for the test URL
   ```
4. **Dry run first.** Restart the backend, submit a request, and confirm the top bar says `Apigee <org> · dry run`
   and the request completes. Open `backend/bundles/<api>-<REQ>.zip` and, if you like, import it manually in the
   Apigee console to see exactly what would be deployed.
5. **Go live**: set `APIGEE_DRY_RUN=false`, restart the backend, and submit again. The final card shows the
   revision, the API key and a ready-to-run `curl`.

### Environment names

The Environment dropdown shows the environments that really exist in your Apigee organization (for example an
evaluation org only has `eval`), read live from Apigee.
If you submit an environment that does not exist, step 1 fails and lists the available ones.

### Which mode is the backend really in?

When the backend starts it prints a banner:

```
Backend running on http://localhost:5000
  .env file : C:\...\aamp\backend\.env (loaded)
  Mode      : APIGEE, org "my-project", DRY RUN (nothing is sent to Apigee)
```

You can also open <http://localhost:5000/api/health> in a browser: `"mode"` is `"apigee"`.
If the UI cannot connect to the backend:

- `.env` must be named exactly `.env` (not `.env.txt`) and live in the `backend/` folder. The banner shows which file was loaded, or `NOT FOUND`.
- Another backend may still be running on port 5000. The new one now refuses to start and tells you; close the old terminal first.
- `npm run dev` restarts automatically when `.env` changes. If you started the server another way, restart it yourself.

### Current limits (real provisioning)

- **Only API Key authentication** is generated. Basic, OAuth 2.0 and JWT are rejected in step 1 with a clear message
  rather than deploying an unprotected proxy.
- Shared flows must already exist and be deployed in the environment; uploading a *new* shared-flow bundle is not implemented.
- Multiple CORS origins are supported (one policy per origin); a single `*` is fine too.
- The backend API itself has **no authentication yet**. Do not expose it beyond your machine/network until that is addressed.
- Requests are stored in **PostgreSQL** (table `provisioning_requests`, created automatically at startup) when `DATABASE_URL` is set in `backend/.env`. Without it, requests live in memory and are lost on restart.
- Names must follow Apigee rules (letters, digits, `.`, `_`, `-`).
