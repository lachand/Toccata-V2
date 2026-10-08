import { useEffect, useMemo, useState } from "react";
import { classesApi } from "../auth/api";
import { session, useSession } from "../auth/session";
import type { InstanceDoc, MasterContent, ParticipantStateDoc, TeacherNoteDoc } from "@toccata/schema";
import { useWorkspace } from "./provider";
import type { ActivityRow, SyncState } from "./workspace";

/** `null` tant que la base locale s'ouvre. */
export function useActivities(): ActivityRow[] | null {
  const ws = useWorkspace();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  useEffect(() => {
    if (!ws) return setRows(null);
    const s = ws.activities$().subscribe(setRows);
    return () => s.unsubscribe();
  }, [ws]);
  return rows;
}

/** `undefined` : chargement ; `null` : l'activité n'est pas (encore) arrivée sur cet appareil. */
export function useContent(activityId: string | null): MasterContent | null | undefined {
  const ws = useWorkspace();
  const [content, setContent] = useState<MasterContent | null | undefined>(undefined);
  useEffect(() => {
    setContent(undefined);
    if (!ws || !activityId) return;
    const s = ws.content$(activityId).subscribe(setContent);
    return () => s.unsubscribe();
  }, [ws, activityId]);
  return content;
}

export function useSyncState(): SyncState {
  const ws = useWorkspace();
  const [state, setState] = useState<SyncState>({ running: false, failing: false });
  useEffect(() => {
    if (!ws) return;
    const s = ws.syncState$.subscribe(setState);
    return () => s.unsubscribe();
  }, [ws]);
  return state;
}

/** Données d'exécution de l'aperçu d'une activité (instance locale, non répliquée). */
export function usePreviewStore(activityId: string) {
  const ws = useWorkspace();
  const { user } = useSession();
  return useMemo(() => (ws && user ? ws.previewStore(activityId, { id: user.id, role: user.role }) : null), [ws, user, activityId]);
}

/** Notes privées de l'enseignant sur une activité. */
export function useNotes(activityId: string): TeacherNoteDoc[] {
  const ws = useWorkspace();
  const [notes, setNotes] = useState<TeacherNoteDoc[]>([]);
  useEffect(() => {
    if (!ws) return setNotes([]);
    const s = ws.notes$(activityId).subscribe(setNotes);
    return () => s.unsubscribe();
  }, [ws, activityId]);
  return notes;
}

/** Nombre de fichiers gardés sur l'appareil en attente d'envoi. */
export function usePendingUploads(): number {
  const ws = useWorkspace();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ws) return setN(0);
    const s = ws.pendingUploads$().subscribe(setN);
    return () => s.unsubscribe();
  }, [ws]);
  return n;
}

/** Groupes (instances) d'une activité, vus par l'enseignant propriétaire. */
export function useGroups(activityId: string): { id: string; def: InstanceDoc | null }[] {
  const ws = useWorkspace();
  const { user } = useSession();
  const [rows, setRows] = useState<{ id: string; def: InstanceDoc | null }[]>([]);
  useEffect(() => {
    if (!ws || !user) return setRows([]);
    const s = ws.activityInstances$(activityId, user.id).subscribe(setRows);
    return () => s.unsubscribe();
  }, [ws, user, activityId]);
  return rows;
}

/** Séances de l'élève connecté (une par inscription). `null` tant que la base locale s'ouvre. */
export function useRuns(): { instanceId: string; activityId: string; title: string | null }[] | null {
  const ws = useWorkspace();
  const [rows, setRows] = useState<{ instanceId: string; activityId: string; title: string | null }[] | null>(null);
  useEffect(() => {
    if (!ws) return setRows(null);
    const s = ws.runs$().subscribe(setRows);
    return () => s.unsubscribe();
  }, [ws]);
  return rows;
}

/** Définition d'une instance (écrite par `ownerId`). `undefined` : chargement ; `null` : pas encore arrivée sur l'appareil. */
export function useInstanceDef(instanceId: string, ownerId: string | null): InstanceDoc | null | undefined {
  const ws = useWorkspace();
  const [def, setDef] = useState<InstanceDoc | null | undefined>(undefined);
  useEffect(() => {
    setDef(undefined);
    if (!ws || !ownerId) return;
    const s = ws.instance$(instanceId, ownerId).subscribe(setDef);
    return () => s.unsubscribe();
  }, [ws, instanceId, ownerId]);
  return def;
}

/** État du participant (étape en cours…) ; `undefined` : chargement. */
export function useParticipant(instanceId: string, userId: string): ParticipantStateDoc | null | undefined {
  const ws = useWorkspace();
  const [st, setSt] = useState<ParticipantStateDoc | null | undefined>(undefined);
  useEffect(() => {
    setSt(undefined);
    if (!ws) return;
    const s = ws.participant$(instanceId, userId).subscribe(setSt);
    return () => s.unsubscribe();
  }, [ws, instanceId, userId]);
  return st;
}

let namesCache: { uid: string; p: Promise<Map<string, string>> } | null = null;

/** Noms des élèves de toutes les classes de l'enseignant (identifiant → nom affiché). Chargé une fois ; vide hors ligne. */
export function useStudentNames(): Map<string, string> {
  const { user } = useSession();
  const uid = user?.id ?? "";
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!uid) return;
    let live = true;
    if (namesCache?.uid !== uid) {
      const p = (async () => {
        const api = classesApi(session.authorizedFetch, () => session.getAccessToken());
        const m = new Map<string, string>();
        for (const k of await api.list()) for (const s of (await api.get(k.id)).students) m.set(s.id, s.displayName);
        return m;
      })().catch(() => {
        namesCache = null; // réessayer plus tard (hors ligne)
        return new Map<string, string>();
      });
      namesCache = { uid, p };
    }
    void namesCache.p.then((m) => live && setNames(m));
    return () => {
      live = false;
    };
  }, [uid]);
  return names;
}
