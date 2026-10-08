import type { InstanceDoc, InstanceScopedDoc, MasterContent } from "@toccata/schema";
import { useEffect, useMemo, useState } from "react";
import { useContent, useGroups } from "../data/hooks";
import { useWorkspace } from "../data/provider";

/** Contenu du master et journaux de tous les groupes d'une activité, en direct. */
export function useReviewData(activityId: string): { content: MasterContent | null | undefined; groups: { def: InstanceDoc; docs: InstanceScopedDoc[] }[] } {
  const ws = useWorkspace();
  const content = useContent(activityId);
  const defs = useGroups(activityId);
  const [docs, setDocs] = useState<Record<string, InstanceScopedDoc[]>>({});
  const ids = defs.map((g) => g.id).join(",");
  useEffect(() => {
    if (!ws) return;
    const subs = defs.map((g) => ws.instanceDocs$(g.id).subscribe((d) => setDocs((prev) => ({ ...prev, [g.id]: d }))));
    return () => subs.forEach((s) => s.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` résume `defs`
  }, [ws, ids]);
  const groups = useMemo(() => defs.flatMap((g) => (g.def ? [{ def: g.def, docs: docs[g.id] ?? [] }] : [])), [defs, docs]);
  return { content, groups };
}
