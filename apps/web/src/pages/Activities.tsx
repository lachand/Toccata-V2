import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Card, Content, EmptyState, Pill, Segmented, TopBar } from "@toccata/ui";
import { BookPlus, Plus } from "lucide-react";
import { useState } from "react";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OnlineStatus } from "../components/Layout";
import type { Locale } from "../i18n";

type Kind = "running" | "draft" | "template";
type Sample = { id: string; title: string; kind: Kind; steps: number; current?: number; students: number; lastSession?: Date; pendingChanges?: number };

// DONNÉES D'EXEMPLE (la couche données arrive en Phase 2). Les titres sont du contenu saisi par des enseignants :
// ils ne sont jamais traduits.
const SAMPLE: Sample[] = [
  { id: "a", title: "Atelier Agile : la ville en Lego", kind: "running", steps: 4, current: 2, students: 20, lastSession: new Date("2026-10-05T16:05:00") },
  { id: "b", title: "Vérifier l'information", kind: "running", steps: 3, current: 2, students: 11, lastSession: new Date("2026-10-06T10:00:00") },
  { id: "c", title: "Catalogue de plantes", kind: "draft", steps: 3, students: 0, pendingChanges: 3 },
  { id: "d", title: "Débat mouvant, 4e", kind: "template", steps: 2, students: 0 },
  { id: "e", title: "Revue de fin de chapitre", kind: "draft", steps: 1, students: 0 },
];

type Filter = "all" | Kind;

export function Activities({ locale }: { locale: Locale }) {
  const { t, i18n } = useLingui();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = SAMPLE.filter((a) => filter === "all" || a.kind === filter);

  return (
    <>
      <TopBar title={t`My activities`}>
        <Pill tone="neutral">{t`Example data`}</Pill>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
        <Button variant="primary" icon={<Plus size={18} />}>{t`New activity`}</Button>
      </TopBar>
      <Content>
        <Segmented
          label={t`Filter activities`}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t`All` },
            { value: "running", label: t`In progress` },
            { value: "draft", label: t`Drafts` },
            { value: "template", label: t`Shared templates` },
          ]}
        />
        {shown.length === 0 ? (
          <EmptyState icon={<BookPlus size={32} />} title={t`No activity here yet`} description={t`Create your first activity to get started.`} action={<Button variant="primary">{t`New activity`}</Button>} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {shown.map((a) => {
              const current = a.current ?? 0;
              const total = a.steps;
              const stepCount = a.steps;
              const studentCount = a.students;
              const pendingCount = a.pendingChanges ?? 0;
              const when = a.lastSession ? i18n.date(a.lastSession, { dateStyle: "medium", timeStyle: "short" }) : null;
              return (
                <li key={a.id} style={{ display: "contents" }}>
                  <Card as="article" aria-labelledby={`t-${a.id}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {a.kind === "running" ? <Pill tone="accent">{t`In progress · step ${current} of ${total}`}</Pill> : null}
                      {a.kind === "draft" ? <Pill>{t`Draft`}</Pill> : null}
                      {a.kind === "template" ? <Pill>{t`Template`}</Pill> : null}
                      {a.pendingChanges ? <Pill tone="warn">{plural(pendingCount, { one: "# change waiting to sync", other: "# changes waiting to sync" })}</Pill> : null}
                    </div>
                    <h2 className="tc-h" id={`t-${a.id}`} style={{ fontSize: "var(--text-lg)" }}>{a.title}</h2>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
                      {plural(stepCount, { one: "# step", other: "# steps" })}
                      {a.students > 0 ? <> · {plural(studentCount, { one: "# student", other: "# students" })}</> : null}
                    </p>
                    {when ? (
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
                        <Trans>Last session: <strong>{when}</strong></Trans>
                      </p>
                    ) : null}
                    <div style={{ marginBlockStart: "auto" }}>
                      <Button>{a.kind === "running" ? t`Resume` : a.kind === "template" ? t`Copy to my activities` : t`Edit`}</Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Content>
    </>
  );
}
