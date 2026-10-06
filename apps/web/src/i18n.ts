import { i18n } from "@lingui/core";

export const LOCALES = { en: "English", fr: "Français" } as const;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "fr";
const STORAGE_KEY = "toccata.locale";

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && x in LOCALES;
}

/** Préférence enregistrée > langues du navigateur > français. */
export function detectLocale(
  saved: string | null = readSaved(),
  preferred: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages,
): Locale {
  if (isLocale(saved)) return saved;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Charge le catalogue (compilé à la volée par le plugin Vite) et active la langue. */
export async function activateLocale(locale: Locale | "pseudo", persist = true): Promise<void> {
  const { messages } = await import(`./locales/${locale}/messages.po`);
  i18n.load(locale, messages);
  i18n.activate(locale);
  document.documentElement.lang = locale === "pseudo" ? "en" : locale;
  if (persist && locale !== "pseudo") {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* stockage indisponible : la langue ne sera pas mémorisée */
    }
  }
}
