import { lazy, Suspense } from "react";
import { TextArea } from "@toccata/ui";
import { htmlToText } from "./sanitize";
import type { RichEditorProps } from "./RichEditorImpl";

const Impl = lazy(() => import("./RichEditorImpl"));

/** TipTap est chargé à la demande (poids) ; en attendant, un champ texte simple garde la saisie possible. */
export function RichEditor(props: RichEditorProps) {
  return (
    <Suspense fallback={<TextArea aria-label={props.label} defaultValue={htmlToText(props.value)} rows={6} readOnly />}>
      <Impl {...props} />
    </Suspense>
  );
}
