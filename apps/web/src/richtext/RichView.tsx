import { useMemo } from "react";
import { sanitizeHtml } from "./sanitize";

/** Affiche du HTML de consigne. Assaini à l'affichage même si l'éditeur l'a déjà fait : la base peut contenir n'importe quoi. */
export function RichView({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  // eslint-disable-next-line react/no-danger -- unique usage, entrée assainie par liste blanche (sanitize.ts)
  return <div className={className ?? "tc-rich"} dangerouslySetInnerHTML={{ __html: clean }} />;
}
