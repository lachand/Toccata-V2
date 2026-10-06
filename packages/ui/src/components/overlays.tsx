import { Dialog as RxDialog, Tabs as RxTabs } from "radix-ui";
import { X } from "lucide-react";
import { useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cx } from "../cx";
import { IconButton } from "./primitives";

/**
 * Dialogue modal. Radix ne rend le focus qu'à un `Dialog.Trigger` ; ici le dialogue est contrôlé
 * (ouvert depuis n'importe quel bouton), donc on mémorise l'élément qui avait le focus à
 * l'ouverture et on le lui rend à la fermeture (WCAG 2.4.3). Sans cela le focus tombait sur <body>.
 */
export function Dialog({ open, onOpenChange, title, description, closeLabel, footer, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; closeLabel: string; footer?: ReactNode; children?: ReactNode }) {
  const opener = useRef<HTMLElement | null>(null);
  // Lu pendant le rendu, avant que Radix ne déplace le focus dans le dialogue.
  if (open && opener.current === null && typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null;
  return (
    <RxDialog.Root open={open} onOpenChange={onOpenChange}>
      <RxDialog.Portal>
        <RxDialog.Overlay className="tc-overlay" />
        <RxDialog.Content
          className="tc-dialog tc-root"
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const el = opener.current;
            opener.current = null;
            if (el?.isConnected) el.focus();
          }}
        >
          <RxDialog.Title className="tc-h" style={{ fontSize: "var(--text-xl)" }}>{title}</RxDialog.Title>
          {description ? <RxDialog.Description style={{ margin: 0, color: "var(--muted)" }}>{description}</RxDialog.Description> : null}
          {children}
          {footer ? <div className="tc-dialog__footer">{footer}</div> : null}
          <RxDialog.Close asChild>
            <IconButton label={closeLabel} className="tc-dialog__close"><X size={18} /></IconButton>
          </RxDialog.Close>
        </RxDialog.Content>
      </RxDialog.Portal>
    </RxDialog.Root>
  );
}

export const Tabs = RxTabs.Root;
export function TabsList({ className, ...p }: ComponentPropsWithoutRef<typeof RxTabs.List>) {
  return <RxTabs.List className={cx("tc-tabs__list", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: ComponentPropsWithoutRef<typeof RxTabs.Trigger>) {
  return <RxTabs.Trigger className={cx("tc-tab", className)} {...p} />;
}
export const TabsContent = RxTabs.Content;
