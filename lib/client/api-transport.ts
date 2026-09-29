/// <reference types="vite/client" />

const DEFAULT_API_BASE = "/api";

/** Normalize a configured API root without changing its origin or path. */
export function normalizeApiBase(baseUrl?: string): string {
  const value = baseUrl?.trim() || DEFAULT_API_BASE;
  const normalized = value.replace(/\/+$/, "");
  return normalized || DEFAULT_API_BASE;
}

/** Build an API URL from the configured API root and an endpoint path. */
export function apiUrl(path: string, configuredBase = import.meta.env.VITE_API_BASE_URL): string {
  const base = normalizeApiBase(configuredBase);
  const endpoint = path.replace(/^\/+/, "");
  return `${base}/${endpoint}`;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

let redirecting401 = false;

function redirectForUnauthorized(path: string, status: number): void {
  if (status !== 401 || typeof window === "undefined" || redirecting401) return;

  const endpoint = path.split("?", 1)[0];
  const onLogin = window.location.pathname === "/login";
  const isAuthCheck = endpoint.startsWith("/auth/");
  if (onLogin || isAuthCheck) return;

  redirecting401 = true;
  const from = window.location.pathname + window.location.search;
  const safeFrom = from.startsWith("/login") ? "/overview" : from;
  window.location.replace(`/login?from=${encodeURIComponent(safeFrom)}`);
}

export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" });
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  redirectForUnauthorized(path, response.status);
  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error || `API error: ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}
