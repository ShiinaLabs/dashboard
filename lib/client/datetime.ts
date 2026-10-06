import { isValidTimezone, TIMEZONE_COOKIE } from "../timezone";

const STORAGE_KEY = "timezone";
const TIMEZONE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
let observedBrowserTimezone: string | null = null;

function readStoredTimezone(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isValidTimezone(value) ? value : null;
  } catch {
    return null;
  }
}

function getBrowserTimezone(): string {
  try {
    const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(value) ? value : "UTC";
  } catch {
    return "UTC";
  }
}

function readTimezoneCookie(): string | null {
  try {
    const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${TIMEZONE_COOKIE}=`));
    if (!cookie) return null;
    const value = decodeURIComponent(cookie.slice(TIMEZONE_COOKIE.length + 1));
    return isValidTimezone(value) ? value : null;
  } catch {
    return null;
  }
}

function writeTimezoneCookie(timezone: string) {
  document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(timezone)}; Path=/; SameSite=Lax; Max-Age=${TIMEZONE_COOKIE_MAX_AGE}`;
}

export function getTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  const stored = readStoredTimezone();
  if (stored) return stored;
  const browser = getBrowserTimezone();
  if (observedBrowserTimezone !== null && observedBrowserTimezone !== browser) {
    observedBrowserTimezone = browser;
    writeTimezoneCookie(browser);
    return browser;
  }
  observedBrowserTimezone ??= browser;
  return readTimezoneCookie() ?? browser;
}

export function setTimezone(timezone: string) {
  if (typeof window === "undefined" || !isValidTimezone(timezone)) return;
  try {
    localStorage.setItem(STORAGE_KEY, timezone);
  } catch {
    // Keep the request cookie useful when browser storage is unavailable.
  }
  writeTimezoneCookie(timezone);
}

export function syncTimezoneCookie(): string {
  if (typeof window === "undefined") return "UTC";
  const storedTimezone = readStoredTimezone();
  const cookieTimezone = readTimezoneCookie();
  const timezone = storedTimezone ?? cookieTimezone ?? getBrowserTimezone();
  observedBrowserTimezone = getBrowserTimezone();
  if (cookieTimezone !== timezone) writeTimezoneCookie(timezone);
  return timezone;
}

export function formatDate(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleDateString(undefined, { timeZone: timeZone || getTimezone() });
}

export function formatDateTime(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleString(undefined, { timeZone: timeZone || getTimezone() });
}
