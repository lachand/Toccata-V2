import { useLingui } from "@lingui/react/macro";
import type { BroadcastDoc, FeedbackDoc, SubmissionDoc } from "@toccata/schema";
import { Button, Pill, Segmented } from "@toccata/ui";
import { BellRing, CircleHelp, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const dismissKey = (b: BroadcastDoc) => `toccata.dismissed.${b.id}.${b.updatedAt}`;
const wasDismissed = (b: BroadcastDoc) => {
  try {
    return sessionStorage.getItem(dismissKey(b)) === "1";
  } catch {
    return false;
  }
};

/** Message de l'enseignant, en bandeau : se ferme (jusqu'au prochain message). */
export function MessageBanner({ message }: { message: BroadcastDoc | undefined }) {
  const { t } = useLingui();
  const [, force] = useState(0);
  if (!message || !message.active || wasDismissed(message)) return null;
  return (
    <div role="status" className="tc-callout tc-banner">
      <span><strong>{t`Message from your teacher`}</strong> · {message.body}</span>
      <Button
        variant="ghost"
        icon={<X size={16} />}
        onClick={() => {
          try {
            sessionStorage.setItem(dismissKey(message), "1");
          } catch {
            /* stockage bloqué : le bandeau reviendra au prochain message */
          }
          force((n) => n + 1);
        }}
      >
        {t`Close`}
      </Button>
    </div>
  );
}

/**
 * Demande d'attention : le contenu de la page est rendu inerte par l'appelant (`inert`), cette fenêtre prend le focus et
 * l'annonce aux lecteurs d'écran. Elle ne se ferme pas toute seule ni avec Échap : seul l'enseignant la lève.
 */
export function AttentionOverlay({ attention }: { attention: BroadcastDoc | undefined }) {
  const { t } = useLingui();
  const ref = useRef<HTMLDivElement>(null);
  const active = !!attention?.active;
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  if (!attention || !active) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="attn-title" aria-describedby="attn-body" className="tc-attention" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}>
      <BellRing size={48} aria-hidden="true" />
      <h2 id="attn-title" className="tc-h" style={{ fontSize: "var(--text-2xl, 2rem)" }}>{t`Your teacher asks for your attention`}</h2>
      <p id="attn-body" style={{ margin: 0, fontSize: "var(--text-xl)" }}>{attention.body || t`Look up, please.`}</p>
    </div>
  );
}

const SCALE = ["1", "2", "3", "4"] as const;

/** Remise de l'étape : terminé / besoin d'aide / ressenti, et retour de l'enseignant. */
export function StepProgressPanel({
  submission,
  feedback,
  onStatus,
  onAssess,
}: {
  submission: SubmissionDoc | undefined;
  feedback: FeedbackDoc | undefined;
  onStatus: (s: "submitted" | "needs_help" | "draft") => void;
  onAssess: (n: number) => void;
}) {
  const { t } = useLingui();
  const status = submission?.status ?? "draft";
  return (
    <section aria-label={t`Your progress on this step`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <button type="button" className="tc-btn" aria-pressed={status === "submitted" || status === "accepted"} onClick={() => onStatus(status === "submitted" ? "draft" : "submitted")}>
          <Check size={16} aria-hidden="true" /> {t`I'm done`}
        </button>
        <button type="button" className="tc-btn" aria-pressed={status === "needs_help"} onClick={() => onStatus(status === "needs_help" ? "draft" : "needs_help")}>
          <CircleHelp size={16} aria-hidden="true" /> {t`I need help`}
        </button>
      </div>
      <Segmented
        label={t`How did it go? (1 = lost, 4 = confident)`}
        value={(submission?.selfAssessment ? String(submission.selfAssessment) : "") as (typeof SCALE)[number]}
        options={SCALE.map((n) => ({ value: n, label: n }))}
        onChange={(v) => onAssess(Number(v))}
      />
      {feedback && (feedback.body || feedback.accepted) ? (
        <div role="status" className="tc-callout">
          {feedback.accepted ? <Pill tone="accent" icon={<Check size={14} />}>{t`Validated`}</Pill> : null}{" "}
          {feedback.body ? <span><strong>{t`Your teacher says:`}</strong> {feedback.body}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
