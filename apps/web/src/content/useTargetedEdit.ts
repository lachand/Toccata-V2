import { applyToOverrides, planEdit, type Edit, type InstanceDoc, type MasterContent, type Plan } from "@toccata/schema";
import { useState } from "react";
import type { Workspace } from "../data/workspace";

export type TargetMode = "all" | "groups";

/**
 * Modification en direct ciblée (D5 de l'article) : la même édition s'adresse à toute la classe (écrite dans le master,
 * vue par tous les groupes qui le suivent) ou à des groupes choisis (écrite dans leurs surcharges, le master ne bouge pas).
 * La logique de ciblage est celle, pure et testée, de `planEdit`.
 */
export function useTargetedEdit(ws: Workspace | null, activityId: string, content: MasterContent | null | undefined, groups: readonly { id: string; def: InstanceDoc | null }[]) {
  const [mode, setMode] = useState<TargetMode>("all");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<(Plan & { applied: number }) | null>(null);

  const defs = groups.flatMap((g) => (g.def ? [g.def] : []));

  async function apply(edit: Edit): Promise<void> {
    if (!ws || !content) return;
    const plan = planEdit(edit, mode === "all" ? { type: "all" } : { type: "instances", instanceIds: [...chosen] }, defs);
    for (const w of plan.writes) {
      if (w.scope === "master") {
        if (edit.type === "setStepHidden") await ws.patchStep(activityId, edit.stepId, { hidden: edit.hidden });
        else if (edit.type === "setStepLocked") await ws.patchStep(activityId, edit.stepId, { locked: edit.locked });
        else if (edit.type === "patchStep") await ws.patchStep(activityId, edit.stepId, edit.patch);
      } else {
        await ws.updateInstanceDef(w.instanceId, (d) => ({ ...d, overrides: applyToOverrides(d.overrides, edit, d.linked ? content : (d.snapshot ?? content)) }));
      }
    }
    setReport({ ...plan, applied: plan.writes.length });
  }

  return {
    mode,
    setMode: (m: TargetMode) => (setMode(m), setReport(null)),
    chosen,
    toggle: (id: string, on: boolean) => setChosen((c) => (on ? new Set(c).add(id) : (new Set([...c].filter((x) => x !== id))))),
    hasGroups: defs.length > 0,
    /** Une modification adressée à des groupes sans en choisir aucun n'a pas de destinataire. */
    noRecipient: mode === "groups" && chosen.size === 0,
    report,
    apply,
  };
}
