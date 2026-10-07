import { DndContext, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { t as tMacro } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { AppModule, RuntimeDoc } from "@toccata/apps-sdk";
import { newId, orderBetween } from "@toccata/schema";
import { Button, IconButton, NativeSelect, TextInput } from "@toccata/ui";
import { GripVertical, Plus, SquareKanban, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type CardDoc = RuntimeDoc<"kanbancard">;
type Column = { id: string; title: string };

const byOrder = (a: CardDoc, b: CardDoc) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1);

function KanbanCard({ card, columns, onMove, onTitle, onPoints, onDelete }: { card: CardDoc; columns: Column[]; onMove: (columnId: string) => void; onTitle: (v: string) => void; onPoints: (v: number | undefined) => void; onDelete: () => void }) {
  const { t } = useLingui();
  const id = `card:${card.id}`;
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  return (
    <li
      ref={(el) => (drag.setNodeRef(el), drop.setNodeRef(el))}
      className="tc-kcard"
      style={{ transform: CSS.Translate.toString(drag.transform), opacity: drag.isDragging ? 0.6 : 1, outline: drop.isOver && !drag.isDragging ? "2px dashed var(--accent)" : undefined }}
    >
      <div className="tc-kcard__row">
        <button type="button" className="tc-step__handle" aria-label={t`Drag card “${card.title}”`} ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners}><GripVertical size={16} aria-hidden="true" /></button>
        <TextInput aria-label={t`Card title`} defaultValue={card.title} maxLength={300} onBlur={(e) => e.currentTarget.value.trim() !== card.title && onTitle(e.currentTarget.value.trim())} />
        <IconButton label={t`Delete card “${card.title}”`} onClick={onDelete}><Trash2 size={16} /></IconButton>
      </div>
      <div className="tc-kcard__row">
        <NativeSelect aria-label={t`Move “${card.title}” to`} value={card.columnId} onChange={(e) => onMove(e.currentTarget.value)}>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </NativeSelect>
        <TextInput aria-label={t`Points`} type="number" min={0} max={100} inputMode="numeric" style={{ inlineSize: "5.5rem" }} defaultValue={card.points ?? ""} onBlur={(e) => { const v = e.currentTarget.value === "" ? undefined : Math.min(100, Math.max(0, Math.round(Number(e.currentTarget.value)))); if (v !== card.points) onPoints(v); }} />
      </div>
    </li>
  );
}

function KanbanColumn({ column, columns, cards, onAdd, actions }: { column: Column; columns: Column[]; cards: CardDoc[]; onAdd: (title: string) => void; actions: { move: (c: CardDoc, col: string) => void; title: (c: CardDoc, v: string) => void; points: (c: CardDoc, v: number | undefined) => void; del: (c: CardDoc) => void } }) {
  const { t } = useLingui();
  const drop = useDroppable({ id: `col:${column.id}` });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement;
    const v = input.value.trim();
    if (!v) return;
    onAdd(v);
    input.value = "";
  }
  return (
    <section className="tc-kcol" aria-label={column.title} ref={drop.setNodeRef} style={{ outline: drop.isOver ? "2px dashed var(--accent)" : undefined }}>
      <h4 className="tc-h" style={{ fontSize: "var(--text-md)" }}>{column.title} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({cards.length})</span></h4>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {cards.map((c) => (
          <KanbanCard key={c.id} card={c} columns={columns} onMove={(col) => actions.move(c, col)} onTitle={(v) => actions.title(c, v)} onPoints={(v) => actions.points(c, v)} onDelete={() => actions.del(c)} />
        ))}
      </ul>
      <form onSubmit={submit} style={{ display: "flex", gap: "var(--space-2)" }}>
        <TextInput name="title" aria-label={t`New card in “${column.title}”`} placeholder={t`New card`} maxLength={300} />
        <IconButton label={t`Add a card to “${column.title}”`} type="submit"><Plus size={18} /></IconButton>
      </form>
    </section>
  );
}

