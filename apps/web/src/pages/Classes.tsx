import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button, Card, Content, Dialog, EmptyState, Field, Pill, TextInput, TopBar } from "@toccata/ui";
import { Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { classesApi, type ClassSummary } from "../auth/api";
import { session } from "../auth/session";
import { useErrorText } from "../auth/useErrorText";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OnlineStatus } from "../components/Layout";
import type { Locale } from "../i18n";

export const api = () => classesApi(session.authorizedFetch, () => session.getAccessToken());

export function Classes({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    api().list().then(setClasses, (e) => setError(e));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    setBusy(true);
    setFormError(null);
    try {
      const k = await api().create(name);
      navigate(`/classes/${k.id}`);
    } catch (err) {
      setFormError(err);
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title={t`Classes`}>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setOpen(true)}>{t`New class`}</Button>
      </TopBar>
      <Content>
        {error ? (
          <p role="alert" className="tc-field__error" style={{ margin: 0 }}>
            {errorText(error)} <Button variant="ghost" onClick={load}>{t`Retry`}</Button>
          </p>
        ) : classes === null ? null : classes.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title={t`No class yet`} description={t`Create a class to add your students.`} action={<Button variant="primary" onClick={() => setOpen(true)}>{t`New class`}</Button>} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {classes.map((k) => {
              const count = k.studentCount;
              return (
                <li key={k.id} style={{ display: "contents" }}>
                  <Card as="article" aria-labelledby={`k-${k.id}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <h2 className="tc-h" id={`k-${k.id}`} style={{ fontSize: "var(--text-lg)" }}>{k.name}</h2>
                    <Pill>{plural(count, { one: "# student", other: "# students" })}</Pill>
                    <Link className="tc-btn" to={`/classes/${k.id}`} style={{ alignSelf: "flex-start" }}>{t`Open`}</Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Content>
      <Dialog open={open} onOpenChange={setOpen} title={t`New class`} closeLabel={t`Close`}>
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {formError ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{errorText(formError)}</p> : null}
          <Field label={t`Class name`} hint={t`For example: 4th grade B`}>
            <TextInput name="name" required maxLength={80} autoFocus />
          </Field>
          <Button type="submit" variant="primary" loading={busy}>{t`Create class`}</Button>
        </form>
      </Dialog>
    </>
  );
}
