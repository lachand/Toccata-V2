import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Content, EmptyState, TopBar } from "@toccata/ui";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useSession } from "../auth/session";
import { OnlineStatus } from "../components/Layout";
import { useStudentNames } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";
import { ActionBar, TileActions } from "../monitor/Actions";
import { GroupTile } from "../monitor/GroupTile";
import { useMonitor } from "../monitor/useMonitor";

/**
 * Télécommande : la séance tenue d'une main, sur un téléphone. Même données et mêmes gestes que le suivi, sans navigation
 * latérale, avec de grandes cibles tactiles : l'article constate que les enseignants lâchent la tablette en circulant.
 */
export function Remote(_props: { locale: Locale }) {
  const { t } = useLingui();
  const { id = "" } = useParams();
  const ws = useWorkspace();
  const { user } = useSession();
  const { content, groups, loading } = useMonitor(id);
  const names = useStudentNames();
  const [now, setNow] = useState(() => ws?.serverNow() ?? Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(ws?.serverNow() ?? Date.now()), 1000);
    return () => clearInterval(h);
  }, [ws]);
  const ctx = ws && user ? { ws, ownerId: user.id } : null;
  const helpCount = groups.reduce((n, g) => n + g.help.length, 0);

  return (
    <div className="tc-remote">
      <TopBar title={content?.activity.title ?? t`Remote control`}>
        <OnlineStatus />
        <Link className="tc-btn" to={`/activities/${id}/monitor`}>{t`Monitoring`}</Link>
      </TopBar>
      <Content>
        {helpCount > 0 ? <p role="status" className="tc-callout" data-tone="warn">{plural(helpCount, { one: "# student asks for help.", other: "# students ask for help." })}</p> : null}
        {ctx && content && groups.length > 0 ? <ActionBar ctx={ctx} content={content} targets={groups} scopeLabel={t`Actions apply to all groups.`} /> : null}
        {loading ? null : groups.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title={t`No group to follow yet`} />
        ) : (
          <ul className="tc-gtiles tc-gtiles--remote">
            {groups.map((g) => (
              <li key={g.instanceId} style={{ display: "contents" }}>
                <GroupTile g={g} activityId={id} now={now} names={names}>
                  {ctx && content ? <TileActions ctx={ctx} content={content} g={g} /> : null}
                </GroupTile>
              </li>
            ))}
          </ul>
        )}
      </Content>
    </div>
  );
}
