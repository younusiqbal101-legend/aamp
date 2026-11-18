import type { ProvisioningRequest } from "./types";

// In-memory store. Swap for PostgreSQL later without touching the routes.
const requests = new Map<string, ProvisioningRequest>();
let counter = 1047;

export function nextRequestId(): string {
  counter += 1;
  return `REQ-${counter}`;
}

export const store = {
  save(request: ProvisioningRequest) {
    request.updatedAt = new Date().toISOString();
    requests.set(request.id, request);
    return request;
  },
  get(id: string) {
    return requests.get(id);
  },
  list() {
    return [...requests.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  },
};
