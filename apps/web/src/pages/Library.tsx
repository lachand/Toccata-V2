import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Id, TemplateDoc } from "@toccata/schema";
import { Button, Card, Content, EmptyState, Pill, Segmented, TextInput, TopBar } from "@toccata/ui";
import { Copy, Library as LibraryIcon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { activitiesApi } from "../auth/api";
import { session, useSession } from "../auth/session";
import { useErrorText } from "../auth/useErrorText";
import { OnlineStatus } from "../components/Layout";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useWorkspace } from "../data/provider";
import { createFromBundle } from "../exchange/activities";
import type { Locale } from "../i18n";
import { libraryApi } from "../library/api";

type Lang = "all" | "fr" | "en";

/** Bibliothèque de modèles (D8 de l'article) : partir du travail d'autres enseignants, et partager le sien. */
export function Library({ locale }: { locale: Locale }) {
  const { t, i18n } = useLingui();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const { user } = useSession();
  const api = useMemo(() => libraryApi(session.authorizedFetch), []);
  const [items, setItems] = useState<TemplateDoc[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lang, setLang] = useState<Lang>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.list().then((l) => setItems(l.sort((a, b) => b.updatedAt - a.updatedAt)), setError);
  }, [api]);
  useEffect(load, [load]);

  const shown = (items ?? []).filter((x) => (lang === "all" || x.locale === lang) && `${x.title} ${x.description} ${x.authorName}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function use(tpl: TemplateDoc) {
    if (!ws || !user) return;
    setBusy(tpl.id);
    setError(null);
    try {
      const out = await createFromBundle(ws, { create: () => activitiesApi(session.authorizedFetch, () => session.getAccessToken()).create() }, user.id, tpl.bundle, new Map(), { forkedFrom: tpl.id as Id });
      navigate(`/activities/${out.id}`);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  }
  async function remove(tpl: TemplateDoc) {
    setBusy(tpl.id);
    try {
      await api.remove(tpl.id);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TopBar title={t`Template library`}>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
      </TopBar>
      <Content>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
          <Segmented label={t`Language of the template`} value={lang} onChange={setLang} options={[{ value: "all", label: t`All` }, { value: "fr", label: "Français", lang: "fr" }, { value: "en", label: "English", lang: "en" }]} />
          <TextInput type="search" aria-label={t`Search templates`} placeholder={t`Search…`} value={query} onChange={(e) => setQuery(e.currentTarget.value)} style={{ maxInlineSize: "20rem" }} />
        </div>
        {error ? (
          <p role="alert" className="tc-field__error" style={{ margin: 0 }}>
            {errorText(error)} <Button variant="ghost" onClick={load}>{t`Retry`}</Button>
          </p>
        ) : items === null ? null : shown.length === 0 ? (
          <EmptyState icon={<LibraryIcon size={32} />} title={t`No template here yet`} description={t`Open one of your activities and choose “Share as template” to add the first one.`} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {shown.map((tpl) => {
              const mine = tpl.authorId === user?.id;
              const stepCount = tpl.bundle.steps.length;
              return (
                <li key={tpl.id} style={{ display: "contents" }}>
                  <Card as="article" aria-labelledby={`tpl-${tpl.id}`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {mine ? <Pill tone="accent">{t`Yours`}</Pill> : null}
                      {tpl.locale ? <Pill>{tpl.locale.toUpperCase()}</Pill> : null}
                    </div>
                    <h2 className="tc-h" id={`tpl-${tpl.id}`} style={{ fontSize: "var(--text-lg)" }}>{tpl.title}</h2>
                    {tpl.description ? <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>{tpl.description.slice(0, 220)}</p> : null}
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
                      {plural(stepCount, { one: "# step", other: "# steps" })} · {t`by ${tpl.authorName}`} · {i18n.date(new Date(tpl.updatedAt), { dateStyle: "medium" })}
                    </p>
                    <details>
                      <summary>{t`Steps`}</summary>
                      <ol style={{ margin: 0, paddingInlineStart: "var(--space-5)" }}>
                        {tpl.bundle.steps.map((s, i) => <li key={i}>{s.title || t`Untitled step`}</li>)}
                      </ol>
                    </details>
                    <div style={{ marginBlockStart: "auto", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <Button variant="primary" icon={<Copy size={16} />} loading={busy === tpl.id} onClick={() => void use(tpl)}>{t`Use this template`}</Button>
                      {mine ? <Button icon={<Trash2 size={16} />} disabled={busy === tpl.id} onClick={() => void remove(tpl)}>{t`Remove from the library`}</Button> : null}
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
