import { useLingui } from "@lingui/react/macro";
import type { InstanceStore } from "@toccata/apps-sdk";
import { resolve, type AppDoc, type BroadcastDoc, type FeedbackDoc, type InstanceScopedDoc, type ResourceDoc, type SubmissionDoc } from "@toccata/schema";
import { Button, Content, EmptyState, Segmented, StepTimeline, TopBar, type StepItem } from "@toccata/ui";
import { ArrowLeft, ArrowRight, Hourglass } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AppRuntime } from "../run/AppRuntime";
import { useSession } from "../auth/session";
import { OnlineStatus } from "../components/Layout";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { ResourceView } from "../content/ResourceView";
import { useContent, useInstanceDef, useParticipant, useRuns } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";
import { AttentionOverlay, MessageBanner, StepProgressPanel } from "../run/Orchestration";
import { logEvent } from "../data/events";
import { saveSubmission } from "../run/submit";
import { RichView } from "../richtext/RichView";
import { reachableCount, resumeIndex } from "../run/progress";

type Element = { key: string; type: "resource" | "app"; id: string; name: string; resource?: ResourceDoc; app?: AppDoc };

/** Appareil courant, pour savoir d'où vient le dernier état enregistré (roaming d'un appareil à l'autre). */
function deviceId(): string {
  try {
    let d = localStorage.getItem("toccata.device");
    if (!d) localStorage.setItem("toccata.device", (d = crypto.randomUUID().slice(0, 8)));
    return d;
  } catch {
    return "anonymous";
  }
}

/** Identifiants des questionnaires déjà envoyés par la personne, parmi `appIds`. */
function useSubmitted(store: InstanceStore | null, appIds: readonly string[]): Set<string> {
  const [done, setDone] = useState<Set<string>>(new Set());
  const key = appIds.join(",");
  useEffect(() => {
    if (!store) return;
    const stops = appIds.map((appId) =>
      store.watch("formanswer", appId, (docs) => {
        const sent = docs.some((d) => d.authorId === store.viewer.id && d.submitted);
        setDone((prev) => (prev.has(appId) === sent ? prev : (sent ? new Set(prev).add(appId) : (prev.delete(appId), new Set(prev)))));
      }),
    );
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume `appIds`
  }, [store, key]);
  return done;
}

