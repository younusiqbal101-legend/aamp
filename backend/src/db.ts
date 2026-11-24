import "./env"; // must load .env before DATABASE_URL is read
import { Pool } from "pg";

// PostgreSQL is optional. If DATABASE_URL is empty or still the placeholder,
// the backend uses an in-memory store instead (requests are lost on restart).
const connectionString = (process.env.DATABASE_URL ?? "").trim();
export const usePostgres =
  connectionString !== "" && !connectionString.includes("CHANGE-ME");

export const pool: Pool | null = usePostgres
  ? new Pool({ connectionString })
  : null;

async function createSchema(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS provisioning_requests (
      id          TEXT PRIMARY KEY,
      api_name    TEXT NOT NULL,
      environment TEXT NOT NULL,
      status      TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL,
      data        JSONB NOT NULL
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS provisioning_requests_created_at_idx
      ON provisioning_requests (created_at DESC)
  `);
  // First ID is REQ-1048, matching the previous in-memory counter.
  await db.query(
    `CREATE SEQUENCE IF NOT EXISTS provisioning_request_seq START WITH 1048`
  );
}

/** Creates the table and ID sequence on first use. Idempotent. Resolves immediately without PostgreSQL. */
export const schemaReady: Promise<void> = pool
  ? createSchema(pool)
  : Promise.resolve();
