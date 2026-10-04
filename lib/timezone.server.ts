import { getRequestCookie } from "./api-server";
import { isValidTimezone, TIMEZONE_COOKIE } from "./timezone";

export function getRequestTimezone(request: Request): string {
  const timezone = getRequestCookie(request, TIMEZONE_COOKIE);
  return isValidTimezone(timezone) ? timezone : "UTC";
}
