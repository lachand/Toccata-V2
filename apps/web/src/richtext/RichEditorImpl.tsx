import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { RichToolbar } from "./RichToolbar";
import { sanitizeHtml } from "./sanitize";

export type RichEditorProps = {
  value: string;
  /** Appelé à la sortie de l'éditeur avec du HTML déjà assaini. */
  onCommit: (html: string) => void;
  label: string;
};

export default function RichEditorImpl({ value, onCommit, label }: RichEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, protocols: ["https"], autolink: false } })],
    content: sanitizeHtml(value),
    editorProps: { attributes: { class: "tc-rich tc-rich--edit", role: "textbox", "aria-multiline": "true", "aria-label": label } },
    onBlur: ({ editor: e }) => onCommit(sanitizeHtml(e.getHTML())),
  });
  if (!editor) return null;
  return (
    <div className="tc-richbox">
      <RichToolbar editor={editor} onLinked={() => onCommit(sanitizeHtml(editor.getHTML()))} />
      <EditorContent editor={editor} />
    </div>
  );
}
