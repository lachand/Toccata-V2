import type { TimerStateDoc } from "./entities";

/**
 * Temps restant d'un chronomètre partagé.
 * `nowServerMs` doit être une heure CORRIGÉE du décalage avec le serveur : l'ancienne version
 * comparait des horloges d'appareils non synchronisées.
 */
export function timerRemainingMs(state: Pick<TimerStateDoc, "status" | "remainingMs" | "startedAtMs">, nowServerMs: number): number {
  if (state.status !== "running" || state.startedAtMs === null) return state.remainingMs;
  const elapsed = Math.max(0, nowServerMs - state.startedAtMs);
  return Math.max(0, state.remainingMs - elapsed);
}

export type Tone = "ok" | "amber" | "red";
/** Couleur du chrono sur l'écran de suivi : > 5 min vert, 2 à 5 min orange, < 2 min rouge. */
export function timerTone(remainingMs: number): Tone {
  if (remainingMs < 120_000) return "red";
  if (remainingMs < 300_000) return "amber";
  return "ok";
}

export type ClockSample = { sentAtMs: number; receivedAtMs: number; serverMs: number };

/**
 * Décalage « serveur − appareil » estimé à la manière de NTP : on garde l'échantillon au plus
 * court aller-retour et on suppose le serveur au milieu. `serverMs` vient de l'en-tête `Date`
 * (précision d'une seconde, donc l'erreur est bornée à ±500 ms + RTT/2).
 */
export function estimateClockOffset(samples: readonly ClockSample[]): number | null {
  let best: ClockSample | null = null;
  for (const s of samples) {
    if (s.receivedAtMs < s.sentAtMs) continue;
    if (!best || s.receivedAtMs - s.sentAtMs < best.receivedAtMs - best.sentAtMs) best = s;
  }
  return best ? best.serverMs - (best.sentAtMs + best.receivedAtMs) / 2 : null;
}
