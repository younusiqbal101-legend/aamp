import { GoogleAuth } from "google-auth-library";
import type { ApigeeConfig } from "./config";

export class ApigeeError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface CallOptions {
  query?: Record<string, string>;
  json?: unknown;
  form?: FormData;
  /** Non-2xx statuses that are returned instead of thrown (e.g. 404 for "does it exist?"). */
  allow?: number[];
}

export interface CallResult<T = any> {
  status: number;
  data: T;
}

/** Encode one URL path segment (names, e-mail addresses). */
export const enc = encodeURIComponent;

export class ApigeeClient {
  private auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  private cfg: ApigeeConfig;

  constructor(cfg: ApigeeConfig) {
    this.cfg = cfg;
  }

  private async token(): Promise<string> {
    if (this.cfg.accessToken) return this.cfg.accessToken;
    try {
      const token = await this.auth.getAccessToken();
      if (token) return token;
    } catch {
      /* fall through to the helpful message */
    }
    throw new Error(
      "Could not get Google credentials. Set APIGEE_ACCESS_TOKEN (gcloud auth print-access-token) " +
        "or GOOGLE_APPLICATION_CREDENTIALS (service-account key file)."
    );
  }

  /** Path relative to /v1, e.g. `/organizations/my-org/apiproducts`. */
  async call<T = any>(
    method: string,
    path: string,
    options: CallOptions = {}
  ): Promise<CallResult<T>> {
    const url = new URL(this.cfg.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.token()}`,
    };
    let body: string | FormData | undefined;
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form; // fetch sets the multipart boundary itself
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "network error";
      throw new ApigeeError(`${method} ${path} failed: ${detail}`, 0);
    }

    const text = await response.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* keep raw text */
    }

    if (!response.ok && !(options.allow ?? []).includes(response.status)) {
      const message =
        (typeof data === "object" && data?.error?.message) ||
        (typeof data === "string" ? data : "") ||
        response.statusText;
      throw new ApigeeError(
        `${method} ${path} → ${response.status}: ${String(message).slice(0, 600)}`,
        response.status
      );
    }
    return { status: response.status, data };
  }
}
