import { useLingui } from "@lingui/react/macro";
import { AppShell, Rail, RailItem, SyncStatus } from "@toccata/ui";
import { BookOpen, Copy, LayoutGrid, Users } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useOnline } from "../useOnline";

function NavItem({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <RailItem
      href={to}
      icon={icon}
      current={pathname === to}
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
  return (
    <AppShell
      rail={
        <Rail label={t`Main navigation`} brand={<>Toccata</>}>
          <NavItem to="/" icon={<BookOpen size={18} />}>{t`My activities`}</NavItem>
          <NavItem to="/gallery" icon={<LayoutGrid size={18} />}>{t`Components`}</NavItem>
          <RailItem icon={<Copy size={18} />} disabled>{t`Templates`}</RailItem>
          <RailItem icon={<Users size={18} />} disabled>{t`Classes`}</RailItem>
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
  return online ? <SyncStatus state="online" label={t`Online`} /> : <SyncStatus state="offline" label={t`Offline, your changes are kept`} />;
}
