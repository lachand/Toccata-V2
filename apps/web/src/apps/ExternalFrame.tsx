import { useLingui } from "@lingui/react/macro";
import { Button } from "@toccata/ui";
import { ExternalLink } from "lucide-react";
import { httpsUrlSchema } from "@toccata/schema";

type Display = "iframe" | "window" | "link";

/** Même origine que l'application (ou que la page courante, `http` de développement compris) ? */
export function isOwnOrigin(url: string, own: string = window.location.origin): boolean {
  const u = new URL(url);
  const o = new URL(own);
  return u.hostname === o.hostname && u.port === o.port; // le protocole ne change rien : https://nous reste « nous »
}

/** Page web tierce. Toujours https ; en cadre isolé (sandbox) sans référent ni permissions ; jamais notre propre origine. */
export function ExternalFrame({ url, display, title }: { url: string; display: Display; title: string }) {
  const { t } = useLingui();
  const ok = httpsUrlSchema.safeParse(url).success;
  if (!ok) return <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{t`This address is not valid. Only https:// addresses are allowed.`}</p>;
  // un cadre `allow-same-origin` + `allow-scripts` sur NOTRE origine s'échapperait du bac à sable : on ne l'intègre jamais
  const sameOrigin = isOwnOrigin(url);
  const open = (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={14} aria-hidden="true" /> {t`Open in a new tab`}
    </a>
  );
  if (display === "iframe" && !sameOrigin)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <iframe
          title={title}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="no-referrer"
          loading="lazy"
          allow=""
          style={{ inlineSize: "100%", blockSize: "min(70vh, 640px)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius)", background: "var(--surface)" }}
        />
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
          {t`If the page stays blank, the site does not allow being embedded.`} {open}
        </p>
      </div>
    );
  if (display === "window")
    return <Button icon={<ExternalLink size={16} />} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>{t`Open in a new window`}</Button>;
  return <p style={{ margin: 0 }}>{open}</p>;
}
