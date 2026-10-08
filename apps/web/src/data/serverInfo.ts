import { useSyncExternalStore } from "react";
import { dataConfig } from "./config";

export type ServerInfo = { mode: "cloud" | "local"; name: string; upstream: "none" | "online" | "offline" | "unknown"; lastSyncAt: number | null; failing: number };
export type Probe = { reachable: boolean | null; info: ServerInfo | null };

const PERIOD_MS = 15_000;
let state: Probe = { reachable: null, info: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const set = (next: Probe) => {
  if (next.reachable === state.reachable && JSON.stringify(next.info) === JSON.stringify(state.info)) return;
  state = next;
  for (const l of listeners) l();
};

/**
 * Sonde de santé du serveur auquel CETTE page parle (même origine : le cloud, ou le serveur de classe). `navigator.onLine`
 * dit « en ligne » sur un Wi-Fi sans Internet et ne sait rien d'un serveur de classe injoignable : on interroge le serveur.
 * Toute réponse HTTP sous 500 prouve qu'il répond ; seule 200 porte les informations.
 */
export async function probeServer(fetchFn: typeof fetch = fetch): Promise<void> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 4000);
  try {
    const r = await fetchFn("/api/server-info", { signal: c.signal, cache: "no-store" });
    if (r.status >= 500) return set({ reachable: false, info: null });
    set({ reachable: true, info: r.status === 200 ? ((await r.json()) as ServerInfo) : null });
  } catch {
    set({ reachable: false, info: null });
  } finally {
    clearTimeout(t);
  }
}

function start() {
  void probeServer();
  timer = setInterval(() => void probeServer(), PERIOD_MS);
  window.addEventListener("online", onBack);
  document.addEventListener("visibilitychange", onBack);
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener("online", onBack);
  document.removeEventListener("visibilitychange", onBack);
}
function onBack() {
  if (document.visibilityState === "visible") void probeServer();
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1 && dataConfig.probe) start();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) stop();
  };
}

export const useServerProbe = (): Probe => useSyncExternalStore(subscribe, () => state, () => state);

/** Pour les tests : remet la sonde à zéro. */
export const resetServerProbe = () => set({ reachable: null, info: null });
