import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { InstanceDoc } from "@toccata/schema";
import { Card, Segmented } from "@toccata/ui";
import type { useTargetedEdit } from "./useTargetedEdit";

/** Choix des destinataires d'une modification : toute la classe ou des groupes précis. */
export function TargetPicker({ target, groups }: { target: ReturnType<typeof useTargetedEdit>; groups: readonly { id: string; def: InstanceDoc | null }[] }) {
  const { t } = useLingui();
  const r = target.report;
  return (
    <Card as="section" aria-label={t`Who receives your changes`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Segmented
        label={t`Apply changes to`}
        value={target.mode}
        onChange={target.setMode}
        options={[
          { value: "all", label: t`Everyone` },
          { value: "groups", label: t`Chosen groups` },
        ]}
      />
      {target.mode === "groups" ? (
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <legend className="tc-sr-only">{t`Groups`}</legend>
          {groups.map((g) => (
            <label key={g.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minBlockSize: "var(--hit)" }}>
              <input type="checkbox" checked={target.chosen.has(g.id)} disabled={!g.def} onChange={(e) => target.toggle(g.id, e.currentTarget.checked)} />
              {g.def?.name ?? t`Loading…`}
            </label>
          ))}
        </fieldset>
      ) : null}
      {target.mode === "groups" ? <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>{t`The script below shows the common version. Changes made now only create a variant for the chosen groups.`}</p> : null}
      {target.noRecipient ? <p role="status" style={{ margin: 0, color: "var(--muted)" }}>{t`Choose at least one group, otherwise nothing changes.`}</p> : null}
      {r ? (
        <p role="status" style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
          {r.unreached.length > 0 ? plural(r.unreached.length, { one: "# group no longer follows the script and was not changed. ", other: "# groups no longer follow the script and were not changed. " }) : ""}
          {r.shadowed.length > 0 ? plural(r.shadowed.length, { one: "# group keeps its own version of this.", other: "# groups keep their own version of this." }) : ""}
        </p>
      ) : null}
    </Card>
  );
}
