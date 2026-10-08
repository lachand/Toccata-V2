import { decodeInstanceDocs, newId, type SubmissionDoc } from "@toccata/schema";
import type { Workspace } from "../data/workspace";

/** Remise de l'élève pour une étape : un document par (personne, étape), au nom de la personne. */
export async function saveSubmission(ws: Workspace, instanceId: string, userId: string, stepId: string, patch: Partial<Pick<SubmissionDoc, "status" | "selfAssessment">>): Promise<void> {
  const col = await ws.instanceCol(instanceId);
  const mine = decodeInstanceDocs((await col.find({ selector: { kind: "submission" } }).exec()).map((r) => r.toJSON())).docs.filter((d): d is SubmissionDoc => d.kind === "submission" && d.authorId === userId && d.stepId === stepId);
  const cur = [...mine].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const t = ws.now();
  const next: SubmissionDoc = {
    id: cur?.id ?? newId(t),
    authorId: userId,
    kind: "submission",
    stepId,
    status: patch.status ?? cur?.status ?? "draft",
    ...(patch.selfAssessment !== undefined ? { selfAssessment: patch.selfAssessment } : cur?.selfAssessment !== undefined ? { selfAssessment: cur.selfAssessment } : {}),
    createdAt: cur?.createdAt ?? t,
    updatedAt: t,
  };
  await col.upsert(next as unknown as Record<string, unknown>);
}
