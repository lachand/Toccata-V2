import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button, Card, Content, Dialog, EmptyState, Field, Pill, TextInput, TopBar } from "@toccata/ui";
import { BookPlus, Copy, Download, Plus, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { activitiesApi } from "../auth/api";
import { session, useSession } from "../auth/session";
import { useErrorText } from "../auth/useErrorText";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OnlineStatus } from "../components/Layout";
import { useActivities, useRuns } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import { createFromBundle, duplicateActivity, exportActivity } from "../exchange/activities";
import { ImportError, unpackBundle } from "../exchange/zip";
import type { Locale } from "../i18n";

export function Activities({ locale }: { locale: Locale }) {
  const { t, i18n } = useLingui();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const { user } = useSession();
  const teacher = user?.role === "teacher";
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const api = { create: () => activitiesApi(session.authorizedFetch, () => session.getAccessToken()).create() };

  /** Importe un `.toccata` : une activité neuve, ouverte aussitôt dans l'éditeur. */
  async function importFile(file: File) {
    if (!ws || !user) return;
    setExchangeError(null);
    setNotice(null);
    try {
      const { bundle, files } = await unpackBundle(file);
      const out = await createFromBundle(ws, api, user.id, bundle, files);
      if (out.missingFiles > 0) setNotice(plural(out.missingFiles, { one: "# file was missing from the archive and was left out.", other: "# files were missing from the archive and were left out." }));
      navigate(`/activities/${out.id}`);
    } catch (e) {
      setExchangeError(e instanceof ImportError ? importErrorText(e.code) : errorText(e));
    }
  }
  const importErrorText = (code: ImportError["code"]) =>
    code === "unsupported_version" ? t`This file comes from a newer version of Toccata.` : code === "too_large" ? t`This archive is too large.` : code === "file_mismatch" ? t`A file in this archive is damaged.` : code === "invalid" ? t`This file does not describe a valid activity.` : t`This is not a Toccata activity file (.toccata).`;

  async function duplicate(id: string, title: string) {
    if (!ws || !user) return;
    setExchangeError(null);
    try {
      const out = await duplicateActivity(ws, api, user.id, id, t`Copy of ${title}`);
      navigate(`/activities/${out.id}`);
    } catch (e) {
      setExchangeError(errorText(e));
    }
  }
  async function exportOne(id: string) {
    if (!ws) return;
    const { blob, filename, missingFiles } = await exportActivity(ws, id);
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setNotice(missingFiles > 0 ? plural(missingFiles, { one: "# file is not available on this device and was left out of the export.", other: "# files are not available on this device and were left out of the export." }) : null);
  }
  const teacherRows = useActivities();
  const runs = useRuns();
  // l'élève voit ses séances (une par inscription) ; l'enseignant ses activités
  const rows = teacher ? teacherRows : runs === null ? null : [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
    if (!title || !ws || !user) return;
    setBusy(true);
    setError(null);
    try {
      // le serveur approvisionne la base et les droits ; le contenu est écrit localement puis synchronisé
      const { id } = await activitiesApi(session.authorizedFetch, () => session.getAccessToken()).create();
      await ws.createActivity(id, user.id, title, locale);
      navigate(`/activities/${id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const newButton = <Button variant="primary" icon={<Plus size={18} />} onClick={() => setOpen(true)}>{t`New activity`}</Button>;

  return (
    <>
      <TopBar title={t`My activities`}>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
        {teacher ? (
          <>
            <Button icon={<Upload size={18} />} onClick={() => fileInput.current?.click()}>{t`Import`}</Button>
            <input ref={fileInput} type="file" accept=".toccata,application/x-toccata,application/zip" hidden aria-label={t`Activity file to import`} onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void importFile(f); }} />
            {newButton}
          </>
        ) : null}
      </TopBar>
      <Content>
        {exchangeError ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{exchangeError}</p> : null}
        {notice ? <p role="status" className="tc-callout">{notice}</p> : null}
        {!teacher && runs !== null && runs.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {runs.map((r) => (
              <li key={r.instanceId} style={{ display: "contents" }}>
                <Card as="article" aria-labelledby={`r-${r.instanceId}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  <h2 className="tc-h" id={`r-${r.instanceId}`} style={{ fontSize: "var(--text-lg)" }}>{r.title ?? t`Loading…`}</h2>
                  {r.title === null ? <Pill tone="warn">{t`Waiting for sync`}</Pill> : null}
                  <div style={{ marginBlockStart: "auto" }}>
                    <Link className="tc-btn tc-btn--primary" to={`/run/${r.instanceId}`}>{t`Open`}</Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : rows === null ? null : rows.length === 0 ? (
          <EmptyState
            icon={<BookPlus size={32} />}
            title={t`No activity here yet`}
            description={teacher ? t`Create your first activity to get started.` : t`Your teacher will share activities here.`}
            action={teacher ? <Button variant="primary" onClick={() => setOpen(true)}>{t`New activity`}</Button> : undefined}
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {rows.map((a) => {
              const stepCount = a.stepCount;
              const hiddenCount = a.hiddenCount;
              const resourceCount = a.resourceCount;
              const appCount = a.appCount;
              return (
                <li key={a.id} style={{ display: "contents" }}>
                  <Card as="article" aria-labelledby={`t-${a.id}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <Pill>{t`Draft`}</Pill>
                      {a.title === null ? <Pill tone="warn">{t`Waiting for sync`}</Pill> : null}
                    </div>
                    <h2 className="tc-h" id={`t-${a.id}`} style={{ fontSize: "var(--text-lg)" }}>{a.title ?? t`Loading…`}</h2>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
                      {plural(stepCount, { one: "# step", other: "# steps" })}
                      {hiddenCount > 0 ? <> · {plural(hiddenCount, { one: "# hidden", other: "# hidden" })}</> : null}
                    </p>
                    {resourceCount + appCount > 0 ? (
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
                        {plural(resourceCount, { one: "# resource", other: "# resources" })} · {plural(appCount, { one: "# app", other: "# apps" })}
                      </p>
                    ) : null}
                    {a.updatedAt > 0 ? (
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>{t`Edited ${i18n.date(new Date(a.updatedAt), { dateStyle: "medium", timeStyle: "short" })}`}</p>
                    ) : null}
                    <div style={{ marginBlockStart: "auto", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {teacher && a.title !== null ? (
                        <>
                          <Link className="tc-btn tc-btn--primary" to={`/activities/${a.id}`}>{t`Edit`}</Link>
                          <Button icon={<Copy size={16} />} onClick={() => void duplicate(a.id, a.title!)}>{t`Duplicate`}</Button>
                          <Button icon={<Download size={16} />} onClick={() => void exportOne(a.id)}>{t`Export`}</Button>
                        </>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Content>
      <Dialog open={open} onOpenChange={setOpen} title={t`New activity`} closeLabel={t`Close`}>
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{errorText(error)}</p> : null}
          <Field label={t`Title`}>
            <TextInput name="title" required maxLength={200} autoFocus />
          </Field>
          <Button type="submit" variant="primary" loading={busy}>{t`Create`}</Button>
        </form>
      </Dialog>
    </>
  );
}
