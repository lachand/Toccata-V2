import { Route, Routes } from "react-router";
import { GuestOnly, RequireAuth, RequireTeacher } from "./auth/guards";
import { Layout } from "./components/Layout";
import type { Locale } from "./i18n";
import { WorkspaceProvider } from "./data/provider";
import { Activities } from "./pages/Activities";
import { ActivityEditor } from "./pages/ActivityEditor";
import { ClassDetail } from "./pages/ClassDetail";
import { Classes } from "./pages/Classes";
import { Gallery } from "./pages/Gallery";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";

/** Routes de l'application (séparées de `main.tsx` pour être testées avec un routeur en mémoire). */
export function AppRoutes({ locale }: { locale: Locale }) {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login locale={locale} /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup locale={locale} /></GuestOnly>} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <WorkspaceProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Activities locale={locale} />} />
                <Route path="/activities/:id" element={<RequireTeacher><ActivityEditor locale={locale} /></RequireTeacher>} />
                <Route path="/gallery" element={<Gallery locale={locale} />} />
                <Route path="/classes" element={<RequireTeacher><Classes locale={locale} /></RequireTeacher>} />
                <Route path="/classes/:id" element={<RequireTeacher><ClassDetail locale={locale} /></RequireTeacher>} />
              </Routes>
            </Layout>
            </WorkspaceProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
