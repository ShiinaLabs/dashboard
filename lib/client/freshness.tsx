import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type ServerState = "checking" | "reachable" | "unreachable" | "offline";
type RefreshState = "idle" | "refreshing" | "failed";
interface Freshness { serverState: ServerState; refreshState: RefreshState; lastServerCheckAt: number | null; lastSuccessfulRefreshAt: number | null }
const Context = createContext<Freshness>({ serverState: "checking", refreshState: "idle", lastServerCheckAt: null, lastSuccessfulRefreshAt: null });
export const useFreshness = () => useContext(Context);
export const isResumeGap = (previousTickAt: number, now: number) => now - previousTickAt > 90_000;

export function FreshnessController({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Freshness>({ serverState: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "checking", refreshState: "idle", lastServerCheckAt: null, lastSuccessfulRefreshAt: null });
  const flight = useRef<Promise<void> | null>(null);
  const tickAt = useRef(Date.now());
  const lastRecoveryAt = useRef(0);

  useEffect(() => {
    let disposed = false;
    let wasVisible = document.visibilityState === "visible";
    const check = (refresh: boolean, refetchQueries = true) => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        if (!navigator.onLine) setState((current) => ({ ...current, serverState: "offline" }));
        return Promise.resolve();
      }
      if (flight.current) return flight.current;
      if (refresh && Date.now() - lastRecoveryAt.current < 1500) return Promise.resolve();
      if (refresh) lastRecoveryAt.current = Date.now();
      const task = (async () => {
        if (refresh) setState((current) => ({ ...current, refreshState: "refreshing" }));
        let reachable = false;
        try {
          const response = await fetch("/api/health", { cache: "no-store" });
          if (!response.ok) throw new Error("health check failed");
          const body = await response.json() as { status?: string };
          if (body.status !== "ok") throw new Error("server unavailable");
          reachable = true;
          setState((current) => ({ ...current, serverState: "reachable", lastServerCheckAt: Date.now() }));
        } catch {
          if (!disposed) setState((current) => ({ ...current, serverState: "unreachable", refreshState: refresh ? "failed" : current.refreshState }));
          return;
        }
        try {
          if (refetchQueries) {
            await queryClient.refetchQueries(refresh ? { type: "active" } : { type: "active", stale: true }, { throwOnError: true });
          }
          setState((current) => ({ ...current, refreshState: "idle", lastSuccessfulRefreshAt: Date.now() }));
        } catch {
          if (!disposed) setState((current) => ({ ...current, serverState: reachable ? "reachable" : "unreachable", refreshState: "failed" }));
        }
      })();
      flight.current = task.finally(() => { flight.current = null; });
      return flight.current;
    };
    const recover = () => { void check(true); };
    const visibility = () => {
      tickAt.current = Date.now();
      const visible = document.visibilityState === "visible";
      if (visible && !wasVisible) recover();
      wasVisible = visible;
    };
    const online = () => { setState((current) => ({ ...current, serverState: "checking" })); recover(); };
    const offline = () => { lastRecoveryAt.current = 0; setState((current) => ({ ...current, serverState: "offline" })); };
    const pageShow = (event: PageTransitionEvent) => {
      const now = Date.now();
      const resumedAfterGap = isResumeGap(tickAt.current, now);
      tickAt.current = now;
      if (event.persisted || resumedAfterGap) recover();
    };
    const heartbeat = window.setInterval(() => {
      const now = Date.now();
      const resumedAfterGap = isResumeGap(tickAt.current, now);
      tickAt.current = now;
      if (document.visibilityState === "visible") void check(resumedAfterGap);
    }, 60_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", pageShow);
    void check(false, false);
    return () => { disposed = true; window.clearInterval(heartbeat); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", pageShow); };
  }, [queryClient]);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}
