import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button, Card, Content, EmptyState, TopBar } from "@toccata/ui";
import { BarChart3, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { OnlineStatus } from "../components/Layout";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useNotes } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";
import { download } from "../review/download";
import { buildReview } from "../review/review";
import { buildResearchRows, toCsv, toJson } from "../review/research";
import { useReviewData } from "../review/useReviewData";

const FLAG = { good: "👍", improve: "👎", bookmark: "🔖" } as const;

/** « Prévu vs réalisé » (D9) : ce que le script prévoyait, ce que la séance a montré, et le bilan de l'enseignant. */
export function Review({ locale }: { locale: Locale }) {
  const { t, i18n } = useLingui();
  const { id = "" } = useParams();
  const ws = useWorkspace();
  const { content, groups } = useReviewData(id);
  const notes = useNotes(id);
  const review = useMemo(() => (content ? buildReview(content, groups) : null), [content, groups]);
  const stepNote = (stepId: string) => notes.find((n) => n.stepId === stepId);
  const global = notes.find((n) => n.stepId === null);

  const [draft, setDraft] = useState({ worked: "", change: "", next: "" });
  const [saved, setSaved] = useState<"idle" | "saved" | "error">("idle");
  useEffect(() => {
    if (global?.structured) setDraft(global.structured);
  }, [global?.id, global?.structured?.worked, global?.structured?.change, global?.structured?.next]); // eslint-disable-line react-hooks/exhaustive-deps

  const [consent, setConsent] = useState(false);
  const fmtMin = (sec: number | null) => (sec === null ? "—" : i18n.number(Math.round(sec / 60), { maximumFractionDigits: 0 }) + " min");
  const fmtDate = (ms: number | null) => (ms === null ? "—" : i18n.date(new Date(ms), { dateStyle: "medium", timeStyle: "short" }));
  const title = content?.activity.title ?? t`Activity`;

  const save = async () => {
    try {
      await ws?.saveNote(id, null, { structured: draft });
      setSaved("saved");
    } catch {
      setSaved("error");
    }
  };
  const exportAs = (kind: "csv" | "json") => {
    const rows = buildResearchRows(groups);
    if (kind === "csv") download("toccata-journal.csv", "text/csv", toCsv(rows));
    else download("toccata-journal.json", "application/json", toJson(rows));
  };

  return (
    <>
      <TopBar title={t`Review · ${title}`}>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
        <Link className="tc-btn" to={`/activities/${id}`}>{t`Back to the activity`}</Link>
      </TopBar>
      <Content>
        {!review || !content ? null : review.eventCount === 0 ? (
          <EmptyState icon={<BarChart3 size={32} />} title={t`No session recorded yet`} description={t`Run the activity with a class: planned and actual timings will appear here.`} action={<Link className="tc-btn tc-btn--primary" to={`/activities/${id}/distribute`}>{t`Distribute`}</Link>} />
        ) : (
          <>
            <p role="status" className="tc-callout">
              {t`Session from ${fmtDate(review.startedAt)} to ${fmtDate(review.endedAt)} · planned ${fmtMin(review.plannedTotalSec)}`} ·{" "}
              {plural(review.groups.length, { one: "# group", other: "# groups" })}
            </p>
            <table className="tc-table">
              <caption>{t`Planned versus actual, per step`}</caption>
              <thead>
                <tr>
                  <th scope="col">{t`Step`}</th>
                  <th scope="col">{t`Planned`}</th>
                  <th scope="col">{t`Actual (median)`}</th>
                  <th scope="col">{t`Groups reached`}</th>
                  <th scope="col">{t`Help requests`}</th>
                  <th scope="col">{t`Handed in`}</th>
                  <th scope="col">{t`Live changes`}</th>
                  <th scope="col">{t`Groups with a variant`}</th>
                  <th scope="col">{t`Your notes`}</th>
                </tr>
              </thead>
              <tbody>
                {review.steps.map((s) => {
                  const n = stepNote(s.stepId);
                  const over = s.plannedSec !== null && s.observedSec !== null && s.observedSec > s.plannedSec * 1.2;
                  return (
                    <tr key={s.stepId}>
                      <th scope="row">{s.title}</th>
                      <td>{fmtMin(s.plannedSec)}</td>
                      <td data-tone={over ? "warn" : undefined}>{fmtMin(s.observedSec)}{over ? ` · ${t`longer than planned`}` : ""}</td>
                      <td>{s.groupsReached} / {s.groupsTotal}</td>
                      <td>{s.helpRequests}</td>
                      <td>{s.completions}</td>
                      <td>{s.liveEdits}</td>
                      <td>{s.variantGroups}</td>
                      <td>{n ? <>{n.flag ? <span aria-hidden="true">{FLAG[n.flag]} </span> : null}{n.body}</> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Card>
              <h2>{t`Groups`}</h2>
              <ul>
                {review.groups.map((g) => (
                  <li key={g.instanceId}>
                    {g.name} · {plural(g.stepsReached, { one: "# step reached", other: "# steps reached" })} · {plural(g.helpRequests, { one: "# help request", other: "# help requests" })}
                    {g.timerExtensionsSec > 0 ? ` · ${t`timers extended by ${fmtMin(g.timerExtensionsSec)}`}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        <Card>
          <h2>{t`Your review`}</h2>
          <p>{t`Only you can read this. It stays with the activity so that you can improve it next time.`}</p>
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "grid", gap: "var(--space-3)" }}>
            <label>{t`What worked well?`}<textarea className="tc-input" rows={3} value={draft.worked} maxLength={5000} onChange={(e) => { setDraft({ ...draft, worked: e.currentTarget.value }); setSaved("idle"); }} /></label>
            <label>{t`What would you change?`}<textarea className="tc-input" rows={3} value={draft.change} maxLength={5000} onChange={(e) => { setDraft({ ...draft, change: e.currentTarget.value }); setSaved("idle"); }} /></label>
            <label>{t`What will you do next time?`}<textarea className="tc-input" rows={3} value={draft.next} maxLength={5000} onChange={(e) => { setDraft({ ...draft, next: e.currentTarget.value }); setSaved("idle"); }} /></label>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
              <Button type="submit" variant="primary">{t`Save the review`}</Button>
              <span role="status">{saved === "saved" ? t`Saved` : saved === "error" ? t`Could not save` : ""}</span>
            </div>
          </form>
        </Card>

        {review && review.eventCount > 0 ? (
          <Card>
            <h2>{t`Research log`}</h2>
            <p>{t`The export contains neutral action codes with pseudonymised participants (no names, no student content). Use it only if the people concerned and their guardians agreed to take part in research.`}</p>
            <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", minBlockSize: "var(--hit)" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
              {t`I confirm that consent has been collected for this class.`}
            </label>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <Button icon={<Download size={16} />} disabled={!consent} onClick={() => exportAs("csv")}>{t`Export CSV`}</Button>
              <Button icon={<Download size={16} />} disabled={!consent} onClick={() => exportAs("json")}>{t`Export JSON`}</Button>
            </div>
          </Card>
        ) : null}
      </Content>
    </>
  );
}
