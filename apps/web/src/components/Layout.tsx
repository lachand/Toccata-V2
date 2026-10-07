import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Avatar, AppShell, Button, Rail, RailItem, SyncStatus } from "@toccata/ui";
import { BookOpen, Copy, LayoutGrid, LogOut, Users } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { session, useSession } from "../auth/session";
import { usePendingUploads, useSyncState } from "../data/hooks";
import { useOnline } from "../useOnline";

function NavItem({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <RailItem
      href={to}
      icon={icon}
      current={pathname === to || (to !== "/" && pathname.startsWith(`${to}/`))}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // laisse le navigateur ouvrir un nouvel onglet
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </RailItem>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const { user } = useSession();
  const navigate = useNavigate();
  return (
    <AppShell
      rail={
        <Rail
          label={t`Main navigation`}
          brand={<>Toccata</>}
          footer={
            user ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minInlineSize: 0 }}>
                  <Avatar name={user.displayName} />
                  <span style={{ overflowWrap: "anywhere", fontSize: "var(--text-sm)" }}>{user.displayName}</span>
                </span>
                <Button variant="ghost" icon={<LogOut size={16} />} onClick={() => void session.logout().then(() => navigate("/login"))}>{t`Sign out`}</Button>
              </div>
            ) : null
          }
        >
          <NavItem to="/" icon={<BookOpen size={18} />}>{t`My activities`}</NavItem>
          <NavItem to="/gallery" icon={<LayoutGrid size={18} />}>{t`Components`}</NavItem>
          {user?.role === "teacher" ? <NavItem to="/classes" icon={<Users size={18} />}>{t`Classes`}</NavItem> : null}
          <RailItem icon={<Copy size={18} />} disabled>{t`Templates`}</RailItem>
        </Rail>
      }
    >
      {children}
    </AppShell>
  );
}

export function OnlineStatus() {
  const { t } = useLingui();
  const online = useOnline();
  const sync = useSyncState();
  const pending = usePendingUploads();
  if (!online) return <SyncStatus state="offline" label={t`Offline, your changes are kept`} />;
  if (sync.failing) return <SyncStatus state="pending" label={t`Sync problem, retrying`} />;
  if (pending > 0) return <SyncStatus state="pending" label={plural(pending, { one: "# file waiting to be sent", other: "# files waiting to be sent" })} />;
  return <SyncStatus state="online" label={t`Online`} />;
}
