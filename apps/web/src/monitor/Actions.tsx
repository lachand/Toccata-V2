import { useLingui } from "@lingui/react/macro";
import type { AppDoc, MasterContent } from "@toccata/schema";
import { Button, Dialog, Field, Switch, TextArea } from "@toccata/ui";
import { BellRing, Lock, LockOpen, MessageSquare, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { Workspace } from "../data/workspace";
import { adjustTimer, saveFeedback, setBroadcast, setStepLockedFor } from "./orchestrate";
import type { GroupSummary } from "./summary";

type Ctx = { ws: Workspace; ownerId: string };

const fullMsOf = (content: MasterContent, appId: string) => {
  const a = content.apps.find((x): x is Extract<AppDoc, { type: "timer" }> => x.id === appId && x.type === "timer");
  return (a?.config.durationSec ?? 0) * 1000;
};

/** Gestes de pilotage applicables à plusieurs groupes à la fois (tous, ou ceux qui sont cochés). */
export function ActionBar({ ctx, content, targets, scopeLabel }: { ctx: Ctx; content: MasterContent; targets: readonly GroupSummary[]; scopeLabel: string }) {
  const { t } = useLingui();
  const [dialog, setDialog] = useState<"message" | "attention" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };
  const timers = (change: Parameters<typeof adjustTimer>[4] extends infer C ? (full: number) => C : never) =>
    run(() => Promise.all(targets.flatMap((g) => g.timers.map((tm) => adjustTimer(ctx, g.instanceId, tm.appId, fullMsOf(content, tm.appId), change(fullMsOf(content, tm.appId)))))));
  const send = (mode: "message" | "attention", body: string, active: boolean) => run(() => Promise.all(targets.map((g) => setBroadcast(ctx, g.instanceId, mode, body, active))));
  const disabled = busy || targets.length === 0;

  return (
    <section aria-label={t`Actions for the groups`} className="tc-actionbar">
      <p style={{ margin: 0, color: "var(--muted)" }}>{scopeLabel}</p>
      <div className="tc-actionbar__row">
        <Button icon={<Plus size={16} />} disabled={disabled} onClick={() => void timers(() => ({ type: "extend", ms: 60_000 }))}>{t`+1 min`}</Button>
        <Button icon={<Plus size={16} />} disabled={disabled} onClick={() => void timers(() => ({ type: "extend", ms: 300_000 }))}>{t`+5 min`}</Button>
        <Button icon={<RotateCcw size={16} />} disabled={disabled} onClick={() => void timers(() => ({ type: "reset" }))}>{t`Reset timers`}</Button>
        <Button icon={<MessageSquare size={16} />} disabled={disabled} onClick={() => (setText(""), setDialog("message"))}>{t`Send a message`}</Button>
        <Button icon={<BellRing size={16} />} disabled={disabled} onClick={() => (setText(""), setDialog("attention"))}>{t`Get attention`}</Button>
        <Button disabled={disabled} onClick={() => void send("attention", "", false)}>{t`Release attention`}</Button>
        <Button disabled={disabled} onClick={() => void send("message", "", false)}>{t`Clear message`}</Button>
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === "attention" ? t`Get everyone's attention` : t`Send a message`}
        description={dialog === "attention" ? t`Students' screens are frozen until you release attention.` : t`Students see it at the top of their screen.`}
        closeLabel={t`Close`}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>{t`Cancel`}</Button>
            <Button variant="primary" loading={busy} disabled={dialog === "message" && !text.trim()} onClick={() => dialog && void send(dialog, text.trim(), true).then(() => setDialog(null))}>{dialog === "attention" ? t`Freeze screens` : t`Send`}</Button>
          </>
        }
      >
        <Field label={dialog === "attention" ? t`Message (optional)` : t`Message`}>
          <TextArea rows={3} maxLength={500} value={text} onChange={(e) => setText(e.currentTarget.value)} autoFocus />
        </Field>
      </Dialog>
    </section>
  );
}

/** Gestes propres à un groupe : retour sur l'étape en cours, verrou de l'étape suivante. */
export function TileActions({ ctx, content, g }: { ctx: Ctx; content: MasterContent; g: GroupSummary }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button disabled={g.stepId === null} onClick={() => (setBody(""), setAccepted(false), setOpen(true))}>{t`Feedback`}</Button>
      {g.nextStepId ? (
        <Button icon={g.nextLocked ? <LockOpen size={16} /> : <Lock size={16} />} onClick={() => void setStepLockedFor(ctx.ws, g.instanceId, g.nextStepId!, !g.nextLocked, content)}>
          {g.nextLocked ? t`Unlock next step` : t`Lock next step`}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t`Feedback for ${g.name}`}
        description={g.stepTitle ?? ""}
        closeLabel={t`Close`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t`Cancel`}</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!body.trim() && !accepted}
              onClick={() => {
                setBusy(true);
                void saveFeedback(ctx, g.instanceId, g.stepId!, { body: body.trim(), accepted }).finally(() => (setBusy(false), setOpen(false)));
              }}
            >
              {t`Send feedback`}
            </Button>
          </>
        }
      >
        <Field label={t`Comment`}>
          <TextArea rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.currentTarget.value)} autoFocus />
        </Field>
        <Switch label={t`Mark the step as validated`} checked={accepted} onCheckedChange={setAccepted} />
      </Dialog>
    </>
  );
}
