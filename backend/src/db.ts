import "./env"; // must load .env before DATABASE_URL is read
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to backend/.env (see .env.example)."
  );
}

export const pool = new Pool({ connectionString });

/** Creates the table and ID sequence on first use. Idempotent. */
export const schemaReady: Promise<void> = (async () => {
  await pool.query(`
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS provisioning_requests_created_at_idx
      ON provisioning_requests (created_at DESC)
  `);
  // First ID is REQ-1048, matching the previous in-memory counter.
  await pool.query(
    `CREATE SEQUENCE IF NOT EXISTS provisioning_request_seq START WITH 1048`
  );
})();
