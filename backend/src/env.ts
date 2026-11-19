// Loads backend/.env no matter which folder the server was started from.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export const envFile = path.resolve(__dirname, "..", ".env");
export const envFileFound = fs.existsSync(envFile);

dotenv.config({ path: envFile, quiet: true });
