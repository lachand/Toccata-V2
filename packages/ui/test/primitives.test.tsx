import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Avatar, AvatarGroup, Button, Card, EmptyState, IconButton, Pill, initials } from "../src";
import { expectNoA11yViolations } from "./axe";

describe("Button", () => {
  it("est un bouton de type button par défaut et appelle onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);
    const b = screen.getByRole("button", { name: "Enregistrer" });
    expect(b).toHaveAttribute("type", "button");
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("désactive et signale l'état occupé pendant le chargement", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Envoi en cours</Button>);
    const b = screen.getByRole("button", { name: "Envoi en cours" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("applique la variante et la taille", () => {
    render(<Button variant="primary" size="lg">Ok</Button>);
    expect(screen.getByRole("button")).toHaveClass("tc-btn", "tc-btn--primary", "tc-btn--lg");
  });
  it("n'a pas de violation d'accessibilité", async () => {
    const { container } = render(<><Button>A</Button><Button variant="danger" disabled>B</Button></>);
    await expectNoA11yViolations(container);
  });
});

describe("IconButton", () => {
  it("expose son nom accessible, le pictogramme est masqué", async () => {
    const { container } = render(<IconButton label="Fermer"><svg data-testid="i" /></IconButton>);
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("Pill, Card, EmptyState", () => {
  it("Pill applique le ton", () => {
    render(<Pill tone="crit">Besoin d'aide</Pill>);
    expect(screen.getByText("Besoin d'aide")).toHaveClass("tc-pill--crit");
  });
  it("Card accepte un élément sémantique", () => {
    render(<Card as="article" aria-label="Activité">x</Card>);
    expect(screen.getByRole("article", { name: "Activité" })).toHaveClass("tc-card");
  });
  it("EmptyState a un titre du bon niveau", async () => {
    const { container } = render(<EmptyState title="Aucune activité" description="Crée la première." headingLevel={2} action={<Button>Créer</Button>} />);
    expect(screen.getByRole("heading", { level: 2, name: "Aucune activité" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("Avatar", () => {
  it("calcule des initiales sans casser les caractères composés", () => {
    expect(initials("Hugo Martin")).toBe("HM");
    expect(initials("lina")).toBe("L");
    expect(initials("  Éloïse  de  la Tour ")).toBe("ÉT");
    expect(initials("👩🏽‍🏫 Durand")).toBe("👩🏽‍🏫D");
    expect(initials("")).toBe("");
  });
  it("porte le nom complet comme nom accessible", async () => {
    const { container } = render(<Avatar name="Hugo Martin" colorIndex={2} />);
    expect(screen.getByRole("img", { name: "Hugo Martin" })).toHaveAttribute("data-c", "2");
    await expectNoA11yViolations(container);
  });
  it("AvatarGroup résume le surplus avec un libellé fourni par l'appelant", () => {
    render(<AvatarGroup max={2} people={[{ name: "A B" }, { name: "C D" }, { name: "E F" }, { name: "G H" }]} overflowLabel={(n) => `${n} autres personnes`} />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("img", { name: "2 autres personnes" })).toHaveTextContent("+2");
  });
});
