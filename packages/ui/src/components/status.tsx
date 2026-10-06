import { timerTone } from "@toccata/schema";
import { Clock, CloudUpload, RefreshCw, Wifi, WifiOff } from "lucide-react";

export type SyncState = "online" | "offline" | "syncing" | "pending";

const ICON = { online: Wifi, offline: WifiOff, syncing: RefreshCw, pending: CloudUpload } as const;

/**
 * État de synchronisation. `label` est le texte déjà traduit (ex. « Serveur de classe », « Hors ligne,
 * 3 modifications en attente ») : le composant ne connaît aucune langue. Annoncé poliment aux lecteurs d'écran.
 */
export function SyncStatus({ state, label }: { state: SyncState; label: string }) {
  const Icon = ICON[state];
  return (
    <span className="tc-sync" data-status={state} role="status">
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

/** mm:ss (ou h:mm:ss au-delà d'une heure), chiffres alignés. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

const isoDuration = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `PT${Math.floor(total / 3600)}H${Math.floor((total % 3600) / 60)}M${total % 60}S`;
};

/**
 * Chronomètre partagé. La couleur suit `timerTone` (> 5 min, 2 à 5 min, < 2 min) ; l'état n'est jamais
 * porté par la couleur seule : `label` nomme la valeur pour les lecteurs d'écran.
 * Ne s'annonce pas à chaque seconde (pas de `role="timer"` en direct) : c'est voulu.
 */
export function TimerChip({ remainingMs, label }: { remainingMs: number; label: string }) {
  return (
    <span className="tc-timer" data-tone={timerTone(remainingMs)}>
      <Clock size={16} aria-hidden="true" />
      <time dateTime={isoDuration(remainingMs)} aria-label={`${label} ${formatDuration(remainingMs)}`}>
        {formatDuration(remainingMs)}
      </time>
    </span>
  );
}
