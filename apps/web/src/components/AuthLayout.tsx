import { Card } from "@toccata/ui";
import type { ReactNode } from "react";
import type { Locale } from "../i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Cadre des écrans publics (connexion, inscription). */
export function AuthLayout({ locale, title, children }: { locale: Locale; title: string; children: ReactNode }) {
  return (
    <main className="tc-root" style={{ minBlockSize: "100%", display: "grid", placeItems: "center", padding: "var(--space-4)" }}>
      <div style={{ inlineSize: "min(100%, 420px)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <span className="tc-h" style={{ fontSize: "var(--text-xl)" }}>Toccata</span>
          <LocaleSwitcher current={locale} />
        </div>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-5)" }}>
          <h1 className="tc-h" style={{ fontSize: "var(--text-xl)" }}>{title}</h1>
          {children}
        </Card>
      </div>
    </main>
  );
}
