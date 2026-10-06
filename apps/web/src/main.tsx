import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import "@toccata/ui/fonts.css";
import "@toccata/ui/styles.css";
import "./app.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { session } from "./auth/session";
import { AppRoutes } from "./routes";
import { UpdatePrompt } from "./UpdatePrompt";
import { type Locale, activateLocale, detectLocale } from "./i18n";

function Root() {
  const [ready, setReady] = useState(false);
  const [locale, setLocale] = useState<Locale>(detectLocale());
  useEffect(() => {
    void activateLocale(locale).then(() => setReady(true));
    void session.bootstrap();
    session.watchNetwork();
    return i18n.on("change", () => setLocale(i18n.locale as Locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activation initiale uniquement
  }, []);
  if (!ready) return null;
  return (
    <I18nProvider i18n={i18n}>
      <BrowserRouter>
        <AppRoutes locale={locale} />
      </BrowserRouter>
      <UpdatePrompt />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
