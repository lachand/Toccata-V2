import { Switch as RxSwitch, ToggleGroup } from "radix-ui";
import { createContext, forwardRef, useContext, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "../cx";

type FieldCtx = { id: string; describedBy: string | undefined; invalid: boolean; required: boolean };
const Ctx = createContext<FieldCtx | null>(null);

/** Étiquette, aide et erreur reliées au champ (`aria-describedby`, `aria-invalid`). */
export function Field({ label, hint, error, required = false, children }: { label: string; hint?: string; error?: string | undefined; required?: boolean; children: ReactNode }) {
  const id = useId();
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <Ctx.Provider value={{ id, describedBy: ids, invalid: !!error, required }}>
      <div className="tc-field">
        <label className="tc-field__label" htmlFor={id}>{label}</label>
        {children}
        {hint ? <span className="tc-field__hint" id={`${id}-hint`}>{hint}</span> : null}
        {error ? <span className="tc-field__error" id={`${id}-error`}>{error}</span> : null}
      </div>
    </Ctx.Provider>
  );
}

function useField() {
  return useContext(Ctx);
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  const f = useField();
  return <input ref={ref} className={cx("tc-input", className)} id={f?.id} aria-describedby={f?.describedBy} aria-invalid={f?.invalid || undefined} required={f?.required || rest.required} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, rows = 5, ...rest }, ref) {
  const f = useField();
  return <textarea ref={ref} rows={rows} className={cx("tc-input tc-textarea", className)} id={f?.id} aria-describedby={f?.describedBy} aria-invalid={f?.invalid || undefined} required={f?.required || rest.required} {...rest} />;
});

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, children, ...rest }, ref) {
  const f = useField();
  return (
    <select ref={ref} className={cx("tc-select", className)} id={f?.id} aria-describedby={f?.describedBy} aria-invalid={f?.invalid || undefined} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ label, checked, onCheckedChange, disabled }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <span className="tc-switch-row">
      <RxSwitch.Root id={id} className="tc-switch" checked={checked} onCheckedChange={onCheckedChange} disabled={disabled ?? false}>
        <RxSwitch.Thumb className="tc-switch__thumb" />
      </RxSwitch.Root>
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

/** Choix exclusif (ex. langue, filtre). Une valeur est toujours sélectionnée. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string; lang?: string }[]; onChange: (v: T) => void }) {
  return (
    <ToggleGroup.Root type="single" className="tc-seg" aria-label={label} value={value} onValueChange={(v) => v && onChange(v as T)}>
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className="tc-seg__item" {...(o.lang ? { lang: o.lang } : {})}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
