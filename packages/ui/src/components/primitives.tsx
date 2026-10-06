import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

/* Aucun texte en dur dans ce paquet : tout libellé (y compris `aria-label`) arrive en propriété. */

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  /** Affiche un indicateur et désactive le bouton. Le texte du bouton doit dire ce qui est en cours. */
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("tc-btn", variant !== "secondary" && `tc-btn--${variant}`, size === "lg" && "tc-btn--lg", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="tc-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  /** Nom accessible : obligatoire, un bouton-icône n'a pas de texte. */
  label: string;
  children: ReactNode;
};

export function IconButton({ label, className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx("tc-iconbtn", className)} aria-label={label} {...rest}>
      <span aria-hidden="true" style={{ display: "contents" }}>{children}</span>
    </button>
  );
}

export type Tone = "neutral" | "ok" | "warn" | "crit" | "accent";

export function Pill({ tone = "neutral", icon, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span className={cx("tc-pill", tone !== "neutral" && `tc-pill--${tone}`, className)} {...rest}>
      {icon ? <span aria-hidden="true" style={{ display: "contents" }}>{icon}</span> : null}
      {children}
    </span>
  );
}

export function Card<T extends ElementType = "div">({ as, flat = false, className, ...rest }: { as?: T; flat?: boolean } & Omit<React.ComponentPropsWithoutRef<T>, "as">) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("tc-card", flat && "tc-card--flat", className)} {...rest} />;
}

/** Initiales : premières lettres (graphèmes) d'au plus deux mots. */
export function initials(name: string): string {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const first = (w: string) => (seg ? [...seg.segment(w)][0]?.segment : Array.from(w)[0]) ?? "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? first(words[0]!) + first(words[words.length - 1]!) : first(words[0] ?? "")).toLocaleUpperCase();
}

export function Avatar({ name, colorIndex = 0, size = "md", className, ...rest }: { name: string; colorIndex?: 0 | 1 | 2 | 3; size?: "md" | "lg" } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span role="img" aria-label={name} data-c={colorIndex} className={cx("tc-avatar", size === "lg" && "tc-avatar--lg", className)} {...rest}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}

export function AvatarGroup({ people, max = 4, overflowLabel }: { people: { name: string; colorIndex?: 0 | 1 | 2 | 3 }[]; max?: number; overflowLabel: (hidden: number) => string }) {
  const shown = people.slice(0, max);
  const hidden = people.length - shown.length;
  return (
    <span className="tc-avatars">
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} colorIndex={p.colorIndex ?? ((i % 4) as 0 | 1 | 2 | 3)} />
      ))}
      {hidden > 0 ? (
        <span role="img" aria-label={overflowLabel(hidden)} data-c="1" className="tc-avatar">
          <span aria-hidden="true">+{hidden}</span>
        </span>
      ) : null}
    </span>
  );
}

export function EmptyState({ icon, title, headingLevel = 2, description, action }: { icon?: ReactNode; title: string; headingLevel?: 1 | 2 | 3 | 4; description?: string; action?: ReactNode }) {
  const H = `h${headingLevel}` as ElementType;
  return (
    <div className="tc-empty">
      {icon ? <div className="tc-empty__icon" aria-hidden="true">{icon}</div> : null}
      <H className="tc-h">{title}</H>
      {description ? <p style={{ margin: 0, maxInlineSize: "46ch" }}>{description}</p> : null}
      {action}
    </div>
  );
}