export const kanbanApp: AppModule<"kanban"> = {
  type: "kanban",
  useLabels() {
    const { t } = useLingui();
    return { typeName: t`Kanban board`, description: t`Sticky notes moved between columns (to do, in progress, done…).`, defaultName: t`Kanban board` };
  },
  Icon: SquareKanban,
  defaultConfig: () => ({
    columns: [
      { id: `col_${newId()}`, title: tMacro`To do` },
      { id: `col_${newId()}`, title: tMacro`In progress` },
      { id: `col_${newId()}`, title: tMacro`Done` },
    ],
  }),
  Editor({ app, onChange }) {
    const { t } = useLingui();
    const [columns, setColumns] = useState<Column[]>(app.config.columns);
    const update = (next: Column[]) => (setColumns(next), onChange({ columns: next }));
    return (
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <legend style={{ fontWeight: 600, marginBlockEnd: "var(--space-2)" }}>{t`Columns`}</legend>
        {columns.map((c, i) => (
          <div key={c.id} style={{ display: "flex", gap: "var(--space-2)" }}>
            <TextInput aria-label={t`Name of column ${i + 1}`} value={c.title} maxLength={100} onChange={(e) => update(columns.map((x) => (x.id === c.id ? { ...x, title: e.currentTarget.value } : x)))} />
            <IconButton label={t`Remove column ${i + 1}`} disabled={columns.length <= 1} onClick={() => update(columns.filter((x) => x.id !== c.id))}><Trash2 size={16} /></IconButton>
          </div>
        ))}
        <div>
          <Button icon={<Plus size={16} />} disabled={columns.length >= 12} onClick={() => update([...columns, { id: `col_${newId()}`, title: t`New column` }])}>{t`Add a column`}</Button>
        </div>
      </fieldset>
    );
  },
  Runtime({ app, store }) {
    const { t } = useLingui();
    const [cards, setCards] = useState<CardDoc[]>([]);
    useEffect(() => store.watch("kanbancard", app.id, setCards), [store, app.id]);
    const columns = app.config.columns;
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
    const firstColumn = columns[0]!.id;
    const known = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);
    // une carte dont la colonne a été supprimée reste visible, dans la première colonne
    const columnOf = (c: CardDoc) => (known.has(c.columnId) ? c.columnId : firstColumn);
    const inColumn = (colId: string, except?: string) => cards.filter((c) => columnOf(c) === colId && c.id !== except).sort(byOrder);

    const write = (c: CardDoc, patch: Partial<Pick<CardDoc, "columnId" | "title" | "order">> & { points?: number | undefined }) => {
      const { points: oldPoints, ...rest } = c;
      const points = "points" in patch ? patch.points : oldPoints;
      return store.put({ id: c.id, kind: "kanbancard", appId: app.id, columnId: rest.columnId, title: rest.title, order: rest.order, ...(patch.columnId ? { columnId: patch.columnId } : {}), ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.order ? { order: patch.order } : {}), ...(points !== undefined ? { points } : {}) });
    };
    const moveTo = (c: CardDoc, columnId: string, beforeId: string | null) => {
      const target = inColumn(columnId, c.id);
      const idx = beforeId ? target.findIndex((x) => x.id === beforeId) : target.length;
      const at = idx < 0 ? target.length : idx;
      return write(c, { columnId, order: orderBetween(target[at - 1]?.order ?? null, target[at]?.order ?? null) });
    };
    function end(e: DragEndEvent) {
      const card = cards.find((c) => `card:${c.id}` === e.active.id);
      const over = e.over ? String(e.over.id) : "";
      if (!card || !over || over === e.active.id) return;
      if (over.startsWith("col:")) void moveTo(card, over.slice(4), null);
      else {
        const target = cards.find((c) => `card:${c.id}` === over);
        if (target) void moveTo(card, columnOf(target), target.id);
      }
    }
    const add = (columnId: string, title: string) => {
      const last = inColumn(columnId).at(-1);
      return store.put({ kind: "kanbancard", appId: app.id, columnId, title, order: orderBetween(last?.order ?? null, null) });
    };

    return (
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={end}>
        <div className="tc-kanban" role="group" aria-label={t`Kanban board “${app.name}”`}>
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              columns={columns}
              cards={inColumn(col.id)}
              onAdd={(title) => void add(col.id, title)}
              actions={{
                move: (c, to) => void moveTo(c, to, null),
                title: (c, v) => void write(c, { title: v }),
                points: (c, v) => void write(c, { points: v }),
                del: (c) => void store.remove(c.id),
              }}
            />
          ))}
        </div>
      </DndContext>
    );
  },
};
