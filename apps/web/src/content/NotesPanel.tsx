import { useLingui } from "@lingui/react/macro";
import type { TeacherNoteDoc } from "@toccata/schema";
import { Field, TextArea } from "@toccata/ui";
import { Bookmark, ThumbsDown, ThumbsUp } from "lucide-react";
import { Heading } from "../components/Heading";
import type { Workspace } from "../data/workspace";

/** Notes privées de l'enseignant (préparation, réflexion, D9) sur l'activité ou sur une étape, avec un drapeau. */
export function NotesPanel({ ws, activityId, stepId, note, heading, headingLevel = 3 }: { ws: Workspace; activityId: string; stepId: string | null; note: TeacherNoteDoc | undefined; heading: string; headingLevel?: 2 | 3 }) {
  const { t } = useLingui();
  const flags: { value: NonNullable<TeacherNoteDoc["flag"]>; label: string; icon: React.ReactNode }[] = [
    { value: "good", label: t`Worked well`, icon: <ThumbsUp size={16} aria-hidden="true" /> },
    { value: "improve", label: t`To improve`, icon: <ThumbsDown size={16} aria-hidden="true" /> },
    { value: "bookmark", label: t`Bookmark`, icon: <Bookmark size={16} aria-hidden="true" /> },
  ];
  return (
    <section aria-label={heading} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <Heading level={headingLevel}>{heading}</Heading>
      <Field label={t`Private notes`} hint={t`Only you can see these notes.`}>
        <TextArea
          key={note?.id ?? "new"}
          defaultValue={note?.body ?? ""}
          rows={3}
          maxLength={20_000}
          onBlur={(e) => e.currentTarget.value !== (note?.body ?? "") && void ws.saveNote(activityId, stepId, { body: e.currentTarget.value })}
        />
      </Field>
      <div role="group" aria-label={t`Flag`} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {flags.map((f) => (
          <button
            key={f.value}
            type="button"
            className="tc-btn"
            aria-pressed={note?.flag === f.value}
            onClick={() => void ws.saveNote(activityId, stepId, { flag: note?.flag === f.value ? null : f.value })}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>
    </section>
  );
}
