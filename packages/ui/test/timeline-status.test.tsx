import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepTimeline, SyncStatus, TimerChip, formatDuration, type StepItem, type StepTimelineLabels } from "../src";
import { expectNoA11yViolations } from "./axe";

const labels: StepTimelineLabels = {
  list: "Étapes",
  stateDone: "terminée",
  stateLocked: "verrouillée",
  stateHidden: "masquée aux élèves",
  hide: (s) => `Masquer l'étape ${s}`,
  show: (s) => `Afficher l'étape ${s}`,
  add: "Ajouter une étape",
};
const steps: StepItem[] = [
  { id: "a", label: "Backlog", state: "done" },
  { id: "b", label: "Estimer", state: "active" },
  { id: "c", label: "Construire", state: "locked" },
  { id: "d", label: "Bonus", state: "todo", hidden: true },
];

describe("StepTimeline", () => {
  it("expose la liste, l'étape courante et les états en texte", async () => {
    const { container } = render(<StepTimeline steps={steps} labels={labels} onSelect={() => {}} />);
    const list = screen.getByRole("list", { name: "Étapes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Estimer/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Backlog.*terminée/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Construire.*verrouillée/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /Bonus.*masquée aux élèves/ })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("vue élève : ni œil ni ajout", () => {
    render(<StepTimeline steps={steps} labels={labels} onSelect={() => {}} />);
    expect(screen.queryByRole("button", { name: /Masquer|Afficher|Ajouter/ })).toBeNull();
  });

  it("sélectionne une étape à la souris et au clavier, mais pas une étape verrouillée", async () => {
    const onSelect = vi.fn();
    render(<StepTimeline steps={steps} labels={labels} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Backlog/ }));
    screen.getByRole("button", { name: /Bonus/ }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Construire/ }));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["a", "d"]);
  });

  it("vue enseignant : l'œil bascule la visibilité avec un nom propre à l'étape", async () => {
    const onToggle = vi.fn();
    const onAdd = vi.fn();
    const { container } = render(<StepTimeline steps={steps} labels={labels} onSelect={() => {}} onToggleHidden={onToggle} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: "Masquer l'étape Estimer" }));
    await userEvent.click(screen.getByRole("button", { name: "Afficher l'étape Bonus" }));
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    expect(onToggle.mock.calls).toEqual([["b", true], ["d", false]]);
    expect(onAdd).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it("n'imbrique jamais un bouton dans un bouton", () => {
    const { container } = render(<StepTimeline steps={steps} labels={labels} onSelect={() => {}} onToggleHidden={() => {}} onAdd={() => {}} />);
    expect(container.querySelector("button button")).toBeNull();
  });

  it("accepte un emplacement de poignée de glisser-déposer", () => {
    render(<StepTimeline steps={steps} labels={labels} dragHandle={(id) => <span data-testid={`h-${id}`} />} />);
    expect(screen.getByTestId("h-b")).toBeInTheDocument();
  });
});

describe("SyncStatus", () => {
  it("annonce son état comme texte (jamais la couleur seule)", async () => {
    const { container } = render(<SyncStatus state="pending" label="Hors ligne, 3 modifications en attente" />);
    expect(screen.getByRole("status")).toHaveTextContent("Hors ligne, 3 modifications en attente");
    expect(screen.getByRole("status")).toHaveAttribute("data-status", "pending");
    await expectNoA11yViolations(container);
  });
});

describe("TimerChip", () => {
  it("formate le temps", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(1)).toBe("00:01"); // arrondi à la seconde supérieure : on n'affiche jamais 00:00 avant la fin
    expect(formatDuration(65_000)).toBe("01:05");
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(-5)).toBe("00:00");
  });
  it("change de ton aux seuils du chronomètre", () => {
    const tone = (ms: number) => {
      const { container, unmount } = render(<TimerChip remainingMs={ms} label="Temps restant" />);
      const t = container.querySelector(".tc-timer")!.getAttribute("data-tone");
      unmount();
      return t;
    };
    expect(tone(10 * 60_000)).toBe("ok");
    expect(tone(4 * 60_000)).toBe("amber");
    expect(tone(60_000)).toBe("red");
  });
  it("donne une valeur lisible et un horodatage ISO", async () => {
    const { container } = render(<TimerChip remainingMs={312_000} label="Temps restant" />);
    const t = screen.getByText("05:12");
    expect(t).toHaveAttribute("datetime", "PT0H5M12S");
    expect(t).toHaveAccessibleName("Temps restant 05:12");
    await expectNoA11yViolations(container);
  });
});
