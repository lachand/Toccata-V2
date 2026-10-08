import { useLingui } from "@lingui/react/macro";
import { Avatar, Button, Card, Content, Dialog, Field, TextArea, TopBar } from "@toccata/ui";
import { Download, KeyRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import type { NewStudent, StudentSummary } from "../auth/api";
import { useErrorText } from "../auth/useErrorText";
import { CredentialsSheet } from "../components/CredentialsSheet";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OnlineStatus } from "../components/Layout";
import type { Locale } from "../i18n";
import { download } from "../review/download";
import { api } from "./Classes";

export function ClassDetail({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const { id = "" } = useParams();
  const [cls, setCls] = useState<{ name: string; students: StudentSummary[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<NewStudent[] | null>(null);
  const [toRemove, setToRemove] = useState<StudentSummary | null>(null);

  const load = useCallback(() => {
    api().get(id).then((c) => { setCls(c); setError(null); }, setError);
  }, [id]);
  useEffect(load, [load]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const names = String(new FormData(form).get("names") ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().addStudents(id, names);
      setFresh(r.students);
      form.reset();
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function reset(s: StudentSummary) {
    try {
      const r = await api().resetPassword(id, s.id);
      setFresh([{ ...s, passphrase: r.passphrase }]);
    } catch (err) {
      setError(err);
    }
  }

  async function exportData(s: StudentSummary) {
    try {
      download(`toccata-${s.username}.json`, "application/json", JSON.stringify(await api().exportStudent(id, s.id), null, 2));
    } catch (e) {
      setError(e);
    }
  }

  async function remove(s: StudentSummary) {
    try {
      await api().removeStudent(id, s.id);
      setToRemove(null);
      load();
    } catch (err) {
      setError(err);
      setToRemove(null);
    }
  }

  return (
    <>
      <TopBar title={cls?.name ?? t`Class`}>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
      </TopBar>
      <Content>
        {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{errorText(error)}</p> : null}
        {fresh ? <Card><CredentialsSheet students={fresh} origin={window.location.origin} onClose={() => setFresh(null)} /></Card> : null}

        <Card as="section" aria-labelledby="add-students" className="no-print" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h2 className="tc-h" id="add-students" style={{ fontSize: "var(--text-lg)" }}>{t`Add students`}</h2>
          <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <Field label={t`Student names`} hint={t`One name per line, 60 at most. Each student gets a username and a passphrase.`}>
              <TextArea name="names" rows={6} />
            </Field>
            <div><Button type="submit" variant="primary" loading={busy}>{t`Create accounts`}</Button></div>
          </form>
        </Card>

        <Card as="section" aria-labelledby="roster" className="no-print" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h2 className="tc-h" id="roster" style={{ fontSize: "var(--text-lg)" }}>{t`Students`}</h2>
          {cls && cls.students.length === 0 ? <p style={{ margin: 0, color: "var(--muted)" }}>{t`No student yet.`}</p> : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {cls?.students.map((s) => {
              const name = s.displayName;
              return (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--space-2) var(--space-3)" }}>
                <Avatar name={s.displayName} />
                <span style={{ marginInlineEnd: "auto" }}><strong>{s.displayName}</strong> <span className="tc-mono" style={{ color: "var(--muted)" }}>{s.username}</span></span>
                <Button icon={<KeyRound size={16} />} onClick={() => void reset(s)} aria-label={t`New passphrase for ${name}`}>{t`New passphrase`}</Button>
                <Button icon={<Download size={16} />} onClick={() => void exportData(s)} aria-label={t`Download the data of ${name}`}>{t`Data`}</Button>
                <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setToRemove(s)} aria-label={t`Remove ${name}`}>{t`Remove`}</Button>
              </li>
              );
            })}
          </ul>
        </Card>
      </Content>

      <Dialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title={t`Remove this student?`}
        description={t`The account, its sessions and everything this student wrote during activities will be deleted. This cannot be undone.`}
        closeLabel={t`Close`}
        footer={<><Button variant="ghost" onClick={() => setToRemove(null)}>{t`Cancel`}</Button><Button variant="danger" onClick={() => toRemove && void remove(toRemove)}>{t`Remove`}</Button></>}
      >
        {toRemove ? <p style={{ margin: 0 }}><strong>{toRemove.displayName}</strong></p> : null}
      </Dialog>
    </>
  );
}
