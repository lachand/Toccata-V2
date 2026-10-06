import { useLingui } from "@lingui/react/macro";
import { Button, Field, TextInput } from "@toccata/ui";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../auth/api";
import { session } from "../auth/session";
import { useErrorText } from "../auth/useErrorText";
import { AuthLayout } from "../components/AuthLayout";
import type { Locale } from "../i18n";

export function Signup({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const inviteCode = String(f.get("inviteCode") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      await session.signupTeacher({
        username: String(f.get("username") ?? ""),
        displayName: String(f.get("displayName") ?? ""),
        password: String(f.get("password") ?? ""),
        locale,
        ...(inviteCode ? { inviteCode } : {}),
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  // un champ de mot de passe en défaut est signalé sur le champ, les autres erreurs en tête du formulaire
  const passwordError = error instanceof ApiError && error.code === "weak_password" ? errorText(error) : undefined;
  const usernameError = error instanceof ApiError && error.code === "username_taken" ? errorText(error) : undefined;
  const generic = error && !passwordError && !usernameError ? errorText(error) : null;

  return (
    <AuthLayout locale={locale} title={t`Create a teacher account`}>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {generic ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{generic}</p> : null}
        <Field label={t`Name shown to students`}>
          <TextInput name="displayName" autoComplete="name" required maxLength={80} />
        </Field>
        <Field label={t`Username`} error={usernameError}>
          <TextInput name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} />
        </Field>
        <Field label={t`Password`} hint={t`At least 12 characters.`} error={passwordError}>
          <TextInput name="password" type="password" autoComplete="new-password" required minLength={12} />
        </Field>
        <Field label={t`Invitation code`} hint={t`Provided by your school, if one is required.`}>
          <TextInput name="inviteCode" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t`Create account`}</Button>
      </form>
      <p style={{ margin: 0 }}>
        <Link to="/login">{t`Already have an account? Sign in`}</Link>
      </p>
    </AuthLayout>
  );
}
