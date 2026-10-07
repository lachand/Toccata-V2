import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { activitiesApi } from "../auth/api";
import { session, useSession } from "../auth/session";
import { dataConfig } from "./config";
import { syncFetch } from "./syncFetch";
import { Workspace } from "./workspace";

const Ctx = createContext<Workspace | null>(null);

/** Espace de travail local de l'utilisateur connecté (`null` le temps de l'ouverture). */
export const useWorkspace = (): Workspace | null => useContext(Ctx);

/**
 * Ouvre la base locale de l'utilisateur connecté, puis synchronise tant qu'on a un jeton.
 * Hors ligne : on garde les données locales et on réessaie au retour du réseau (la session le signale).
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, offline } = useSession();
  const userId = user?.id ?? null;
  const role = user?.role ?? null;
  const [ws, setWs] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const { ready, release } = Workspace.acquire({ userId, storage: dataConfig.storage(), multiInstance: dataConfig.multiInstance, blobs: dataConfig.blobs(), ...(role ? { role } : {}) });
    void ready.then(async (w) => {
      await w.openKnown();
      if (!cancelled) setWs(w);
    });
    return () => {
      cancelled = true;
      setWs(null);
      release();
    };
  }, [userId, role]);

  const online = !offline && userId !== null;
  useEffect(() => {
    if (!ws || !online) return;
    let cancelled = false;
    void (async () => {
      if (role === "teacher") {
        try {
          const refs = await activitiesApi(session.authorizedFetch, () => session.getAccessToken()).list();
          for (const r of refs) await ws.remember(r.id);
        } catch {
          /* réseau ou droits : on garde ce qu'on connaît déjà */
        }
      }
      if (!cancelled && dataConfig.sync) await ws.startSync({ fetch: syncFetch(session.authorizedFetch), baseUrl: dataConfig.syncBaseUrl });
    })();
    return () => {
      cancelled = true;
      void ws.stopSync();
    };
  }, [ws, online, role]);

  const value = useMemo(() => ws, [ws]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
