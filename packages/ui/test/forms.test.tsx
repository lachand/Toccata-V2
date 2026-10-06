import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Field, NativeSelect, Segmented, Switch, TextInput } from "../src";
import { expectNoA11yViolations } from "./axe";

describe("Field + TextInput", () => {
  it("relie étiquette, aide et erreur au champ", async () => {
    const { container } = render(
      <Field label="Nom de l'activité" hint="200 caractères au plus" error="Le nom est obligatoire" required>
        <TextInput />
      </Field>,
    );
    const input = screen.getByLabelText("Nom de l'activité");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("200 caractères au plus Le nom est obligatoire");
    await expectNoA11yViolations(container);
  });
  it("n'est pas marqué invalide sans erreur", () => {
    render(<Field label="Nom"><TextInput /></Field>);
    expect(screen.getByLabelText("Nom")).not.toHaveAttribute("aria-invalid");
  });
  it("accepte la saisie", async () => {
    render(<Field label="Nom"><TextInput /></Field>);
    await userEvent.type(screen.getByLabelText("Nom"), "Atelier");
    expect(screen.getByLabelText("Nom")).toHaveValue("Atelier");
  });
  it("deux champs ont des identifiants distincts", () => {
    render(<><Field label="A"><TextInput /></Field><Field label="B"><TextInput /></Field></>);
    expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id);
  });
});

describe("NativeSelect", () => {
  it("est étiqueté et change de valeur", async () => {
    const { container } = render(
      <Field label="Langue">
        <NativeSelect defaultValue="fr"><option value="fr">Français</option><option value="en">English</option></NativeSelect>
      </Field>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Langue"), "en");
    expect(screen.getByLabelText("Langue")).toHaveValue("en");
    await expectNoA11yViolations(container);
  });
});

describe("Switch", () => {
  function Demo({ on }: { on: (v: boolean) => void }) {
    const [v, setV] = useState(false);
    return <Switch label="Afficher aux élèves" checked={v} onCheckedChange={(x) => { setV(x); on(x); }} />;
  }
  it("se bascule à la souris et au clavier", async () => {
    const on = vi.fn();
    const { container } = render(<Demo on={on} />);
    const sw = screen.getByRole("switch", { name: "Afficher aux élèves" });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    sw.focus();
    await userEvent.keyboard(" ");
    expect(sw).not.toBeChecked();
    expect(on.mock.calls.map((c) => c[0])).toEqual([true, false]);
    await expectNoA11yViolations(container);
  });
});

describe("Segmented", () => {
  function Demo() {
    const [v, setV] = useState<"fr" | "en">("fr");
    return <Segmented label="Langue" value={v} onChange={setV} options={[{ value: "fr", label: "Français", lang: "fr" }, { value: "en", label: "English", lang: "en" }]} />;
  }
  it("change la sélection et ne se désélectionne jamais", async () => {
    const { container } = render(<Demo />);
    const fr = screen.getByRole("radio", { name: "Français" });
    const en = screen.getByRole("radio", { name: "English" });
    expect(fr).toBeChecked();
    await userEvent.click(en);
    expect(en).toBeChecked();
    await userEvent.click(en); // un second clic ne désélectionne pas
    expect(en).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Langue" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
  it("se parcourt aux flèches", async () => {
    render(<Demo />);
    screen.getByRole("radio", { name: "Français" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "English" })).toHaveFocus();
  });
});
