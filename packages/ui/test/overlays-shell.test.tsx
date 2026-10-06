import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell, Button, Content, Dialog, Rail, RailItem, Tabs, TabsContent, TabsList, TabsTrigger, TopBar } from "../src";
import { expectNoA11yViolations } from "./axe";

describe("Dialog", () => {
  function Demo({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Ajouter</Button>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose?.(); }} title="Ajouter une ressource" description="Choisis un fichier ou un lien." closeLabel="Fermer" footer={<Button variant="primary">Valider</Button>}>
          <p>Contenu</p>
        </Dialog>
      </>
    );
  }
  it("s'ouvre avec un nom et une description accessibles, et se ferme à Échap", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    const d = screen.getByRole("dialog", { name: "Ajouter une ressource" });
    expect(d).toHaveAccessibleDescription("Choisis un fichier ou un lien.");
    await expectNoA11yViolations(d);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    // le focus revient au déclencheur (Radix le fait après un tick)
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajouter" })).toHaveFocus());
  });
  it("se ferme avec le bouton nommé par l'appelant", async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("navigue aux flèches", async () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections"><TabsTrigger value="a">Contenu</TabsTrigger><TabsTrigger value="b">Élèves</TabsTrigger></TabsList>
        <TabsContent value="a">A</TabsContent><TabsContent value="b">B</TabsContent>
      </Tabs>,
    );
    screen.getByRole("tab", { name: "Contenu" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Élèves" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Élèves" })).toHaveAttribute("aria-selected", "true");
    await expectNoA11yViolations(container);
  });
});

describe("AppShell", () => {
  it("compose rail, barre et contenu sans violation, avec la page courante signalée", async () => {
    const { container } = render(
      <AppShell rail={<Rail label="Navigation principale" brand="Toccata"><RailItem href="#/activites" current>Mes activités</RailItem><RailItem onClick={() => {}}>Modèles</RailItem></Rail>}>
        <TopBar title="Mes activités"><Button variant="primary">Nouvelle activité</Button></TopBar>
        <Content><p>Contenu</p></Content>
      </AppShell>,
    );
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mes activités" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Modèles" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
