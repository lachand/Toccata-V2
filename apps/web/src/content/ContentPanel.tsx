import { useLingui } from "@lingui/react/macro";
import type { AppDoc, MasterContent, ResourceDoc } from "@toccata/schema";
import type { AppModule, AppType, InstanceStore } from "@toccata/apps-sdk";
import { Button, IconButton, TextInput } from "@toccata/ui";
import { ChevronDown, ChevronUp, FileText, Globe, Image as ImageIcon, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { registry } from "../apps/registry";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { fileKind } from "../data/files";
import type { Workspace } from "../data/workspace";
import { AddContentDialog } from "./AddContentDialog";
import { ResourceView } from "./ResourceView";

type Scope = ResourceDoc["scope"];
type Item = { kind: "resource"; doc: ResourceDoc } | { kind: "app"; doc: AppDoc };

const sameScope = (a: Scope, b: Scope) => a.type === b.type && (a.type === "activity" || (b.type === "step" && a.stepId === b.stepId));

function useDebounced<A extends unknown[]>(fn: (...a: A) => void, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (...a: A) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...a), ms);
  };
}

function ItemIcon({ item }: { item: Item }) {
  if (item.kind === "app") {
    const m = registry.get(item.doc.type);
    return m ? <m.Icon size={18} /> : <Globe size={18} />;
  }
  const s = item.doc.source;
  if (s.type === "url") return <Globe size={18} />;
  return fileKind(s.mime) === "image" ? <ImageIcon size={18} /> : <FileText size={18} />;
}

function AppBody({ app, ws, activityId, store }: { app: AppDoc; ws: Workspace; activityId: string; store: InstanceStore }) {
  const { t } = useLingui();
  const m = registry.get(app.type as AppType) as AppModule<AppType> | undefined;
  const save = useDebounced((config: AppDoc["config"]) => void ws.patchApp(activityId, app.id, { config }));
  if (!m) return <p style={{ margin: 0, color: "var(--muted)" }}>{t`This type of app is not available in this version.`}</p>;
  const Editor = m.Editor as React.ComponentType<{ app: AppDoc; onChange: (c: AppDoc["config"]) => void }> | undefined;
  const Runtime = m.Runtime as React.ComponentType<{ app: AppDoc; store: InstanceStore }>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {Editor ? <Editor app={app} onChange={save} /> : null}
      <Runtime app={app} store={store} />
      {"clear" in store ? (
        <div>
          <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={() => void (store as unknown as { clear(id: string): Promise<void> }).clear(app.id)}>{t`Reset preview data`}</Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Ressources et applications d'une portée (toute l'activité, ou une étape). Même composant pour l'activité et pour
 * chaque étape : l'enseignant ajoute par l'assistant unique, renomme, déplie l'aperçu fidèle, supprime.
 */
export function ContentPanel({ ws, activityId, content, scope, heading, store }: { ws: Workspace; activityId: string; content: MasterContent; scope: Scope; heading: string; store: InstanceStore }) {
  const { t } = useLingui();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<Item | null>(null);
  const items = useMemo<Item[]>(
    () =>
      [
        ...content.resources.filter((r) => sameScope(r.scope, scope)).map((doc) => ({ kind: "resource", doc }) as Item),
        ...content.apps.filter((a) => sameScope(a.scope, scope)).map((doc) => ({ kind: "app", doc }) as Item),
      ].sort((a, b) => a.doc.createdAt - b.doc.createdAt || (a.doc.id < b.doc.id ? -1 : 1)),
    [content, scope],
  );

  return (
    <section aria-label={heading} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <h3 className="tc-h" style={{ fontSize: "var(--text-md)", marginInlineEnd: "auto" }}>{heading}</h3>
        <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>{t`Add`}</Button>
      </div>
      {items.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)" }}>{t`Nothing here yet.`}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {items.map((item) => {
            const expanded = open === item.doc.id;
            return (
              <li key={item.doc.id} className="tc-item">
                <div className="tc-item__head">
                  <span aria-hidden="true" style={{ color: "var(--accent-ink)", display: "inline-flex" }}><ItemIcon item={item} /></span>
                  <TextInput
                    aria-label={t`Name`}
                    defaultValue={item.doc.name}
                    maxLength={200}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (!v || v === item.doc.name) return;
                      void (item.kind === "resource" ? ws.renameResource(activityId, item.doc.id, v) : ws.patchApp(activityId, item.doc.id, { name: v }));
                    }}
                  />
                  <IconButton label={expanded ? t`Hide ${item.doc.name}` : t`Show ${item.doc.name}`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.doc.id)}>
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </IconButton>
                  <IconButton label={t`Delete ${item.doc.name}`} onClick={() => setDoomed(item)}><Trash2 size={18} /></IconButton>
                </div>
                {expanded ? (item.kind === "resource" ? <ResourceView activityId={activityId} resource={item.doc} /> : <AppBody app={item.doc} ws={ws} activityId={activityId} store={store} />) : null}
              </li>
            );
          })}
        </ul>
      )}
      <AddContentDialog open={adding} onOpenChange={setAdding} ws={ws} activityId={activityId} scope={scope} />
      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(o) => !o && setDoomed(null)}
        title={t`Delete this item?`}
        description={t`It is removed for everyone. This cannot be undone.`}
        confirmLabel={t`Delete`}
        onConfirm={() => doomed && void (doomed.kind === "resource" ? ws.removeResource(activityId, doomed.doc.id) : ws.removeApp(activityId, doomed.doc.id))}
      />
    </section>
  );
}
