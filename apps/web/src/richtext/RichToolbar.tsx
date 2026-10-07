import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/react";
import { Button, Dialog, Field, IconButton, TextInput } from "@toccata/ui";
import { Bold, Heading2, Italic, Link as LinkIcon, List, ListOrdered, Quote } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

/** Barre d'outils commune au texte riche (consignes) et au texte collaboratif. */
export function RichToolbar({ editor, onLinked }: { editor: Editor; onLinked?: () => void }) {
  const { t } = useLingui();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);

  function setLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get("url") ?? "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) return setLinkError(true);
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkError(false);
    onLinked?.();
  }
  const tool = (label: string, active: boolean, run: () => void, icon: ReactNode) => (
    <IconButton label={label} aria-pressed={active} onClick={run}>{icon}</IconButton>
  );
  return (
    <>
      <div className="tc-richbar" role="toolbar" aria-label={t`Text formatting`}>
        {tool(t`Bold`, editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold size={16} />)}
        {tool(t`Italic`, editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic size={16} />)}
        {tool(t`Heading`, editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={16} />)}
        {tool(t`Bulleted list`, editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List size={16} />)}
        {tool(t`Numbered list`, editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={16} />)}
        {tool(t`Quote`, editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), <Quote size={16} />)}
        {tool(t`Link`, editor.isActive("link"), () => setLinkOpen(true), <LinkIcon size={16} />)}
      </div>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen} title={t`Add a link`} closeLabel={t`Close`}>
        <form onSubmit={setLink} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Field label={t`Web address`} hint={t`Must start with https://`} error={linkError ? t`Enter an address starting with https://` : undefined}>
            <TextInput name="url" type="url" inputMode="url" autoFocus placeholder="https://" />
          </Field>
          <Button type="submit" variant="primary">{t`Apply`}</Button>
        </form>
      </Dialog>
    </>
  );
}
