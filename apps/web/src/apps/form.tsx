import { useLingui } from "@lingui/react/macro";
import type { AppModule, RuntimeDoc } from "@toccata/apps-sdk";
import type { AppDoc } from "@toccata/schema";
import { newId } from "@toccata/schema";
import { Button, Field, IconButton, NativeSelect, Switch, TextArea, TextInput } from "@toccata/ui";
import { ArrowDown, ArrowUp, ClipboardList, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type FormApp = Extract<AppDoc, { type: "form" }>;
type FormField = FormApp["config"]["fields"][number];
type AnswerDoc = RuntimeDoc<"formanswer">;
type Answers = AnswerDoc["answers"];

const CHOICE = ["choice", "multichoice"] as const;
const hasOptions = (f: FormField) => (CHOICE as readonly string[]).includes(f.type);

const emptyAnswer = (f: FormField, a: Answers[string] | undefined) => {
  if (a === undefined) return f.type === "multichoice" ? [] : "";
  return a;
};
export const isAnswered = (f: FormField, a: Answers[string] | undefined) => (Array.isArray(a) ? a.length > 0 : typeof a === "string" ? a.trim() !== "" : a === true);

export const formApp: AppModule<"form"> = {
  type: "form",
  useLabels() {
    const { t } = useLingui();
    return { typeName: t`Questionnaire`, description: t`Questions students answer; the step can stay locked until they submit.`, defaultName: t`Questionnaire` };
  },
  Icon: ClipboardList,
  defaultConfig: () => ({ fields: [], blocking: false }),
  Editor({ app, onChange }) {
    const { t } = useLingui();
    const [fields, setFields] = useState<FormField[]>(app.config.fields);
    const [blocking, setBlocking] = useState(app.config.blocking);
    const emit = (f: FormField[], b = blocking) => (setFields(f), onChange({ fields: f, blocking: b }));
    const patch = (id: string, p: Partial<FormField>) => emit(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
    const move = (i: number, d: -1 | 1) => {
      const next = [...fields];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x!);
      emit(next);
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <Switch label={t`Block the step until the questionnaire is submitted`} checked={blocking} onCheckedChange={(v) => (setBlocking(v), onChange({ fields, blocking: v }))} />
        {fields.map((f, i) => (
          <fieldset key={f.id} className="tc-item" style={{ margin: 0 }}>
            <legend style={{ fontWeight: 600 }}>{t`Question ${i + 1}`}</legend>
            <Field label={t`Question`}>
              <TextInput value={f.label} maxLength={500} onChange={(e) => patch(f.id, { label: e.currentTarget.value })} />
            </Field>
            <Field label={t`Answer type`}>
              <NativeSelect
                value={f.type}
                onChange={(e) => {
                  const type = e.currentTarget.value as FormField["type"];
                  patch(f.id, { type, ...(CHOICE.includes(type as never) ? { options: f.options?.length ? f.options : [t`Option 1`, t`Option 2`] } : {}) });
                }}
              >
                <option value="text">{t`Short text`}</option>
                <option value="longtext">{t`Long text`}</option>
                <option value="choice">{t`Single choice`}</option>
                <option value="multichoice">{t`Multiple choice`}</option>
              </NativeSelect>
            </Field>
            {hasOptions(f) ? (
              <Field label={t`Options`} hint={t`One per line.`}>
                <TextArea rows={4} defaultValue={(f.options ?? []).join("\n")} onChange={(e) => patch(f.id, { options: e.currentTarget.value.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 50) })} />
              </Field>
            ) : null}
            <Switch label={t`Required`} checked={f.required} onCheckedChange={(v) => patch(f.id, { required: v })} />
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <IconButton label={t`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></IconButton>
              <IconButton label={t`Move question ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></IconButton>
              <IconButton label={t`Delete question ${i + 1}`} onClick={() => emit(fields.filter((x) => x.id !== f.id))}><Trash2 size={16} /></IconButton>
            </div>
          </fieldset>
        ))}
        <div>
          <Button icon={<Plus size={16} />} disabled={fields.length >= 100} onClick={() => emit([...fields, { id: `q_${newId().slice(-12)}`, label: "", type: "text", required: false }])}>{t`Add a question`}</Button>
        </div>
      </div>
    );
  },
  Runtime({ app, store }) {
    const { t } = useLingui();
    const fields = app.config.fields;
    const [doc, setDoc] = useState<AnswerDoc | null>(null);
    const [answers, setAnswers] = useState<Answers>({});
    const [errors, setErrors] = useState<Set<string>>(new Set());
    const loaded = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
      () =>
        store.watch("formanswer", app.id, (docs) => {
          const mine = docs.filter((d) => d.authorId === store.viewer.id).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
          setDoc(mine);
          if (!loaded.current || mine?.submitted) setAnswers(mine?.answers ?? {});
          loaded.current = true;
        }),
      [store, app.id],
    );
    useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

    const save = (next: Answers, submitted: boolean) => store.put({ kind: "formanswer", appId: app.id, answers: next, submitted, ...(doc ? { id: doc.id } : {}) });
    const change = (id: string, value: Answers[string]) => {
      const next = { ...answers, [id]: value };
      setAnswers(next);
      setErrors((e) => (e.delete(id), new Set(e)));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next, false), 600); // brouillon enregistré au fil de la saisie
    };
    const submit = () => {
      const missing = new Set(fields.filter((f) => f.required && f.type !== "file" && !isAnswered(f, answers[f.id])).map((f) => f.id));
      setErrors(missing);
      if (missing.size === 0) {
        if (timer.current) clearTimeout(timer.current);
        void save(answers, true);
      }
    };
    const submitted = doc?.submitted === true;

    if (fields.length === 0) return <p style={{ margin: 0, color: "var(--muted)" }}>{t`This questionnaire has no question yet.`}</p>;
    return (
      <form onSubmit={(e) => (e.preventDefault(), submit())} noValidate style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }} aria-label={app.name}>
        {fields.map((f) => {
          const value = emptyAnswer(f, answers[f.id]);
          const error = errors.has(f.id) ? t`This question is required.` : undefined;
          const label = f.label || t`Untitled question`;
          if (f.type === "choice" || f.type === "multichoice") {
            const multi = f.type === "multichoice";
            return (
              <fieldset key={f.id} style={{ border: 0, margin: 0, padding: 0 }} disabled={submitted}>
                <legend style={{ fontWeight: 600 }}>{label}{f.required ? " *" : ""}</legend>
                {(f.options ?? []).map((o) => {
                  const checked = multi ? (value as string[]).includes(o) : value === o;
                  return (
                    <label key={o} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minBlockSize: "var(--hit)" }}>
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name={f.id}
                        checked={checked}
                        onChange={() => change(f.id, multi ? (checked ? (value as string[]).filter((x) => x !== o) : [...(value as string[]), o]) : o)}
                      />
                      {o}
                    </label>
                  );
                })}
                {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{error}</p> : null}
              </fieldset>
            );
          }
          if (f.type === "file") return <p key={f.id} style={{ margin: 0, color: "var(--muted)" }}>{t`File answers are not available yet.`}</p>;
          const Input = f.type === "longtext" ? TextArea : TextInput;
          return (
            <Field key={f.id} label={f.required ? `${label} *` : label} error={error}>
              <Input value={value as string} disabled={submitted} maxLength={5000} onChange={(e) => change(f.id, e.currentTarget.value)} />
            </Field>
          );
        })}
        {submitted ? (
          <p role="status" style={{ margin: 0 }}>{t`Answers submitted.`}</p>
        ) : (
          <div><Button type="submit" variant="primary">{t`Submit`}</Button></div>
        )}
      </form>
    );
  },
};
