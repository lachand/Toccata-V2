import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "./session";

/** Réservé aux utilisateurs connectés (y compris hors ligne, depuis le profil en cache). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "unknown") return null;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Réservé aux enseignants : un élève est renvoyé à l'accueil (le serveur refuse de toute façon : 403). */
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (user?.role !== "teacher") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Pages de connexion : un utilisateur déjà connecté va directement à l'accueil. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "unknown") return null;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <>{children}</>;
}
