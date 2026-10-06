import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render } from "@testing-library/react";
import { useEffect, useState, type ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { Layout } from "./components/Layout";
import { type Locale, activateLocale } from "./i18n";

function Harness({ initial, children }: { initial: Locale; children: (l: Locale) => ReactElement }) {
  const [locale, setLocale] = useState<Locale>(initial);
  useEffect(() => i18n.on("change", () => setLocale(i18n.locale as Locale)), []);
  return (
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <Layout>{children(locale)}</Layout>
      </MemoryRouter>
    </I18nProvider>
  );
}

export async function renderIn(locale: Locale, ui: (l: Locale) => ReactElement) {
  await activateLocale(locale, false);
  return render(<Harness initial={locale}>{ui}</Harness>);
}
