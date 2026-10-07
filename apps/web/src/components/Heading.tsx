import type { CSSProperties, ReactNode } from "react";

/** Titre de section de niveau explicite : le plan de la page reste cohérent (h1 → h2 → h3) quel que soit l'endroit où le composant est placé. */
export function Heading({ level, children, style }: { level: 2 | 3; children: ReactNode; style?: CSSProperties }) {
  const Tag = `h${level}` as const;
  return <Tag className="tc-h" style={{ fontSize: "var(--text-md)", ...style }}>{children}</Tag>;
}
