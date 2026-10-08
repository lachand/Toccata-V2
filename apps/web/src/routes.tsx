import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { GuestOnly, RequireAuth, RequireTeacher } from "./auth/guards";
import { Layout } from "./components/Layout";
import type { Locale } from "./i18n";
import { WorkspaceProvider } from "./data/provider";
import { Activities } from "./pages/Activities";
import { Privacy } from "./pages/Privacy";
import { Login } from "./pages/Login";
import { Run } from "./pages/Run";
import { Signup } from "./pages/Signup";

// Pages réservées à l'enseignant : chargées à la demande (l'élève et la connexion ne paient pas leur poids)
const ActivityEditor = lazy(() => import("./pages/ActivityEditor").then((m) => ({ default: m.ActivityEditor })));
const ClassDetail = lazy(() => import("./pages/ClassDetail").then((m) => ({ default: m.ClassDetail })));
const Classes = lazy(() => import("./pages/Classes").then((m) => ({ default: m.Classes })));
const Distribute = lazy(() => import("./pages/Distribute").then((m) => ({ default: m.Distribute })));
const Gallery = lazy(() => import("./pages/Gallery").then((m) => ({ default: m.Gallery })));
const Mirror = lazy(() => import("./pages/Mirror").then((m) => ({ default: m.Mirror })));
const Review = lazy(() => import("./pages/Review").then((m) => ({ default: m.Review })));
const Monitor = lazy(() => import("./pages/Monitor").then((m) => ({ default: m.Monitor })));
const Library = lazy(() => import("./pages/Library").then((m) => ({ default: m.Library })));
const Remote = lazy(() => import("./pages/Remote").then((m) => ({ default: m.Remote })));

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
              <Suspense fallback={<p role="status" aria-busy="true" style={{ padding: "var(--space-5)" }}>…</p>}>
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
              </Suspense>
            </Layout>
            </WorkspaceProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
