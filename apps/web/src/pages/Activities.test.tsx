import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderIn } from "../test-utils";
import { Activities } from "./Activities";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Mes activités", () => {
  it("s'affiche en français : titres, pluriels, dates", async () => {
    await renderIn("fr", (l) => <Activities locale={l} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    const card = screen.getByRole("article", { name: "Atelier Agile : la ville en Lego" });
    expect(within(card).getByText("En cours · étape 2 sur 4")).toBeInTheDocument();
    expect(within(card).getByText(/4 étapes · 20 élèves/)).toBeInTheDocument();
    expect(within(card).getByText(/5 oct\. 2026/)).toBeInTheDocument();
    expect(screen.getByText("3 modifications en attente de synchronisation")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("s'affiche en anglais", async () => {
    await renderIn("en", (l) => <Activities locale={l} />);
    expect(screen.getByRole("heading", { level: 1, name: "My activities" })).toBeInTheDocument();
    const card = screen.getByRole("article", { name: "Atelier Agile : la ville en Lego" }); // le contenu n'est pas traduit
    expect(within(card).getByText("In progress · step 2 of 4")).toBeInTheDocument();
    expect(within(card).getByText(/4 steps · 20 students/)).toBeInTheDocument();
    expect(screen.getByText("3 changes waiting to sync")).toBeInTheDocument();
  });

  it("utilise le singulier quand il y a un seul élément", async () => {
    await renderIn("en", (l) => <Activities locale={l} />);
    await userEvent.click(screen.getByRole("radio", { name: "Drafts" }));
    const rev = screen.getByRole("article", { name: "Revue de fin de chapitre" });
    expect(within(rev).getByText("1 step")).toBeInTheDocument();
  });

  it("filtre les activités", async () => {
    await renderIn("fr", (l) => <Activities locale={l} />);
    expect(screen.getAllByRole("article")).toHaveLength(5);
    await userEvent.click(screen.getByRole("radio", { name: "Modèles partagés" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Débat mouvant, 4e" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "En cours" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("change de langue à chaud", async () => {
    await renderIn("fr", (l) => <Activities locale={l} />);
    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "My activities" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(localStorage.getItem("toccata.locale")).toBe("en");
  });

  it("signale la perte de connexion", async () => {
    await renderIn("en", (l) => <Activities locale={l} />);
    expect(screen.getByRole("status")).toHaveTextContent("Online");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Offline, your changes are kept"));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("la pseudo-locale change tous les textes d'interface", async () => {
    await renderIn("en", (l) => <Activities locale={l} />);
    cleanup();
    await renderIn("pseudo" as never, (l) => <Activities locale={l} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).not.toBe("My activities");
    expect(h1.textContent).toMatch(/[^\x00-\x7F]/);
  });
});
