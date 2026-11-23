import { pool, schemaReady } from "./db";
import type { ProvisioningRequest } from "./types";

// PostgreSQL-backed store. Each request is saved as one JSONB document;
// the indexed columns are duplicated out for listing and lookups.

export async function nextRequestId(): Promise<string> {
  await schemaReady;
  const { rows } = await pool.query<{ n: string }>(
    "SELECT nextval('provisioning_request_seq') AS n"
  );
  return `REQ-${rows[0].n}`;
}

export const store = {
  async save(request: ProvisioningRequest): Promise<ProvisioningRequest> {
    await schemaReady;
    request.updatedAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO provisioning_requests
         (id, api_name, environment, status, created_at, updated_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         status     = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         data       = EXCLUDED.data`,
      [
        request.id,
        request.apiName,
        request.environment,
        request.status,
        request.createdAt,
        request.updatedAt,
        JSON.stringify(request),
      ]
    );
    return request;
  },

  async get(id: string): Promise<ProvisioningRequest | undefined> {
    await schemaReady;
    const { rows } = await pool.query<{ data: ProvisioningRequest }>(
      "SELECT data FROM provisioning_requests WHERE id = $1",
      [id]
    );
    return rows[0]?.data;
  },

  async list(): Promise<ProvisioningRequest[]> {
    await schemaReady;
    const { rows } = await pool.query<{ data: ProvisioningRequest }>(
      "SELECT data FROM provisioning_requests ORDER BY created_at DESC"
    );
    return rows.map((row) => row.data);
  },
};
