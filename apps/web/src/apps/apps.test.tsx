import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppModule, AppType, InstanceStore, NewRuntimeDoc, RuntimeDoc, RuntimeKind } from "@toccata/apps-sdk";
import type { AppDoc } from "@toccata/schema";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { activateLocale } from "../i18n";
import { formApp } from "./form";
import { kanbanApp } from "./kanban";
import { timerApp } from "./timer";
import { YStore } from "./ystore";

/** Instance simulée : plusieurs participants partagent les mêmes documents, comme dans une vraie base répliquée. */
class Backend {
  docs: RuntimeDoc[] = [];
  now = 1_700_000_000_000;
  private listeners = new Set<() => void>();
  private n = 0;
  private notify() {
    queueMicrotask(() => this.listeners.forEach((l) => l()));
  }
  as(author: string, role: "teacher" | "student" = "student"): InstanceStore {
    return {
      viewer: { id: author, role },
      serverNow: () => this.now,
      watch: <K extends RuntimeKind>(kind: K, appId: string, cb: (d: RuntimeDoc<K>[]) => void) => {
        const emit = () => cb(this.docs.filter((d) => d.kind === kind && d.appId === appId) as RuntimeDoc<K>[]);
        this.listeners.add(emit);
        emit();
        return () => void this.listeners.delete(emit);
      },
      put: async <K extends RuntimeKind>(doc: NewRuntimeDoc<K>) => {
        const at = doc.id ? this.docs.findIndex((d) => d.id === doc.id) : -1;
        const id = doc.id ?? `0${String(1000 + this.n++).padStart(21, "0")}`;
        const full = { ...doc, id, authorId: at >= 0 ? this.docs[at]!.authorId : author, createdAt: this.now, updatedAt: this.now } as unknown as RuntimeDoc;
        if (at >= 0) this.docs[at] = full;
        else this.docs.push(full);
        this.notify();
        return id;
      },
      remove: async (id) => {
        this.docs = this.docs.filter((d) => d.id !== id);
        this.notify();
      },
    };
  }
}

const APP_ID = "0app0app0app0app0app00";
const base = { id: APP_ID, kind: "app", scope: { type: "activity" }, createdAt: 1, updatedAt: 1 } as const;

async function show<T extends AppType>(m: AppModule<T>, app: AppDoc, store: InstanceStore) {
  await activateLocale("en", false);
  const R = m.Runtime as unknown as React.ComponentType<{ app: AppDoc; store: InstanceStore }>;
  return render(<I18nProvider i18n={i18n}><R app={app} store={store} /></I18nProvider>);
}

afterEach(cleanup);

describe("chronomètre", () => {
  const app = { ...base, type: "timer", name: "Chrono", config: { durationSec: 300 } } as AppDoc;

  it("démarre pour tout le monde et se calcule avec l'heure SERVEUR, pas celle de l'appareil", async () => {
    const be = new Backend();
    await show(timerApp, app, be.as("teacher", "teacher"));
    expect(screen.getByRole("time")).toHaveTextContent("05:00");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Pause" });

    // un élève, avec la même base, voit le chrono en marche ; 90 s plus tard (heure serveur) il lit 03:30, en orange
    be.now += 90_000;
    cleanup();
    await show(timerApp, app, be.as("student1"));
    await waitFor(() => expect(screen.getByRole("time")).toHaveTextContent("03:30"));
    expect(screen.getByRole("time").closest(".tc-timer")).toHaveAttribute("data-tone", "amber");
  });

  it("met en pause en gardant le temps restant, puis reprend, puis se réinitialise", async () => {
    const be = new Backend();
    await show(timerApp, app, be.as("t", "teacher"));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    be.now += 60_000;
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByRole("time")).toHaveTextContent("04:00");
    be.now += 600_000; // en pause, le temps ne s'écoule pas
    expect(screen.getByRole("time")).toHaveTextContent("04:00");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByRole("time")).toHaveTextContent("05:00"));
  });

  it("annonce la fin du temps", async () => {
    const be = new Backend();
    await show(timerApp, app, be.as("t", "teacher"));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    be.now += 400_000;
    await waitFor(() => expect(screen.getByRole("time")).toHaveTextContent("00:00"), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Time is up."));
  });
});

