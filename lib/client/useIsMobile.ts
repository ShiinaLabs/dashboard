import { useState, useEffect } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(onChange?: (isMobile: boolean) => void) {
  // Keep the first client render identical to SSR; update from the browser
  // media query immediately after hydration.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = e.matches;
      setIsMobile(matches);
      onChange?.(matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [onChange]);
  return isMobile;
}
