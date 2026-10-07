import { useEffect, useMemo, useState } from "react";
import { useSession } from "../auth/session";
import type { MasterContent, TeacherNoteDoc } from "@toccata/schema";
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
export function useContent(activityId: string): MasterContent | null | undefined {
  const ws = useWorkspace();
  const [content, setContent] = useState<MasterContent | null | undefined>(undefined);
  useEffect(() => {
    setContent(undefined);
    if (!ws) return;
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
