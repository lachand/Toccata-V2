import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { type Locale, activateLocale, detectLocale } from "./i18n";
import "./styles/tokens.css";

function Root() {
  const [ready, setReady] = useState(false);
  const [locale, setLocale] = useState<Locale>(detectLocale());
  useEffect(() => {
    void activateLocale(locale).then(() => setReady(true));
    return i18n.on("change", () => setLocale(i18n.locale as Locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activation initiale uniquement
  }, []);
  if (!ready) return null;
  return (
    <I18nProvider i18n={i18n}>
      <App locale={locale} />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
