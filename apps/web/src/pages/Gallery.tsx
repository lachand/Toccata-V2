import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Avatar, AvatarGroup, Button, Card, Content, Dialog, EmptyState, Field, IconButton, NativeSelect, Pill, StepTimeline, Switch, SyncStatus, TextInput, TimerChip, TopBar, type StepItem, type StepTimelineLabels } from "@toccata/ui";
import { Eye, Inbox } from "lucide-react";
import { useState } from "react";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import type { Locale } from "../i18n";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card as="section" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <h2 className="tc-h" style={{ fontSize: "var(--text-lg)" }}>{title}</h2>
      {children}
    </Card>
  );
}

/** Catalogue des composants, dans la langue active : sert aussi de test visuel des libellés fr/en. */
export function Gallery({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(true);
  const [hidden, setHidden] = useState(true);
  const labels: StepTimelineLabels = {
    list: t`Steps`,
    stateDone: t`done`,
    stateLocked: t`locked`,
    stateHidden: t`hidden from students`,
    hide: (s) => t`Hide step ${s}`,
    show: (s) => t`Show step ${s}`,
    add: t`Add a step`,
  };
  const steps: StepItem[] = [
    { id: "a", label: t`Backlog`, state: "done" },
    { id: "b", label: t`Estimate`, state: "active" },
    { id: "c", label: t`Build`, state: "locked" },
    { id: "d", label: t`Bonus`, state: "todo", hidden },
  ];
  const pendingCount = 3;
  const people = [{ name: "Lina Aubert" }, { name: "Hugo Martin" }, { name: "Emma Roux" }, { name: "Noah Petit" }, { name: "Zoé Blanc" }, { name: "Yanis Fort" }];

  return (
    <>
      <TopBar title={t`Components`}>
        <LocaleSwitcher current={locale} />
      </TopBar>
      <StepTimeline steps={steps} labels={labels} onSelect={() => {}} onToggleHidden={(id, h) => id === "d" && setHidden(h)} onAdd={() => {}} />
      <Content>
        <Section title={t`Buttons`}>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="primary">{t`Hand out`}</Button>
            <Button>{t`Student preview`}</Button>
            <Button variant="ghost">{t`Cancel`}</Button>
            <Button variant="danger">{t`Delete`}</Button>
            <Button loading>{t`Saving`}</Button>
            <Button disabled>{t`Unavailable`}</Button>
            <IconButton label={t`Show to students`}><Eye size={18} /></IconButton>
            <Button variant="primary" size="lg">{t`I've finished the step`}</Button>
          </div>
        </Section>
        <Section title={t`Status`}>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
            <Pill tone="ok">{t`On time`}</Pill>
            <Pill tone="warn">{t`One step behind`}</Pill>
            <Pill tone="crit">{t`Needs help`}</Pill>
            <Pill tone="accent">{t`In progress`}</Pill>
            <SyncStatus state="online" label={t`Online`} />
            <SyncStatus state="syncing" label={t`Syncing`} />
            <SyncStatus state="pending" label={plural(pendingCount, { one: "# change waiting to sync", other: "# changes waiting to sync" })} />
            <SyncStatus state="offline" label={t`Offline, your changes are kept`} />
            <TimerChip remainingMs={9 * 60_000 + 30_000} label={t`Time left`} />
            <TimerChip remainingMs={4 * 60_000 + 10_000} label={t`Time left`} />
            <TimerChip remainingMs={95_000} label={t`Time left`} />
          </div>
        </Section>
        <Section title={t`People`}>
          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
            <Avatar name="Lina Aubert" colorIndex={0} size="lg" />
            <AvatarGroup people={people} max={4} overflowLabel={(hidden) => plural(hidden, { one: "# other person", other: "# other people" })} />
          </div>
        </Section>
        <Section title={t`Form controls`}>
          <div style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Field label={t`Activity name`} hint={t`200 characters at most`}>
              <TextInput placeholder={t`For example: Fact-checking`} />
            </Field>
            <Field label={t`Step name`} error={t`The name is required`} required>
              <TextInput />
            </Field>
            <Field label={t`Display mode`}>
              <NativeSelect defaultValue="iframe">
                <option value="iframe">{t`Embedded`}</option>
                <option value="window">{t`Linked window`}</option>
                <option value="link">{t`Link`}</option>
              </NativeSelect>
            </Field>
          </div>
          <Switch label={t`Visible to students`} checked={on} onCheckedChange={setOn} />
        </Section>
        <Section title={t`Dialog and empty state`}>
          <div><Button onClick={() => setOpen(true)}>{t`Add a resource`}</Button></div>
          <Dialog open={open} onOpenChange={setOpen} title={t`Add a resource`} description={t`Choose a file or paste a link.`} closeLabel={t`Close`} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t`Cancel`}</Button><Button variant="primary" onClick={() => setOpen(false)}>{t`Add`}</Button></>}>
            <Field label={t`Link`}><TextInput inputMode="url" placeholder="https://" /></Field>
          </Dialog>
          <EmptyState icon={<Inbox size={32} />} title={t`No resource yet`} description={t`Add documents, images or web pages for this step.`} headingLevel={3} />
        </Section>
      </Content>
    </>
  );
}
