import type { InstanceScopedDoc, MasterContent } from "@toccata/schema";
import { useEffect, useMemo, useState } from "react";
import { useContent, useGroups } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import { byUrgency, summarizeGroup, type GroupSummary } from "./summary";

/**
 * Résumé en direct de tous les groupes d'une activité. Les données arrivent par la réplication des bases `inst_<id>` ;
 * l'heure serveur est relue chaque seconde (chronomètres) sans recalculer ce qui n'a pas changé de source.
 */
export function useMonitor(activityId: string): { content: MasterContent | null | undefined; groups: GroupSummary[]; loading: boolean } {
  const ws = useWorkspace();
  const content = useContent(activityId);
  const defs = useGroups(activityId);
  const [docs, setDocs] = useState<Record<string, InstanceScopedDoc[]>>({});
  const [now, setNow] = useState(() => ws?.serverNow() ?? Date.now());

  const ids = defs.map((g) => g.id).join(",");
  useEffect(() => {
    if (!ws) return;
    const subs = defs.map((g) => ws.instanceDocs$(g.id).subscribe((d) => setDocs((prev) => ({ ...prev, [g.id]: d }))));
    return () => subs.forEach((s) => s.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` résume `defs`
  }, [ws, ids]);

  useEffect(() => {
    if (!ws) return;
    const h = setInterval(() => setNow(ws.serverNow()), 1000);
    return () => clearInterval(h);
  }, [ws]);

  const groups = useMemo(() => {
    if (!content) return [];
    return defs
      .flatMap((g) => (g.def ? [summarizeGroup(content, g.def, docs[g.id] ?? [], now)] : []))
      .sort(byUrgency);
  }, [content, defs, docs, now]);

  return { content, groups, loading: ws === null || content === undefined };
}
