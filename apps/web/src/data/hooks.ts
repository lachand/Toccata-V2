import { useEffect, useState } from "react";
import type { MasterContent } from "@toccata/schema";
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
