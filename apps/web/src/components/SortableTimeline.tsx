import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLingui } from "@lingui/react/macro";
import { StepTimeline, type StepItemProps } from "@toccata/ui";
import { GripVertical } from "lucide-react";
import { createContext, useContext, useMemo, type ComponentProps } from "react";

type Activator = { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined; setActivatorNodeRef: (el: HTMLElement | null) => void };
const HandleContext = createContext<Activator | null>(null);

function SortableItem({ id, children, ...rest }: StepItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const activator = useMemo(() => ({ attributes: attributes as unknown as Record<string, unknown>, listeners, setActivatorNodeRef }), [attributes, listeners, setActivatorNodeRef]);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-dragging={isDragging ? "true" : undefined} {...rest}>
      <HandleContext.Provider value={activator}>{children}</HandleContext.Provider>
    </li>
  );
}

function Handle({ label }: { label: string }) {
  const a = useContext(HandleContext);
  return (
    <button type="button" className="tc-step__handle" aria-label={label} ref={a?.setActivatorNodeRef} {...a?.attributes} {...a?.listeners}>
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );
}

type Props = Omit<ComponentProps<typeof StepTimeline>, "dragHandle" | "itemAs"> & {
  /** Appelé quand une étape est déposée : nouvel indice dans la liste après déplacement. */
  onMove: (id: string, toIndex: number) => void;
};

/** Timeline d'étapes triable à la souris, au toucher et au clavier (espace, flèches, espace), avec annonces traduites. */
export function SortableTimeline({ onMove, steps, ...rest }: Props) {
  const { t } = useLingui();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = steps.map((s) => s.id);
  const label = (id: unknown) => steps.find((s) => s.id === id)?.label ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => t`Picked up “${label(active.id)}”.`,
    onDragOver: ({ active, over }) => (over ? t`“${label(active.id)}” is now at position ${ids.indexOf(String(over.id)) + 1}.` : ""),
    onDragEnd: ({ active, over }) => (over ? t`“${label(active.id)}” dropped at position ${ids.indexOf(String(over.id)) + 1}.` : t`“${label(active.id)}” dropped.`),
    onDragCancel: ({ active }) => t`Move of “${label(active.id)}” cancelled.`,
  };
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    onMove(String(e.active.id), ids.indexOf(String(e.over.id)));
  }
  const handleLabel = t`Drag to reorder`;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} accessibility={{ announcements, screenReaderInstructions: { draggable: t`To move this step, press space, then the left or right arrow keys, then space again to drop. Escape cancels.` } }}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <StepTimeline {...rest} steps={steps} itemAs={SortableItem} dragHandle={() => <Handle label={handleLabel} />} />
      </SortableContext>
    </DndContext>
  );
}
