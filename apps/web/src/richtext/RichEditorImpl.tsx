import { useLingui } from "@lingui/react/macro";
import { Button, Dialog, Field, IconButton, TextInput } from "@toccata/ui";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, Link as LinkIcon, List, ListOrdered, Quote } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sanitizeHtml } from "./sanitize";

export type RichEditorProps = {
  value: string;
  /** Appelé à la sortie de l'éditeur avec du HTML déjà assaini. */
  onCommit: (html: string) => void;
  label: string;
};

export default function RichEditorImpl({ value, onCommit, label }: RichEditorProps) {
  const { t } = useLingui();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, protocols: ["https"], autolink: false } })],
    content: sanitizeHtml(value),
    editorProps: { attributes: { class: "tc-rich tc-rich--edit", role: "textbox", "aria-multiline": "true", "aria-label": label } },
    onBlur: ({ editor: e }) => onCommit(sanitizeHtml(e.getHTML())),
  });
  if (!editor) return null;

  function setLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get("url") ?? "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) return setLinkError(true);
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkError(false);
    onCommit(sanitizeHtml(editor!.getHTML()));
  }
  const on = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  const tool = (lbl: string, active: boolean, run: () => void, icon: React.ReactNode) => (
    <IconButton label={lbl} aria-pressed={active} onClick={run}>{icon}</IconButton>
  );

  return (
    <div className="tc-richbox">
      <div className="tc-richbar" role="toolbar" aria-label={t`Text formatting`}>
        {tool(t`Bold`, on("bold"), () => editor.chain().focus().toggleBold().run(), <Bold size={16} />)}
        {tool(t`Italic`, on("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic size={16} />)}
        {tool(t`Heading`, on("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={16} />)}
        {tool(t`Bulleted list`, on("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List size={16} />)}
        {tool(t`Numbered list`, on("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={16} />)}
        {tool(t`Quote`, on("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), <Quote size={16} />)}
        {tool(t`Link`, on("link"), () => setLinkOpen(true), <LinkIcon size={16} />)}
      </div>
      <EditorContent editor={editor} />
      <Dialog open={linkOpen} onOpenChange={setLinkOpen} title={t`Add a link`} closeLabel={t`Close`}>
        <form onSubmit={setLink} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Field label={t`Web address`} hint={t`Must start with https://`} error={linkError ? t`Enter an address starting with https://` : undefined}>
            <TextInput name="url" type="url" inputMode="url" autoFocus placeholder="https://" />
          </Field>
          <Button type="submit" variant="primary">{t`Apply`}</Button>
        </form>
      </Dialog>
    </div>
  );
}
