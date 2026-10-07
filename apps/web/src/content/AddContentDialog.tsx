import { useLingui } from "@lingui/react/macro";
import type { AppDoc, ResourceDoc } from "@toccata/schema";
import { httpsUrlSchema } from "@toccata/schema";
import type { AppModule, AppType } from "@toccata/apps-sdk";
import { Button, Dialog, Field, TextInput } from "@toccata/ui";
import { FileUp, Link as LinkIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DisplayModeField } from "../apps/DisplayModeField";
import { registry } from "../apps/registry";
import { useErrorText } from "../auth/useErrorText";
import { FileTooLargeError, type Workspace } from "../data/workspace";

type Scope = ResourceDoc["scope"];
type Choice = { kind: "link" } | { kind: "file" } | { kind: "app"; type: AppType; defaultName: string };

function Tile({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <li style={{ display: "contents" }}>
      <button type="button" className="tc-tile" onClick={onClick}>
        <span aria-hidden="true" className="tc-tile__icon">{icon}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "start" }}>
          <strong>{title}</strong>
          <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)" }}>{description}</span>
        </span>
      </button>
    </li>
  );
}

function AppTile({ module, onPick }: { module: AppModule<AppType>; onPick: (defaultName: string) => void }) {
  const labels = module.useLabels();
  return <Tile icon={<module.Icon size={20} />} title={labels.typeName} description={labels.description} onClick={() => onPick(labels.defaultName)} />;
}

/** Assistant unique d'ajout : une ressource (lien, fichier) ou une application, à portée de l'activité ou d'une étape. */
export function AddContentDialog({ open, onOpenChange, ws, activityId, scope }: { open: boolean; onOpenChange: (o: boolean) => void; ws: Workspace; activityId: string; scope: Scope }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [display, setDisplay] = useState<"iframe" | "window" | "link">("iframe");
  const [draft, setDraft] = useState<AppDoc | null>(null);

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setChoice(null);
      setError(null);
      setBusy(false);
      setDraft(null);
      setDisplay("iframe");
    }
  }
  function pick(c: Choice) {
    setError(null);
    setChoice(c);
    if (c.kind === "app") {
      const m = registry.get(c.type)!;
      setDraft({ id: "", kind: "app", scope, name: "", type: c.type, config: m.defaultConfig(), createdAt: 0, updatedAt: 0 } as AppDoc);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!choice) return;
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      if (choice.kind === "link") {
        const url = String(f.get("url") ?? "").trim();
        if (!httpsUrlSchema.safeParse(url).success) return setError(t`Enter an address starting with https://`);
        await ws.addResource(activityId, { scope, name: name || new URL(url).hostname, source: { type: "url", url, display } });
      } else if (choice.kind === "file") {
        const file = (f.get("file") as File | null)?.size ? (f.get("file") as File) : null;
        if (!file) return setError(t`Choose a file.`);
        await ws.attachFile(activityId, file, name || file.name, scope);
      } else if (draft) {
        if (choice.type === "external" && !httpsUrlSchema.safeParse((draft.config as { url: string }).url).success) return setError(t`Enter an address starting with https://`);
        await ws.addApp(activityId, { scope, name: name || choice.defaultName, type: choice.type, config: draft.config } as never);
      }
      close(false);
    } catch (err) {
      setError(err instanceof FileTooLargeError ? t`This file is too large (25 MB at most).` : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close} title={scope.type === "step" ? t`Add to this step` : t`Add to the whole activity`} closeLabel={t`Close`}>
      {choice === null ? (
        <ul className="tc-tiles" aria-label={t`What to add`}>
          <Tile icon={<LinkIcon size={20} />} title={t`Web link`} description={t`A page to read or a video to watch.`} onClick={() => pick({ kind: "link" })} />
          <Tile icon={<FileUp size={20} />} title={t`File`} description={t`An image, a PDF, an audio or video file, a document.`} onClick={() => pick({ kind: "file" })} />
          {registry.list().map((m) => (
            <AppTile key={m.type} module={m} onPick={(defaultName) => pick({ kind: "app", type: m.type, defaultName })} />
          ))}
        </ul>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{error}</p> : null}
          {choice.kind === "link" ? (
            <>
              <Field label={t`Address`} hint={t`Must start with https://`}>
                <TextInput name="url" type="url" inputMode="url" placeholder="https://" required autoFocus />
              </Field>
              <DisplayModeField value={display} onChange={setDisplay} />
            </>
          ) : null}
          {choice.kind === "file" ? (
            <Field label={t`File`} hint={t`25 MB at most.`}>
              <input name="file" type="file" className="tc-input" required />
            </Field>
          ) : null}
          <Field label={t`Name`} hint={t`Shown to students. Optional.`}>
            <TextInput name="name" maxLength={200} />
          </Field>
          {choice.kind === "app" && draft ? <AppDraftEditor module={registry.get(choice.type)!} draft={draft} onChange={setDraft} /> : null}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button onClick={() => setChoice(null)}>{t`Back`}</Button>
            <Button type="submit" variant="primary" loading={busy}>{t`Add`}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function AppDraftEditor({ module, draft, onChange }: { module: AppModule<AppType>; draft: AppDoc; onChange: (d: AppDoc) => void }) {
  const E = module.Editor as React.ComponentType<{ app: AppDoc; onChange: (c: AppDoc["config"]) => void }> | undefined;
  return E ? <E app={draft} onChange={(config) => onChange({ ...draft, config } as AppDoc)} /> : null;
}
