/**
 * Progression d'un participant dans le script (principe de l'article : un script LINÉAIRE, où l'on avance étape par étape).
 *
 *  - une étape verrouillée par l'enseignant ferme le chemin : elle et les suivantes sont inaccessibles ;
 *  - une étape bloquée par un questionnaire reste accessible, mais les suivantes ne le sont qu'une fois le questionnaire envoyé.
 */
export type ProgressStep = Readonly<{ id: string; locked: boolean; blockedByAppId: string | null }>;

/** Nombre d'étapes accessibles depuis le début : les indices `0 … n-1`. */
export function reachableCount(steps: readonly ProgressStep[], submitted: ReadonlySet<string>): number {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.locked) return i;
    if (s.blockedByAppId !== null && !submitted.has(s.blockedByAppId)) return i + 1;
  }
  return steps.length;
}

/** Étape à rouvrir : celle mémorisée si elle existe encore et reste accessible, sinon la dernière accessible avant elle. */
export function resumeIndex(steps: readonly ProgressStep[], submitted: ReadonlySet<string>, savedStepId: string | null): number {
  const reachable = reachableCount(steps, submitted);
  if (reachable === 0) return -1;
  const saved = savedStepId === null ? -1 : steps.findIndex((s) => s.id === savedStepId);
  return saved < 0 ? 0 : Math.min(saved, reachable - 1);
}
