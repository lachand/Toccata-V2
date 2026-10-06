import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export function AppShell({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="tc-shell tc-root">
      {rail}
      <div className="tc-main">{children}</div>
    </div>
  );
}

export function Rail({ label, brand, footer, children }: { label: string; brand: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <nav className="tc-rail" aria-label={label}>
      <div className="tc-rail__brand">{brand}</div>
      {children}
      {footer ? <div className="tc-rail__footer">{footer}</div> : null}
    </nav>
  );
}

type RailItemProps = { icon?: ReactNode; current?: boolean; children: ReactNode };
export function RailItem({ icon, current = false, children, className, ...rest }: RailItemProps & (({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>))) {
  const inner = (
    <>
      {icon ? <span aria-hidden="true" style={{ display: "contents" }}>{icon}</span> : null}
      {children}
    </>
  );
  const cls = cx("tc-rail__item", className);
  if ("href" in rest && rest.href !== undefined) {
    return <a className={cls} aria-current={current ? "page" : undefined} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  }
  return <button type="button" className={cls} aria-current={current ? "page" : undefined} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>{inner}</button>;
}

export function TopBar({ title, headingLevel = 1, children }: { title: string; headingLevel?: 1 | 2; children?: ReactNode }) {
  const H = `h${headingLevel}` as "h1" | "h2";
  return (
    <header className="tc-topbar">
      <H className="tc-h tc-topbar__title">{title}</H>
      {children}
    </header>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <main className="tc-content">{children}</main>;
}
