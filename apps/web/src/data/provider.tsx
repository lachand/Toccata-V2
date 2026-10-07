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
    const api = activitiesApi(session.authorizedFetch, () => session.getAccessToken());
    /** Aligne le registre local sur le serveur : activités et groupes de l'enseignant, séances de l'élève. */
    const refreshRegistry = async () => {
      try {
        if (role === "teacher") {
          for (const a of await api.list()) {
            await ws.remember(a.id);
            for (const i of a.instances) await ws.rememberInstance(a.id, i.id);
          }
        } else if (role === "student") await ws.syncMemberships(await api.memberships());
      } catch {
        /* réseau ou droits : on garde ce qu'on connaît déjà */
      }
    };
    void (async () => {
      await refreshRegistry();
      if (!cancelled && dataConfig.sync) await ws.startSync({ fetch: syncFetch(session.authorizedFetch), baseUrl: dataConfig.syncBaseUrl });
    })();
    // un nouveau groupe créé depuis un autre appareil, une inscription ajoutée ou retirée : on s'en aperçoit sans recharger
    const poll = setInterval(() => void refreshRegistry(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      void ws.stopSync();
    };
  }, [ws, online, role]);

  const value = useMemo(() => ws, [ws]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
