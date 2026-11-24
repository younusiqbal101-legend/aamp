import { pool, schemaReady, usePostgres } from "./db";
import type { ProvisioningRequest } from "./types";

// Two backends with the same interface:
//  - PostgreSQL (when DATABASE_URL is set): each request is one JSONB document;
//    the indexed columns are duplicated out for listing and lookups.
//  - In-memory (when DATABASE_URL is empty or still CHANGE-ME): for developers
//    who can't install PostgreSQL. Everything is lost when the backend restarts.

const memory = new Map<string, ProvisioningRequest>();
let memorySequence = 1048; // same starting ID as the PostgreSQL sequence

export async function nextRequestId(): Promise<string> {
  if (!usePostgres) return `REQ-${memorySequence++}`;
  await schemaReady;
  const { rows } = await pool!.query<{ n: string }>(
    "SELECT nextval('provisioning_request_seq') AS n"
  );
  return `REQ-${rows[0].n}`;
}

export const store = {
  async save(request: ProvisioningRequest): Promise<ProvisioningRequest> {
    request.updatedAt = new Date().toISOString();
    if (!usePostgres) {
      memory.set(request.id, structuredClone(request));
      return request;
    }
    await schemaReady;
    await pool!.query(
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
    if (!usePostgres) {
      const found = memory.get(id);
      return found ? structuredClone(found) : undefined;
    }
    await schemaReady;
    const { rows } = await pool!.query<{ data: ProvisioningRequest }>(
      "SELECT data FROM provisioning_requests WHERE id = $1",
      [id]
    );
    return rows[0]?.data;
  },

  async list(): Promise<ProvisioningRequest[]> {
    if (!usePostgres) {
      return [...memory.values()]
        .map((request) => structuredClone(request))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    await schemaReady;
    const { rows } = await pool!.query<{ data: ProvisioningRequest }>(
      "SELECT data FROM provisioning_requests ORDER BY created_at DESC"
    );
    return rows.map((row) => row.data);
  },
};
