import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isResumeGap, recordDataRefresh, recordServerCheck } from "./freshness-state";

type ServerState = "checking" | "reachable" | "unreachable" | "offline";
type RefreshState = "idle" | "refreshing" | "failed";
interface Freshness { serverState: ServerState; refreshState: RefreshState; lastServerCheckAt: number | null; lastSuccessfulDataRefreshAt: number | null }
const Context = createContext<Freshness>({ serverState: "checking", refreshState: "idle", lastServerCheckAt: null, lastSuccessfulDataRefreshAt: null });
export const useFreshness = () => useContext(Context);

export function FreshnessController({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Freshness>({ serverState: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "checking", refreshState: "idle", lastServerCheckAt: null, lastSuccessfulDataRefreshAt: null });
  const flight = useRef<Promise<void> | null>(null);
  const tickAt = useRef(Date.now());
  const lastRecoveryAt = useRef(0);
  const pendingFetches = useRef(new WeakSet<object>());
  const recoveryInProgress = useRef(false);
  const recoverySuccesses = useRef(0);

  useEffect(() => {
    let disposed = false;
    let wasVisible = document.visibilityState === "visible";
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type === "fetch") {
        pendingFetches.current.add(event.query);
      } else if (event.action.type === "error") {
        pendingFetches.current.delete(event.query);
      } else if (event.action.type === "success" && pendingFetches.current.has(event.query)) {
        pendingFetches.current.delete(event.query);
        if (event.query.getObserversCount() === 0) return;
        if (recoveryInProgress.current) recoverySuccesses.current++;
        else setState((current) => ({ ...current, ...recordDataRefresh(current, Date.now()) }));
      }
    });
    const initialDataRefreshAt = queryClient.getQueryCache().getAll()
      .filter((query) => query.getObserversCount() > 0 && query.state.status === "success" && query.state.dataUpdatedAt > 0)
      .reduce((latest, query) => Math.max(latest, query.state.dataUpdatedAt), 0);
    if (initialDataRefreshAt > 0) {
      setState((current) => ({ ...current, ...recordDataRefresh(current, initialDataRefreshAt) }));
    }
    const check = (refresh: boolean, refetchQueries = refresh) => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        if (!navigator.onLine) setState((current) => ({ ...current, serverState: "offline" }));
        return Promise.resolve();
      }
      if (flight.current) return flight.current;
      if (refresh && Date.now() - lastRecoveryAt.current < 1500) return Promise.resolve();
      if (refresh) lastRecoveryAt.current = Date.now();
      const task = (async () => {
        if (refresh) setState((current) => ({ ...current, serverState: "checking", refreshState: "refreshing" }));
        let reachable = false;
        try {
          const response = await fetch("/api/health", { cache: "no-store" });
          if (!response.ok) throw new Error("health check failed");
          const body = await response.json() as { status?: string };
          if (body.status !== "ok") throw new Error("server unavailable");
          reachable = true;
          setState((current) => ({ ...current, serverState: "reachable", ...recordServerCheck(current, Date.now()) }));
        } catch {
          if (!disposed) setState((current) => ({ ...current, serverState: "unreachable", refreshState: refresh ? "failed" : current.refreshState }));
          return;
        }
        const successfulFetchesBefore = recoverySuccesses.current;
        if (refresh) recoveryInProgress.current = true;
        try {
          if (refetchQueries) await queryClient.refetchQueries({ type: "active" }, { throwOnError: true });
          recoveryInProgress.current = false;
          setState((current) => ({
            ...current,
            refreshState: "idle",
            ...(refresh && recoverySuccesses.current > successfulFetchesBefore ? recordDataRefresh(current, Date.now()) : {}),
          }));
        } catch {
          recoveryInProgress.current = false;
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
    const online = () => { lastRecoveryAt.current = 0; recover(); };
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
      if (document.visibilityState !== "visible") return;
      if (resumedAfterGap) recover();
      else void check(false, false);
    }, 60_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", pageShow);
    void check(false, false);
    return () => { disposed = true; unsubscribe(); window.clearInterval(heartbeat); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", pageShow); };
  }, [queryClient]);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}
