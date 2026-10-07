import Collaboration from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { RuntimeProps } from "@toccata/apps-sdk";
import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { RichToolbar } from "../richtext/RichToolbar";
import { YStore } from "./ystore";

function CollaborativeEditor({ ydoc, label }: { ydoc: Y.Doc; label: string }) {
  const editor = useEditor(
    {
      extensions: [
        // l'historique est celui de Yjs (annuler ne défait que MES modifications)
        StarterKit.configure({ undoRedo: false, heading: { levels: [2, 3] }, link: { openOnClick: false, protocols: ["https"], autolink: false } }),
        Collaboration.configure({ document: ydoc }),
      ],
      editorProps: { attributes: { class: "tc-rich tc-rich--edit", role: "textbox", "aria-multiline": "true", "aria-label": label } },
    },
    [ydoc],
  );
  if (!editor) return null;
  return (
    <div className="tc-richbox">
      <RichToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export default function TextRuntime({ app, store }: RuntimeProps<"text">) {
  const [y, setY] = useState<YStore | null>(null);
  useEffect(() => {
    const ys = new YStore(store, app.id);
    setY(ys);
    return () => {
      setY(null);
      ys.destroy();
    };
  }, [store, app.id]);
  return y ? <CollaborativeEditor ydoc={y.doc} label={app.name} /> : null;
}
