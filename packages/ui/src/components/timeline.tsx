import { Check, Eye, EyeOff, Lock, Plus } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export type StepState = "todo" | "active" | "done" | "locked";
export type StepItem = { id: string; label: string; state: StepState; hidden?: boolean };

export type StepTimelineLabels = {
  /** Nom de la liste, ex. « Étapes ». */
  list: string;
  /** Texte lu pour l'état d'une étape (en plus de sa position visuelle). */
  stateDone: string;
  stateLocked: string;
  stateHidden: string;
  /** Noms accessibles des boutons (reçoivent le libellé de l'étape). */
  hide: (stepLabel: string) => string;
  show: (stepLabel: string) => string;
  add: string;
};

/**
 * Timeline d'étapes (le script, D4 de l'article).
 * - Un élève passe `onSelect` seulement ; l'enseignant ajoute `onToggleHidden` (l'œil) et `onAdd`.
 * - L'œil est un vrai bouton frère du bouton d'étape (pas d'interactif imbriqué).
 * - Étape verrouillée : reste focalisable (`aria-disabled`) mais ne se sélectionne pas.
 */
export type StepItemProps = { id: string; className: string; "data-state": StepState; "data-hidden": "true" | "false"; children: ReactNode };

const DefaultItem: ComponentType<StepItemProps> = ({ children, id: _id, ...rest }) => <li {...rest}>{children}</li>;

export function StepTimeline({ steps, labels, onSelect, onToggleHidden, onAdd, dragHandle, itemAs }: {
  steps: readonly StepItem[];
  labels: StepTimelineLabels;
  onSelect?: (id: string) => void;
  onToggleHidden?: (id: string, hidden: boolean) => void;
  onAdd?: () => void;
  /** Emplacement de la poignée de glisser-déposer (branchée en Phase 3). */
  dragHandle?: (id: string) => ReactNode;
  /** Remplace le `<li>` de chaque étape (l'application y branche le tri par glisser-déposer ; ce paquet n'en dépend pas). */
  itemAs?: ComponentType<StepItemProps>;
}) {
  const Item = itemAs ?? DefaultItem;
  return (
    <ol className="tc-steps" aria-label={labels.list}>
      {steps.map((s, i) => {
        const locked = s.state === "locked";
        return (
          <Item key={s.id} id={s.id} className="tc-step" data-state={s.state} data-hidden={s.hidden ? "true" : "false"}>
            {dragHandle?.(s.id)}
            <button
              type="button"
              className="tc-step__main"
              aria-current={s.state === "active" ? "step" : undefined}
              aria-disabled={locked || undefined}
              onClick={() => {
                if (!locked) onSelect?.(s.id);
              }}
            >
              <span className="tc-step__n" aria-hidden="true">{i + 1}</span>
              <span>{s.label}</span>
              {s.state === "done" ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  <span className="tc-sr-only">{labels.stateDone}</span>
                </>
              ) : null}
              {locked ? (
                <>
                  <Lock size={14} aria-hidden="true" />
                  <span className="tc-sr-only">{labels.stateLocked}</span>
                </>
              ) : null}
              {s.hidden ? <span className="tc-sr-only">{labels.stateHidden}</span> : null}
            </button>
            {onToggleHidden ? (
              <button
                type="button"
                className="tc-step__eye"
                aria-label={s.hidden ? labels.show(s.label) : labels.hide(s.label)}
                onClick={() => onToggleHidden(s.id, !s.hidden)}
              >
                {s.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            ) : null}
          </Item>
        );
      })}
      {onAdd ? (
        <li className="tc-step tc-step--add">
          <button type="button" className="tc-step__main" aria-label={labels.add} onClick={onAdd}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </li>
      ) : null}
    </ol>
  );
}
