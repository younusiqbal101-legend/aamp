import type { ProvisioningRequest } from "./types";

export const stamp = () => new Date().toISOString().slice(11, 19);

export function logLine(request: ProvisioningRequest, message: string): void {
  request.logs.push(`[${stamp()}] ${message}`);
}
