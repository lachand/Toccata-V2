import { useLingui } from "@lingui/react/macro";
import { toTemplate, type Id, type MasterContent } from "@toccata/schema";
import { Button, Dialog } from "@toccata/ui";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { session } from "../auth/session";
import { useErrorText } from "../auth/useErrorText";
import { libraryApi } from "./api";

/** Partage l'activité comme modèle : sans fichiers, sous le nom affiché de l'enseignant, après confirmation explicite. */
export function PublishTemplateDialog({ content, author }: { content: MasterContent; author: { id: Id; name: string } }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileCount = content.resources.filter((r) => r.source.type === "file").length;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await libraryApi(session.authorizedFetch).publish(toTemplate(content, author, Date.now()));
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button icon={<Share2 size={16} />} onClick={() => (setDone(false), setError(null), setOpen(true))}>{t`Share as template`}</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t`Share “${content.activity.title}” as a template`}
        description={t`Other teachers will be able to copy this script into their own activities. They will see your name (${author.name}). Nothing about your students is shared: no group, answer, note or result.`}
        closeLabel={t`Close`}
        footer={
          done ? (
            <Button variant="primary" onClick={() => setOpen(false)}>{t`Done`}</Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>{t`Cancel`}</Button>
              <Button variant="primary" loading={busy} onClick={() => void publish()}>{t`Share`}</Button>
            </>
          )
        }
      >
        {fileCount > 0 ? <p style={{ margin: 0 }}>{t`Files are not included in a shared template (${fileCount} left out). Web links are.`}</p> : null}
        {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{errorText(error)}</p> : null}
        {done ? <p role="status" style={{ margin: 0 }}>{t`The template is now in the library.`}</p> : null}
      </Dialog>
    </>
  );
}
