import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button, Card, Content, Dialog, EmptyState, Field, NativeSelect, Segmented, TextInput, TopBar } from "@toccata/ui";
import { Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { activitiesApi, classesApi, type ClassSummary, type StudentSummary } from "../auth/api";
import { session, useSession } from "../auth/session";
import { useErrorText } from "../auth/useErrorText";
import { OnlineStatus } from "../components/Layout";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useContent, useGroups } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";

type Mode = "class" | "groups" | "each";

/** Distribution (D5) : choisir une classe, la répartir en groupes, créer les instances de l'activité. */
export function Distribute({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const { id = "" } = useParams();
  const ws = useWorkspace();
  const { user } = useSession();
  const content = useContent(id);
  const groups = useGroups(id);
  const api = useMemo(() => classesApi(session.authorizedFetch, () => session.getAccessToken()), []);
  const acts = useMemo(() => activitiesApi(session.authorizedFetch, () => session.getAccessToken()), []);

  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [className, setClassName] = useState("");
  const [mode, setMode] = useState<Mode>("class");
  const [count, setCount] = useState(4);
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.list().then((l) => (setClasses(l), l[0] && setClassId((c) => c || l[0]!.id)), setError);
  }, [api]);
  useEffect(() => {
    if (!classId) return;
    api.get(classId).then((c) => {
      setStudents(c.students);
      setClassName(c.name);
      setAssign(Object.fromEntries(c.students.map((s, i) => [s.id, i % 4])));
    }, setError);
  }, [api, classId]);

  const nameOf = useMemo(() => new Map(students.map((s) => [s.id, s.displayName])), [students]);
  const top = (
    <TopBar title={content?.activity.title ?? t`Activity`}>
      <OnlineStatus />
      <LocaleSwitcher current={locale} />
    </TopBar>
  );
  if (!ws || !user || content === undefined) return top;

  const plan: { name: string; members: string[] }[] =
    mode === "class"
      ? students.length ? [{ name: className, members: students.map((s) => s.id) }] : []
      : mode === "each"
        ? students.map((s) => ({ name: s.displayName, members: [s.id] }))
        : Array.from({ length: count }, (_, g) => ({ name: t`Group ${g + 1}`, members: students.filter((s) => (assign[s.id] ?? 0) % count === g).map((s) => s.id) })).filter((g) => g.members.length > 0);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      for (const g of plan) {
        const { id: instanceId } = await acts.createInstance(id, g.members);
        await ws!.createInstanceDef(instanceId, id, user!.id, g.name, g.members);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveMembers(instanceId: string) {
    setBusy(true);
    setError(null);
    try {
      const memberIds = [...picked];
      await acts.setMembers(instanceId, memberIds);
      await ws!.updateInstanceDef(instanceId, (d) => ({ ...d, memberIds }));
      setEditing(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {top}
      <Content>
        <Link to={`/activities/${id}`} style={{ alignSelf: "flex-start" }}>{t`Back to the script`}</Link>
        {error ? <p role="alert" className="tc-field__error" style={{ margin: 0 }}>{errorText(error)}</p> : null}

        <Card as="section" aria-label={t`Groups of this activity`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h2 className="tc-h" style={{ fontSize: "var(--text-lg)" }}>{t`Groups of this activity`}</h2>
          {groups.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>{t`No group yet. Create them below.`}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {groups.map((g) => {
                const memberCount = g.def?.memberIds.length ?? 0;
                const names = (g.def?.memberIds ?? []).map((m) => nameOf.get(m)).filter(Boolean).join(", ");
                return (
                  <li key={g.id} className="tc-item">
                    <div className="tc-item__head">
                      <TextInput aria-label={t`Group name`} defaultValue={g.def?.name ?? ""} maxLength={200} disabled={!g.def} onBlur={(e) => g.def && e.currentTarget.value.trim() && e.currentTarget.value.trim() !== g.def.name && void ws.updateInstanceDef(g.id, (d) => ({ ...d, name: e.currentTarget.value.trim() }))} />
                      <Button onClick={() => (setPicked(new Set(g.def?.memberIds ?? [])), setEditing(g.id))} disabled={!g.def}>{t`Members`}</Button>
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "var(--text-sm)" }}>
                      {plural(memberCount, { one: "# student", other: "# students" })}{names ? ` · ${names}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card as="section" aria-label={t`Create groups`} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <h2 className="tc-h" style={{ fontSize: "var(--text-lg)" }}>{t`Create groups`}</h2>
          {classes !== null && classes.length === 0 ? (
            <EmptyState icon={<Users size={32} />} title={t`No class yet`} description={t`Create a class to add your students.`} action={<Link className="tc-btn tc-btn--primary" to="/classes">{t`Classes`}</Link>} headingLevel={3} />
          ) : (
            <>
              <Field label={t`Class`}>
                <NativeSelect value={classId} onChange={(e) => setClassId(e.currentTarget.value)}>
                  {(classes ?? []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </NativeSelect>
              </Field>
              <Segmented
                label={t`How to split the class`}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "class", label: t`Whole class` },
                  { value: "groups", label: t`Groups` },
                  { value: "each", label: t`One per student` },
                ]}
              />
              {mode === "groups" ? (
                <>
                  <Field label={t`Number of groups`}>
                    <NativeSelect value={count} onChange={(e) => setCount(Number(e.currentTarget.value))}>
                      {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </NativeSelect>
                  </Field>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))" }}>
                    {students.map((s) => (
                      <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <span style={{ flex: 1, overflowWrap: "anywhere" }}>{s.displayName}</span>
                        <NativeSelect aria-label={t`Group of ${s.displayName}`} value={(assign[s.id] ?? 0) % count} onChange={(e) => setAssign({ ...assign, [s.id]: Number(e.currentTarget.value) })} style={{ inlineSize: "7rem" }}>
                          {Array.from({ length: count }, (_, g) => <option key={g} value={g}>{g + 1}</option>)}
                        </NativeSelect>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p style={{ margin: 0, color: "var(--muted)" }}>{plural(plan.length, { one: "# group will be created.", other: "# groups will be created." })}</p>
              <div>
                <Button variant="primary" loading={busy} disabled={plan.length === 0} onClick={() => void create()}>{t`Create groups`}</Button>
              </div>
            </>
          )}
        </Card>
      </Content>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={t`Members`}
        closeLabel={t`Close`}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t`Cancel`}</Button>
            <Button variant="primary" loading={busy} onClick={() => editing && void saveMembers(editing)}>{t`Save`}</Button>
          </>
        }
      >
        {students.length === 0 ? (
          <p style={{ margin: 0 }}>{t`Choose a class above to list its students.`}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {students.map((s) => (
              <li key={s.id}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minBlockSize: "var(--hit)" }}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={(e) => setPicked((p) => (e.currentTarget.checked ? new Set(p).add(s.id) : (p.delete(s.id), new Set(p))))} />
                  {s.displayName}
                </label>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
