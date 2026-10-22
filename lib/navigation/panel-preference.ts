export const NAV_PANEL_COOKIE = "nav_panel";
export const NAV_PANEL_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The context panel is open unless the user explicitly closed it.
 * Returns a value that can be rendered on the server, so the first paint
 * matches the client and the layout never jumps after hydration.
 */
export function parseNavPanelPreference(cookieHeader: string | null): boolean {
  if (!cookieHeader) return true;
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${NAV_PANEL_COOKIE}=`));
  if (!entry) return true;
  return entry.slice(NAV_PANEL_COOKIE.length + 1) !== "closed";
}

export function serializeNavPanelPreference(open: boolean): string {
  const value = open ? "open" : "closed";
  return `${NAV_PANEL_COOKIE}=${value}; Path=/; Max-Age=${NAV_PANEL_MAX_AGE}; SameSite=Lax`;
}
