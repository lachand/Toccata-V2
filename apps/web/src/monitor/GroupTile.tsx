import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Card, Pill, TimerChip } from "@toccata/ui";
import { CircleHelp, Eye } from "lucide-react";
import { Link } from "react-router";
import type { GroupSummary } from "./summary";

/** Il y a … : durée relative via `Intl`, jamais une phrase assemblée à la main. */
function ago(locale: string, ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const f = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  return s < 90 ? f.format(-s, "second") : s < 5400 ? f.format(-Math.round(s / 60), "minute") : f.format(-Math.round(s / 3600), "hour");
}

/** Tuile d'un groupe (écran de suivi, télécommande, projecteur) : étape, chronomètres, applications, demandes d'aide. */
export function GroupTile({ g, activityId, now, names, projector = false, children }: { g: GroupSummary; activityId: string; now: number; names?: ReadonlyMap<string, string>; projector?: boolean; children?: React.ReactNode }) {
  const { t, i18n } = useLingui();
  const memberCount = g.memberIds.length;
  const stepNumber = (g.stepIndex ?? 0) + 1;
  return (
    <Card as="article" aria-labelledby={`g-${g.instanceId}`} className="tc-gtile" data-help={g.help.length > 0 ? "true" : "false"} data-projector={projector ? "true" : "false"}>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        <h2 className="tc-h" id={`g-${g.instanceId}`} style={{ fontSize: projector ? "var(--text-2xl, 2rem)" : "var(--text-lg)", marginInlineEnd: "auto" }}>{g.name}</h2>
        {g.help.length > 0 ? <Pill tone="warn" icon={<CircleHelp size={14} />}>{plural(g.help.length, { one: "# needs help", other: "# need help" })}</Pill> : null}
      </div>
      {g.help.length > 0 ? <p style={{ margin: 0, color: "var(--warn-ink)", fontWeight: 600 }}>{g.help.map((h) => names?.get(h.userId) ?? t`A student`).join(", ")}</p> : null}
      <p style={{ margin: 0 }}>
        {g.stepIndex === null ? (
          <span style={{ color: "var(--muted)" }}>{t`Not started`}</span>
        ) : (
          <>
            <strong>{t`Step ${stepNumber} of ${g.stepCount}`}</strong> · {g.stepTitle}
          </>
        )}
      </p>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
        {plural(memberCount, { one: "# student", other: "# students" })}
        {g.lastActivity !== null ? ` · ${t`active`} ${ago(i18n.locale, now - g.lastActivity)}` : ""}
      </p>
      {g.timers.map((tm) => (
        <div key={tm.appId} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <TimerChip remainingMs={tm.remainingMs} label={tm.name} />
          <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)" }}>{tm.status === "running" ? t`running` : tm.status === "paused" ? t`paused` : tm.status === "done" ? t`time is up` : t`not started`}</span>
        </div>
      ))}
      {g.kanban.map((k) => (
        <p key={k.appId} style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          <strong>{k.name}</strong> · {k.columns.map((c) => `${c.title} ${c.count}`).join(" · ")}
        </p>
      ))}
      {g.forms.map((f) => {
        const submitted = f.submitted;
        const total = f.total;
        return (
          <p key={f.appId} style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            <strong>{f.name}</strong> · {t`${submitted} of ${total} submitted`}
          </p>
        );
      })}
      {projector ? null : (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBlockStart: "auto" }}>
          <Link className="tc-btn" to={`/activities/${activityId}/monitor/${g.instanceId}`}>
            <Eye size={16} aria-hidden="true" /> {t`Watch`}
          </Link>
          {children}
        </div>
      )}
    </Card>
  );
}