describe("kanban", () => {
  const cfg = { columns: [{ id: "todo", title: "To do" }, { id: "doing", title: "Doing" }, { id: "done", title: "Done" }] };
  const app = { ...base, type: "kanban", name: "Tableau", config: cfg } as AppDoc;

  it("ajoute des cartes, les déplace d'une colonne à l'autre (clavier) et les supprime ; deux participants se voient", async () => {
    const be = new Backend();
    await show(kanbanApp, app, be.as("a"));
    const todo = within(screen.getByRole("region", { name: "To do" }));
    await userEvent.type(todo.getByRole("textbox", { name: /New card in/ }), "Écrire le plan{Enter}");
    await userEvent.type(todo.getByRole("textbox", { name: /New card in/ }), "Relire{Enter}");
    await waitFor(() => expect(todo.getAllByRole("textbox", { name: "Card title" })).toHaveLength(2));
    expect(todo.getAllByRole("textbox", { name: "Card title" }).map((i) => (i as HTMLInputElement).value)).toEqual(["Écrire le plan", "Relire"]);

    await userEvent.selectOptions(todo.getByRole("combobox", { name: "Move “Écrire le plan” to" }), "doing");
    const doing = within(screen.getByRole("region", { name: "Doing" }));
    await waitFor(() => expect(doing.getByDisplayValue("Écrire le plan")).toBeInTheDocument());
    expect(todo.queryByDisplayValue("Écrire le plan")).toBeNull();

    // un autre participant, sur la même base, voit les mêmes colonnes
    cleanup();
    await show(kanbanApp, app, be.as("b"));
    expect(within(screen.getByRole("region", { name: "Doing" })).getByDisplayValue("Écrire le plan")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("region", { name: "To do" })).getByRole("button", { name: "Delete card “Relire”" }));
    await waitFor(() => expect(screen.queryByDisplayValue("Relire")).toBeNull());
  });

  it("une carte dont la colonne a disparu reste visible, dans la première colonne", async () => {
    const be = new Backend();
    await be.as("a").put({ kind: "kanbancard", appId: APP_ID, columnId: "supprimee", title: "Orpheline", order: "a0" });
    await show(kanbanApp, app, be.as("a"));
    expect(within(await screen.findByRole("region", { name: "To do" })).getByDisplayValue("Orpheline")).toBeInTheDocument();
  });

  it("garde l'ordre des cartes d'une colonne après des insertions concurrentes", async () => {
    const be = new Backend();
    const [a, b] = [be.as("a"), be.as("b")];
    await Promise.all([a.put({ kind: "kanbancard", appId: APP_ID, columnId: "todo", title: "A", order: "a0" }), b.put({ kind: "kanbancard", appId: APP_ID, columnId: "todo", title: "B", order: "a1" })]);
    await show(kanbanApp, app, a);
    const col = within(await screen.findByRole("region", { name: "To do" }));
    expect(col.getAllByRole("textbox", { name: "Card title" }).map((i) => (i as HTMLInputElement).value)).toEqual(["A", "B"]);
  });
});

describe("questionnaire", () => {
  const fields = [
    { id: "q1", label: "Ton prénom", type: "text", required: true },
    { id: "q2", label: "Couleur", type: "choice", required: true, options: ["Rouge", "Vert"] },
    { id: "q3", label: "Fruits", type: "multichoice", required: false, options: ["Pomme", "Poire"] },
  ];
  const app = { ...base, type: "form", name: "Quiz", config: { fields, blocking: true } } as AppDoc;

  it("exige les réponses obligatoires, envoie, puis verrouille les champs", async () => {
    const be = new Backend();
    await show(formApp, app, be.as("eleve"));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect((await screen.findAllByText("This question is required.")).length).toBe(2);
    expect(be.docs.some((d) => d.kind === "formanswer" && d.submitted)).toBe(false);

    await userEvent.type(screen.getByRole("textbox", { name: /Ton prénom/ }), "Lina");
    await userEvent.click(screen.getByRole("radio", { name: "Vert" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Poire" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Answers submitted.");
    const sent = be.docs.find((d) => d.kind === "formanswer" && d.submitted);
    expect(sent).toMatchObject({ authorId: "eleve", answers: { q1: "Lina", q2: "Vert", q3: ["Poire"] } });
    expect(screen.getByRole("textbox", { name: /Ton prénom/ })).toBeDisabled();
  });

  it("chaque participant a sa propre réponse", async () => {
    const be = new Backend();
    await show(formApp, app, be.as("a"));
    await userEvent.type(screen.getByRole("textbox", { name: /Ton prénom/ }), "Anne");
    await userEvent.click(screen.getByRole("radio", { name: "Rouge" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Answers submitted.");
    cleanup();
    await show(formApp, app, be.as("b"));
    expect(screen.getByRole("textbox", { name: /Ton prénom/ })).toHaveValue("");
    expect(screen.queryByText("Answers submitted.")).toBeNull();
  });
});

describe("texte partagé (Yjs)", () => {
  it("deux participants convergent, dans n'importe quel ordre de réception", async () => {
    const be = new Backend();
    const a = new YStore(be.as("a"), APP_ID);
    const b = new YStore(be.as("b"), APP_ID);
    a.doc.getText("t").insert(0, "Bonjour ");
    b.doc.getText("t").insert(0, "monde");
    await waitFor(() => expect(a.doc.getText("t").toString()).toBe(b.doc.getText("t").toString()));
    expect(a.doc.getText("t").toString()).toMatch(/Bonjour/);
    expect(a.doc.getText("t").toString()).toMatch(/monde/);
    // un troisième arrive en retard : il rejoue l'historique et obtient la même chose
    const c = new YStore(be.as("c"), APP_ID);
    await waitFor(() => expect(c.doc.getText("t").toString()).toBe(a.doc.getText("t").toString()));
    expect(Y.encodeStateVector(c.doc)).toEqual(Y.encodeStateVector(a.doc));
    [a, b, c].forEach((s) => s.destroy());
  });
});