/** Séance d'un participant : le script de son groupe, une étape à la fois, un seul élément ouvert à la fois (D6 de l'article). */
export function Run({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const { instanceId = "" } = useParams();
  const ws = useWorkspace();
  const { user } = useSession();
  const runs = useRuns();
  const run = runs?.find((r) => r.instanceId === instanceId) ?? null;
  const content = useContent(run?.activityId ?? null);
  const def = useInstanceDef(instanceId, content?.activity.ownerId ?? null);
  const saved = useParticipant(instanceId, user?.id ?? "");
  const store = useMemo(() => (ws && user ? ws.instanceStore(instanceId, { id: user.id, role: user.role }) : null), [ws, user, instanceId]);

  // consignes de l'enseignant, retours et remises : un seul flux sur la base de l'instance
  const [docs, setDocs] = useState<InstanceScopedDoc[]>([]);
  useEffect(() => {
    if (!ws) return;
    const s = ws.instanceDocs$(instanceId).subscribe(setDocs);
    return () => s.unsubscribe();
  }, [ws, instanceId]);
  const ownerId = content?.activity.ownerId ?? null;
  const latestOf = <T extends { updatedAt: number }>(list: T[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  // seuls les documents de l'enseignant propriétaire font foi pour les consignes et les retours
  const message = latestOf(docs.filter((d): d is BroadcastDoc => d.kind === "broadcast" && d.authorId === ownerId && d.mode === "message"));
  const attention = latestOf(docs.filter((d): d is BroadcastDoc => d.kind === "broadcast" && d.authorId === ownerId && d.mode === "attention"));
  const feedbackFor = (stepId: string) => latestOf(docs.filter((d): d is FeedbackDoc => d.kind === "feedback" && d.authorId === ownerId && d.stepId === stepId));
  const submissionFor = (stepId: string) => latestOf(docs.filter((d): d is SubmissionDoc => d.kind === "submission" && d.authorId === user?.id && d.stepId === stepId));

  const resolved = useMemo(() => (content && def ? resolve(content, def, { role: "student" }) : null), [content, def]);
  const steps = resolved?.steps ?? [];
  const blockers = useMemo(() => [...new Set(steps.map((s) => s.blockedByAppId).filter((x): x is string => x !== null))], [steps]);
  const submitted = useSubmitted(store, blockers);

  const [index, setIndex] = useState<number | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** Vrai dès que la personne a elle-même navigué : à partir de là, l'état reçu ne déplace plus l'écran et notre position est enregistrée. */
  const touched = useRef(false);
  // « présence » : une personne qui ouvre la séance sans rien toucher doit quand même apparaître au suivi. On attend un court
  // instant que la position déjà enregistrée (autre appareil) arrive ; sinon on enregistre le point de départ. Si le serveur avait
  // déjà un état, il l'emporte au rattachement (conflit de réplication : le serveur gagne) : on n'écrase donc rien.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => setSettled(true), 2000);
    return () => clearTimeout(h);
  }, []);

  // reprise : on rouvre l'étape et l'élément laissés ouverts, sur n'importe quel appareil. Les données arrivent par la
  // réplication, dans le désordre (script, position, questionnaires envoyés) : on recalcule tant que personne n'a rien touché.
  useEffect(() => {
    if (touched.current || !resolved || saved === undefined) return;
    setIndex(resumeIndex(steps, submitted, saved?.currentStepId ?? null));
    setOpenKey(saved?.openElement ? `${saved.openElement.type}:${saved.openElement.id}` : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `steps` dérive de `resolved`
  }, [resolved, saved, submitted]);

  const reachable = reachableCount(steps, submitted);
  const current = index !== null && index >= 0 ? steps[Math.min(index, steps.length - 1)] : undefined;
  const elements: Element[] = current && resolved
    ? [
        ...[...resolved.activityResources, ...current.resources].map((r) => ({ key: `resource:${r.id}`, type: "resource" as const, id: r.id, name: r.name, resource: r })),
        ...[...resolved.activityApps, ...current.apps].map((a) => ({ key: `app:${a.id}`, type: "app" as const, id: a.id, name: a.name, app: a })),
      ]
    : [];
  const open = elements.find((e) => e.key === openKey) ?? null;

  // enregistrement de la position (un document par personne) : léger délai pour ne pas écrire à chaque clic
  useEffect(() => {
    if (!ws || !user || !current || !(touched.current || (settled && saved === null))) return;
    const h = setTimeout(() => void ws.saveParticipant(instanceId, user.id, { currentStepId: current.id, openElement: open ? { type: open.type, id: open.id } : null }, deviceId()), 500);
    return () => clearTimeout(h);
  }, [ws, user, instanceId, current?.id, open?.key, settled, saved === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // première ouverture de la séance : l'entrée dans la première étape est aussi un geste du journal (reprises : rien, pour ne pas compter l'absence)
  const loggedFirst = useRef(false);
  useEffect(() => {
    if (loggedFirst.current || !ws || !user || !current || !settled || saved !== null || touched.current) return;
    loggedFirst.current = true;
    void logEvent(ws, instanceId, user.id, "step.enter", { object: current.id });
  }, [ws, user, instanceId, current?.id, settled, saved === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (i: number) => {
    touched.current = true;
    setIndex(i);
    setOpenKey(null);
    const target = steps[i];
    if (target && user) void logEvent(ws!, instanceId, user.id, "step.enter", { object: target.id });
  };
  const openElement = (key: string | null) => {
    touched.current = true;
    setOpenKey(key);
    if (key && user) void logEvent(ws!, instanceId, user.id, "element.open", { object: key.split(":")[1] ?? key, meta: { type: key.split(":")[0] ?? "" } });
  };
  const top = (title: string) => (
    <TopBar title={title}>
      <OnlineStatus />
      <LocaleSwitcher current={locale} />
    </TopBar>
  );

  if (!ws || !user || runs === null) return top(t`Activity`);
  if (!run || content === null || def === null)
    return (
      <>
        {top(content?.activity.title ?? t`Activity`)}
        <Content>
          <EmptyState icon={<Hourglass size={32} />} title={t`Getting your activity…`} description={t`It will appear here as soon as it has been received. You can keep this page open.`} action={<Link className="tc-btn" to="/">{t`Back to activities`}</Link>} />
        </Content>
      </>
    );
  if (!resolved || content === undefined || def === undefined || index === null) return top(content?.activity.title ?? t`Activity`);

  const items: StepItem[] = steps.map((s, i) => ({ id: s.id, label: s.title || t`Untitled step`, state: i >= reachable ? "locked" : i === index ? "active" : i < index ? "done" : "todo" }));
  const last = index >= steps.length - 1;

  return (
    <>
      <AttentionOverlay attention={attention} />
      <div inert={attention?.active ? true : undefined}>
      {top(resolved.title)}
      <MessageBanner message={message} />
      <StepTimeline
        steps={items}
        labels={{ list: t`Steps`, stateDone: t`done`, stateLocked: t`locked`, stateHidden: t`hidden from students`, hide: (l) => l, show: (l) => l, add: "" }}
        onSelect={(id) => go(steps.findIndex((s) => s.id === id))}
      />
      <Content>
        {!current ? (
          <EmptyState title={t`Nothing to do yet`} description={t`Your teacher has not opened any step.`} />
        ) : (
          <>
            <h2 className="tc-h" style={{ fontSize: "var(--text-xl)" }}>{current.title}</h2>
            {current.instructions ? <RichView html={current.instructions} /> : null}
            {elements.length > 0 ? (
              <>
                <Segmented label={t`Open an item`} value={open?.key ?? ""} onChange={(v) => openElement(v === openKey ? null : v)} options={elements.map((e) => ({ value: e.key, label: e.name }))} />
                {open ? (
                  <section aria-label={open.name} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    {open.resource ? <ResourceView activityId={run.activityId} resource={open.resource} /> : null}
                    {open.app && store ? <AppRuntime app={open.app} store={store} /> : null}
                  </section>
                ) : null}
              </>
            ) : null}
            <StepProgressPanel
              submission={submissionFor(current.id)}
              feedback={feedbackFor(current.id)}
              onStatus={(status) => {
                void saveSubmission(ws, instanceId, user.id, current.id, { status });
                void logEvent(ws, instanceId, user.id, status === "submitted" ? "submission.submitted" : status === "needs_help" ? "submission.needs_help" : "submission.cleared", { object: current.id });
              }}
              onAssess={(n) => {
                void saveSubmission(ws, instanceId, user.id, current.id, { selfAssessment: n });
                void logEvent(ws, instanceId, user.id, "self_assessment.set", { object: current.id, meta: { score: n } });
              }}
            />
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <Button icon={<ArrowLeft size={16} />} disabled={index <= 0} onClick={() => go(index - 1)}>{t`Previous step`}</Button>
              <Button variant="primary" icon={<ArrowRight size={16} />} disabled={last || index + 1 >= reachable} onClick={() => go(index + 1)}>{t`Next step`}</Button>
            </div>
            {!last && index + 1 >= reachable && steps[index]?.blockedByAppId ? <p role="status" style={{ margin: 0, color: "var(--muted)" }}>{t`Submit the questionnaire to move on.`}</p> : null}
            {!last && index + 1 >= reachable && !steps[index]?.blockedByAppId ? <p role="status" style={{ margin: 0, color: "var(--muted)" }}>{t`The next step is not open yet.`}</p> : null}
          </>
        )}
      </Content>
      </div>
    </>
  );
}
