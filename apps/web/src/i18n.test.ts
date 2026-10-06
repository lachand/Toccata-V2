import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, detectLocale } from "./i18n";

describe("detectLocale", () => {
  it("préfère la langue enregistrée", () => {
    expect(detectLocale("en", ["fr-FR"])).toBe("en");
  });
  it("retombe sur les langues du navigateur, variantes régionales comprises", () => {
    expect(detectLocale(null, ["de-DE", "en-GB", "fr"])).toBe("en");
    expect(detectLocale(null, ["fr-CA"])).toBe("fr");
  });
  it("ignore une valeur enregistrée inconnue", () => {
    expect(detectLocale("xx", ["en-US"])).toBe("en");
  });
  it("utilise le français quand rien ne correspond", () => {
    expect(detectLocale(null, ["ja-JP"])).toBe(DEFAULT_LOCALE);
    expect(detectLocale(null, [])).toBe(DEFAULT_LOCALE);
  });
});
