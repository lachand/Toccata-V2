import { Route, Routes } from "react-router";
import { GuestOnly, RequireAuth, RequireTeacher } from "./auth/guards";
import { Layout } from "./components/Layout";
import type { Locale } from "./i18n";
import { WorkspaceProvider } from "./data/provider";
import { Activities } from "./pages/Activities";
import { ActivityEditor } from "./pages/ActivityEditor";
import { ClassDetail } from "./pages/ClassDetail";
import { Classes } from "./pages/Classes";
import { Distribute } from "./pages/Distribute";
import { Gallery } from "./pages/Gallery";
import { Mirror } from "./pages/Mirror";
import { Privacy } from "./pages/Privacy";
import { Review } from "./pages/Review";
import { Monitor } from "./pages/Monitor";
import { Library } from "./pages/Library";
import { Login } from "./pages/Login";
import { Remote } from "./pages/Remote";
import { Run } from "./pages/Run";
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
                <Route path="/activities/:id/distribute" element={<RequireTeacher><Distribute locale={locale} /></RequireTeacher>} />
                <Route path="/run/:instanceId" element={<Run locale={locale} />} />
                <Route path="/activities/:id/monitor" element={<RequireTeacher><Monitor locale={locale} /></RequireTeacher>} />
                <Route path="/activities/:id/monitor/:instanceId" element={<RequireTeacher><Mirror locale={locale} /></RequireTeacher>} />
                <Route path="/activities/:id/review" element={<RequireTeacher><Review locale={locale} /></RequireTeacher>} />
                <Route path="/remote/:id" element={<RequireTeacher><Remote locale={locale} /></RequireTeacher>} />
                <Route path="/library" element={<RequireTeacher><Library locale={locale} /></RequireTeacher>} />
                <Route path="/privacy" element={<Privacy locale={locale} />} />
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
