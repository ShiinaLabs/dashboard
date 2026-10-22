export type DomainId =
  | "overview"
  | "social"
  | "developer"
  | "business"
  | "ai"
  | "connections"
  | "utility";

export type SurfaceId =
  | "overview"
  | "x"
  | "reddit"
  | "github"
  | "gitlab"
  | "analytics"
  | "app-store"
  | "revenue"
  | "ai"
  | "accounts"
  | "settings"
  | "admin";

export type WorkspaceKind = "account" | "site" | "none";

export interface NavSurface {
  id: SurfaceId;
  labelKey: string;
  /** Canonical landing route for this surface. */
  to: string;
  /** Path prefixes owned by this surface. Longest match wins. */
  match: readonly string[];
  kind: WorkspaceKind;
  platform?: "twitter" | "github" | "gitlab" | "reddit";
}

export interface NavDomain {
  id: DomainId;
  labelKey: string;
  to: string;
  match: readonly string[];
  surfaces: readonly NavSurface[];
  placement: "primary" | "utility";
}

export const NAV_DOMAINS: readonly NavDomain[] = [
  {
    id: "overview",
    labelKey: "nav.overview",
    to: "/overview",
    match: ["/overview", "/"],
    placement: "primary",
    surfaces: [
      { id: "overview", labelKey: "nav.overview", to: "/overview", match: ["/overview", "/"], kind: "none" },
    ],
  },
  {
    id: "social",
    labelKey: "nav.social",
    to: "/x",
    match: ["/x", "/reddit"],
    placement: "primary",
    surfaces: [
      { id: "x", labelKey: "nav.x", to: "/x", match: ["/x"], kind: "account", platform: "twitter" },
      { id: "reddit", labelKey: "nav.reddit", to: "/reddit", match: ["/reddit"], kind: "account", platform: "reddit" },
    ],
  },
  {
    id: "developer",
    labelKey: "nav.developer",
    to: "/github",
    match: ["/github", "/gitlab"],
    placement: "primary",
    surfaces: [
      { id: "github", labelKey: "nav.github", to: "/github", match: ["/github"], kind: "account", platform: "github" },
      { id: "gitlab", labelKey: "nav.gitlab", to: "/gitlab", match: ["/gitlab"], kind: "account", platform: "gitlab" },
    ],
  },
  {
    id: "business",
    labelKey: "nav.business",
    to: "/analytics",
    match: ["/analytics", "/app-store", "/revenue"],
    placement: "primary",
    surfaces: [
      { id: "analytics", labelKey: "nav.analytics", to: "/analytics", match: ["/analytics"], kind: "site" },
      { id: "app-store", labelKey: "nav.appStoreAnalytics", to: "/app-store", match: ["/app-store"], kind: "none" },
      { id: "revenue", labelKey: "nav.revenue", to: "/revenue", match: ["/revenue"], kind: "none" },
    ],
  },
  {
    id: "ai",
    labelKey: "nav.ai",
    to: "/ai",
    match: ["/ai"],
    placement: "primary",
    surfaces: [
      { id: "ai", labelKey: "nav.ai", to: "/ai", match: ["/ai"], kind: "none" },
    ],
  },
  {
    id: "connections",
    labelKey: "nav.connections",
    to: "/accounts",
    match: ["/accounts"],
    placement: "utility",
    surfaces: [
      { id: "accounts", labelKey: "nav.connections", to: "/accounts", match: ["/accounts"], kind: "none" },
    ],
  },
  {
    id: "utility",
    labelKey: "nav.settings",
    to: "/settings",
    match: ["/settings", "/admin"],
    placement: "utility",
    surfaces: [
      { id: "settings", labelKey: "nav.settings", to: "/settings", match: ["/settings"], kind: "none" },
      { id: "admin", labelKey: "nav.admin", to: "/admin", match: ["/admin"], kind: "none" },
    ],
  },
];

export function matchPath(pathname: string, base: string): boolean {
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export interface ResolvedWorkspace {
  domain: NavDomain;
  surface: NavSurface;
  /** The matched prefix, useful for breadcrumbs and debugging. */
  match: string;
}

/**
 * Resolve the current route to a domain + surface.
 * Longest prefix wins so `/app-store` cannot be captured by `/app`.
 */
export function resolveWorkspace(pathname: string): ResolvedWorkspace | null {
  let best: ResolvedWorkspace | null = null;
  for (const domain of NAV_DOMAINS) {
    for (const surface of domain.surfaces) {
      for (const base of surface.match) {
        if (!matchPath(pathname, base)) continue;
        if (!best || base.length > best.match.length) {
          best = { domain, surface, match: base };
        }
      }
    }
  }
  return best;
}

export function findDomain(id: DomainId): NavDomain | undefined {
  return NAV_DOMAINS.find((domain) => domain.id === id);
}
