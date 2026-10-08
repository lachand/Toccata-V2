import { useLingui } from "@lingui/react/macro";
import { useSession } from "../auth/session";
import { Button, Card, Content, Dialog, EmptyState, Field, IconButton, NativeSelect, Switch, TextArea, TextInput, TopBar, type StepItem } from "@toccata/ui";
import { ArrowLeft, ArrowRight, ListPlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { inertStore } from "../apps/inertStore";
import { TargetPicker } from "../content/TargetPicker";
import { useTargetedEdit } from "../content/useTargetedEdit";
import { NotesPanel } from "../content/NotesPanel";
import { ContentPanel } from "../content/ContentPanel";
import { RichEditor } from "../richtext/RichEditor";
import { SortableTimeline } from "../components/SortableTimeline";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OnlineStatus } from "../components/Layout";
import { useContent, useGroups, useNotes, usePreviewStore } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";

/** Éditeur de script (primo-scripting, D4) : l'activité et ses étapes. Les ressources et applications arrivent ensuite. */
export function ActivityEditor({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const { id = "" } = useParams();
  const ws = useWorkspace();
  const content = useContent(id);
  const groups = useGroups(id);
  const target = useTargetedEdit(ws, id, content, groups);
  const notes = useNotes(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { user } = useSession();
  const preview = usePreviewStore(id);
  const store = useMemo(() => preview ?? inertStore({ id: user?.id ?? "", role: "teacher" }), [preview, user?.id]);

  const steps = useMemo(() => [...(content?.steps ?? [])].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1)), [content]);
  const current = steps.find((s) => s.id === selected) ?? steps[0] ?? null;
  const index = current ? steps.findIndex((s) => s.id === current.id) : -1;

  const top = (
    <TopBar title={content?.activity.title ?? t`Activity`}>
      <OnlineStatus />
      <LocaleSwitcher current={locale} />
      <Link className="tc-btn" to={`/activities/${id}/monitor`}>{t`Monitoring`}</Link>
      <Link className="tc-btn tc-btn--primary" to={`/activities/${id}/distribute`}>{t`Distribute`}</Link>
    </TopBar>
  );

  if (content === undefined || !ws) return top;
  if (content === null)
    return (
      <>
        {top}
        <Content>
          <EmptyState title={t`This activity is not on this device yet`} description={t`It will appear as soon as the connection allows it to sync.`} action={<Link className="tc-btn" to="/">{t`Back to activities`}</Link>} />
        </Content>
      </>
    );

  const items: StepItem[] = steps.map((s) => ({ id: s.id, label: s.title || t`Untitled step`, state: s.id === current?.id ? "active" : "todo", hidden: s.hidden }));

  async function add() {
    const stepId = await ws!.addStep(id, t`New step`, current?.id);
    setSelected(stepId);
  }

  return (
    <>
      {top}
      <Content>
        <Link to="/" style={{ alignSelf: "flex-start" }}>{t`Back to activities`}</Link>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Field label={t`Activity title`}>
            <TextInput key={`title-${id}`} defaultValue={content.activity.title} maxLength={200} onBlur={(e) => void ws.patchActivity(id, { title: e.currentTarget.value.trim() || content.activity.title })} />
          </Field>
          <Field label={t`Description`}>
            <TextArea key={`desc-${id}`} defaultValue={content.activity.description} rows={3} maxLength={10_000} onBlur={(e) => void ws.patchActivity(id, { description: e.currentTarget.value })} />
          </Field>
          <ContentPanel ws={ws} activityId={id} content={content} scope={{ type: "activity" }} heading={t`Resources and apps for the whole activity`} headingLevel={2} store={store} />
          <NotesPanel ws={ws} activityId={id} stepId={null} note={notes.find((n) => n.stepId === null)} heading={t`Notes on the activity`} headingLevel={2} />
        </Card>

        {target.hasGroups ? <TargetPicker target={target} groups={groups} /> : null}

        <SortableTimeline
          onMove={(stepId, to) => void ws.moveStep(id, stepId, to)}
          steps={items}
          labels={{
            list: t`Steps`,
            stateDone: t`done`,
            stateLocked: t`locked`,
            stateHidden: t`hidden from students`,
            hide: (label) => t`Hide “${label}” from students`,
            show: (label) => t`Show “${label}” to students`,
            add: t`Add a step`,
          }}
          onSelect={setSelected}
          onToggleHidden={(stepId, hidden) => void target.apply({ type: "setStepHidden", stepId, hidden })}
          onAdd={() => void add()}
        />

        {!current ? (
          <EmptyState icon={<ListPlus size={32} />} title={t`No step yet`} description={t`A script is a sequence of steps. Add the first one.`} action={<Button variant="primary" onClick={() => void add()}>{t`Add the first step`}</Button>} />
        ) : (
          <Card as="section" aria-label={t`Selected step`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }} key={current.id}>
            <h2 className="tc-h" style={{ fontSize: "var(--text-lg)" }}>{t`Step ${index + 1}`}</h2>
            <Field label={t`Step title`}>
              <TextInput defaultValue={current.title} maxLength={200} onBlur={(e) => e.currentTarget.value.trim() !== current.title && void target.apply({ type: "patchStep", stepId: current.id, patch: { title: e.currentTarget.value.trim() } })} />
            </Field>
            <Field label={t`Instructions`} hint={t`Shown to students at the top of the step.`}>
              <RichEditor label={t`Instructions`} value={current.instructions} onCommit={(html) => html !== current.instructions && void target.apply({ type: "patchStep", stepId: current.id, patch: { instructions: html } })} />
            </Field>
            <ContentPanel ws={ws} activityId={id} content={content} scope={{ type: "step", stepId: current.id }} heading={t`Resources and apps for this step`} store={store} />
            {content.apps.some((a) => a.type === "form" && a.scope.type === "step" && a.scope.stepId === current.id) ? (
              <Field label={t`Step locked until a questionnaire is submitted`} hint={t`Students stay on this step until they have submitted the chosen questionnaire.`}>
                <NativeSelect value={current.blockedByAppId ?? ""} onChange={(e) => void ws.patchStep(id, current.id, { blockedByAppId: e.currentTarget.value || null })}>
                  <option value="">{t`No lock`}</option>
                  {content.apps.filter((a) => a.type === "form" && a.scope.type === "step" && a.scope.stepId === current.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </NativeSelect>
              </Field>
            ) : null}
            <NotesPanel ws={ws} activityId={id} stepId={current.id} note={notes.find((n) => n.stepId === current.id)} heading={t`Notes on this step`} />
            <Switch label={t`Visible to students`} checked={!current.hidden} onCheckedChange={(v) => void target.apply({ type: "setStepHidden", stepId: current.id, hidden: !v })} />
            <Switch label={t`Locked for students`} checked={current.locked} onCheckedChange={(v) => void target.apply({ type: "setStepLocked", stepId: current.id, locked: v })} />
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <IconButton label={t`Move earlier`} disabled={index <= 0} onClick={() => void ws.moveStep(id, current.id, index - 1)}><ArrowLeft size={18} /></IconButton>
              <IconButton label={t`Move later`} disabled={index >= steps.length - 1} onClick={() => void ws.moveStep(id, current.id, index + 1)}><ArrowRight size={18} /></IconButton>
              <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>{t`Delete step`}</Button>
            </div>
          </Card>
        )}
      </Content>
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t`Delete this step?`}
        description={t`The step and its content are removed for everyone. This cannot be undone.`}
        closeLabel={t`Close`}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>{t`Cancel`}</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (current) void ws.removeStep(id, current.id);
                setSelected(null);
                setConfirmDelete(false);
              }}
            >
              {t`Delete`}
            </Button>
          </>
        }
      />
    </>
  );
}
