export const TIMEZONE_COOKIE = "dash_timezone";

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return false;
  if (!/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
