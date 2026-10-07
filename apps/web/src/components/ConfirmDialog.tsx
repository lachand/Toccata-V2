import { useLingui } from "@lingui/react/macro";
import { Button, Dialog } from "@toccata/ui";

/** Confirmation d'une action destructrice. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel: string; onConfirm: () => void }) {
  const { t } = useLingui();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      {...(description ? { description } : {})}
      closeLabel={t`Close`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t`Cancel`}</Button>
          <Button variant="primary" onClick={() => (onConfirm(), onOpenChange(false))}>{confirmLabel}</Button>
        </>
      }
    />
  );
}
