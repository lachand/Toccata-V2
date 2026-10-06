import { useLingui } from "@lingui/react/macro";
import { Button, Field, TextInput } from "@toccata/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useErrorText } from "../auth/useErrorText";
import { session } from "../auth/session";
import { AuthLayout } from "../components/AuthLayout";
import type { Locale } from "../i18n";

/** Lit `#u=<identifiant>&p=<phrase>` (QR code d'une fiche d'identifiants) puis efface le fragment de l'historique. */
function readQuickLogin(): { u: string; p: string } | null {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const u = h.get("u");
  const p = h.get("p");
  return u && p ? { u, p } : null;
}

export function Login({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const username = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  async function signIn(u: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await session.login(u, p);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  useEffect(() => {
    const quick = readQuickLogin();
    if (!quick) return;
    window.history.replaceState(null, "", window.location.pathname); // le secret ne reste ni dans la barre d'adresse ni dans l'historique
    void signIn(quick.u, quick.p);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, au chargement
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(username.current?.value ?? "", password.current?.value ?? "");
  }

  return (
    <AuthLayout locale={locale} title={t`Sign in`}>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }} noValidate>
        {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{errorText(error)}</p> : null}
        <Field label={t`Username`}>
          <TextInput ref={username} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
        </Field>
        <Field label={t`Password`}>
          <TextInput ref={password} type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t`Sign in`}</Button>
      </form>
      <p style={{ margin: 0 }}>
        <Link to="/signup">{t`Create a teacher account`}</Link>
      </p>
    </AuthLayout>
  );
}
