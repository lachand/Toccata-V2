import { useLingui } from "@lingui/react/macro";
import { Button, Card, Pill } from "@toccata/ui";
import { Printer } from "lucide-react";
import type { NewStudent } from "../auth/api";
import { QrImage } from "./QrImage";

/** Adresse de connexion rapide : le fragment (#) n'est jamais envoyé au serveur ; la page de connexion l'efface après lecture. */
export const quickLoginUrl = (origin: string, s: Pick<NewStudent, "username" | "passphrase">) =>
  `${origin}/login#u=${encodeURIComponent(s.username)}&p=${encodeURIComponent(s.passphrase)}`;

/**
 * Fiches d'identifiants, montrées UNE SEULE FOIS (le serveur ne conserve que le haché).
 * La zone `.print-sheet` est la seule imprimée (voir app.css).
 */
export function CredentialsSheet({ students, origin, onClose }: { students: readonly NewStudent[]; origin: string; onClose?: () => void }) {
  const { t } = useLingui();
  return (
    <section aria-label={t`Login details`} className="print-sheet" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="no-print" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
        <h2 className="tc-h" style={{ fontSize: "var(--text-lg)", marginInlineEnd: "auto" }}>{t`Login details`}</h2>
        <Pill tone="warn">{t`Shown only once`}</Pill>
        <Button variant="primary" icon={<Printer size={18} />} onClick={() => window.print()}>{t`Print`}</Button>
        {onClose ? <Button onClick={onClose}>{t`Done`}</Button> : null}
      </div>
      <p className="no-print" style={{ margin: 0, color: "var(--muted)" }}>{t`Print or save these details now: passphrases cannot be shown again. A lost passphrase can be replaced by a new one.`}</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {students.map((s) => {
          const name = s.displayName;
          return (
          <li key={s.id} style={{ display: "contents" }}>
            <Card as="article" className="cred-card" aria-label={s.displayName} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minInlineSize: 0 }}>
                <strong className="tc-h" style={{ fontSize: "var(--text-lg)" }}>{s.displayName}</strong>
                <span><span style={{ color: "var(--muted)" }}>{t`Username`}</span> <span className="tc-mono">{s.username}</span></span>
                <span><span style={{ color: "var(--muted)" }}>{t`Passphrase`}</span> <span className="tc-mono" style={{ overflowWrap: "anywhere" }}>{s.passphrase}</span></span>
                <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)" }}>{origin.replace(/^https?:\/\//, "")}</span>
              </div>
              <QrImage text={quickLoginUrl(origin, s)} alt={t`QR code to sign in as ${name}`} />
            </Card>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
