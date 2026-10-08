import { useLingui } from "@lingui/react/macro";
import type { InstanceStore } from "@toccata/apps-sdk";
import { resolve, type InstanceScopedDoc } from "@toccata/schema";
import { Content, EmptyState, Field, NativeSelect, TopBar } from "@toccata/ui";
import { Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { OnlineStatus } from "../components/Layout";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { ResourceView } from "../content/ResourceView";
import { useContent, useGroups, useStudentNames } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";
import { RichView } from "../richtext/RichView";
import { AppRuntime } from "../run/AppRuntime";
import { useSession } from "../auth/session";

/**
 * Miroir (article §4.3) : l'enseignant voit l'écran d'un participant tel que lui-même le voit, en direct. Lecture seule
 * garantie deux fois : le contenu est `inert` (rien ne reçoit ni clic, ni focus, ni frappe) et le magasin refuse toute écriture.
 */
export function Mirror({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const { id = "", instanceId = "" } = useParams();
  const ws = useWorkspace();
  const { user } = useSession();
  const content = useContent(id);
  const groups = useGroups(id);
  const names = useStudentNames();
  const def = groups.find((g) => g.id === instanceId)?.def ?? null;
  const [docs, setDocs] = useState<InstanceScopedDoc[]>([]);
  const [who, setWho] = useState<string>("");
  useEffect(() => {
    if (!ws) return;
    const s = ws.instanceDocs$(instanceId).subscribe(setDocs);
    return () => s.unsubscribe();
  }, [ws, instanceId]);

  const userId = who || def?.memberIds[0] || "";
  const state = docs.find((d): d is Extract<InstanceScopedDoc, { kind: "participant" }> => d.kind === "participant" && d.id === userId && d.authorId === userId) ?? null;
  const resolved = useMemo(() => (content && def ? resolve(content, def, { role: "student" }) : null), [content, def]);
  const store = useMemo<InstanceStore | null>(() => {
    if (!ws) return null;
    const real = ws.instanceStore(instanceId, { id: userId, role: "student" });
    const refuse = async () => {
      throw new Error("mirror_read_only");
    };
    return { ...real, put: refuse as InstanceStore["put"], remove: refuse };
  }, [ws, instanceId, userId]);

  const top = (
    <TopBar title={t`Mirror · ${def?.name ?? ""}`}>
      <OnlineStatus />
      <LocaleSwitcher current={locale} />
    </TopBar>
  );
  if (!ws || !user || content === undefined) return top;
  if (!content || !def || !resolved || !store)
    return (
      <>
        {top}
        <Content>
          <EmptyState icon={<Eye size={32} />} title={t`This group is not available yet`} action={<Link className="tc-btn" to={`/activities/${id}/monitor`}>{t`Monitoring`}</Link>} />
        </Content>
      </>
    );

  const steps = resolved.steps;
  const step = steps.find((s) => s.id === state?.currentStepId) ?? null;
  const elements = step
    ? [
        ...[...resolved.activityResources, ...step.resources].map((r) => ({ key: `resource:${r.id}`, name: r.name, resource: r })),
        ...[...resolved.activityApps, ...step.apps].map((a) => ({ key: `app:${a.id}`, name: a.name, app: a })),
      ]
    : [];
  const openKey = state?.openElement ? `${state.openElement.type}:${state.openElement.id}` : null;
  const open = elements.find((e) => e.key === openKey) ?? null;

  return (
    <>
      {top}
      <Content>
        <Link to={`/activities/${id}/monitor`} style={{ alignSelf: "flex-start" }}>{t`Monitoring`}</Link>
        <Field label={t`Whose screen`}>
          <NativeSelect value={userId} onChange={(e) => setWho(e.currentTarget.value)}>
            {def.memberIds.map((m, i) => <option key={m} value={m}>{names.get(m) ?? t`Student ${i + 1}`}</option>)}
          </NativeSelect>
        </Field>
        <div inert aria-label={t`Read-only copy of the student's screen`} role="group" className="tc-mirror">
          {!step ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>{t`This student has not started yet.`}</p>
          ) : (
            <>
              <h2 className="tc-h" style={{ fontSize: "var(--text-xl)" }}>{step.title}</h2>
              {step.instructions ? <RichView html={step.instructions} /> : null}
              {elements.length > 0 ? (
                <ul style={{ margin: 0, paddingInlineStart: "var(--space-5)" }}>
                  {elements.map((e) => <li key={e.key} style={{ fontWeight: e.key === openKey ? 700 : 400 }}>{e.name}</li>)}
                </ul>
              ) : null}
              {open ? (
                <section aria-label={open.name} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {"resource" in open ? <ResourceView activityId={id} resource={open.resource} /> : <AppRuntime app={open.app} store={store} />}
                </section>
              ) : null}
            </>
          )}
        </div>
      </Content>
    </>
  );
}
