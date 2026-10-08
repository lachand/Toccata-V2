import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button, Content, EmptyState, TopBar } from "@toccata/ui";
import { Maximize2, Presentation, Smartphone, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { OnlineStatus } from "../components/Layout";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useStudentNames } from "../data/hooks";
import { useWorkspace } from "../data/provider";
import type { Locale } from "../i18n";
import { GroupTile } from "../monitor/GroupTile";
import { useMonitor } from "../monitor/useMonitor";

/** Suivi de la séance (D5, article §4) : une tuile par groupe, en direct ; mode projecteur pour la classe entière. */
export function Monitor({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const projector = params.has("projecteur");
  const ws = useWorkspace();
  const { content, groups, loading } = useMonitor(id);
  const names = useStudentNames();
  const [now, setNow] = useState(() => ws?.serverNow() ?? Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(ws?.serverNow() ?? Date.now()), 1000);
    return () => clearInterval(h);
  }, [ws]);

  const helpCount = groups.reduce((n, g) => n + g.help.length, 0);
  const title = content?.activity.title ?? t`Activity`;

  return (
    <div className={projector ? "tc-projector" : undefined}>
      <TopBar title={projector ? title : t`Monitoring · ${title}`}>
        {projector ? null : (
          <>
            <OnlineStatus />
            <LocaleSwitcher current={locale} />
            <Link className="tc-btn" to={`/activities/${id}/monitor?projecteur`} target="_blank" rel="noopener">
              <Presentation size={16} aria-hidden="true" /> {t`Projector mode`}
            </Link>
            <Link className="tc-btn" to={`/remote/${id}`}>
              <Smartphone size={16} aria-hidden="true" /> {t`Remote control`}
            </Link>
          </>
        )}
        {projector ? <Button icon={<Maximize2 size={16} />} onClick={() => void document.documentElement.requestFullscreen?.()}>{t`Full screen`}</Button> : null}
      </TopBar>
      <Content>
        {projector ? null : <Link to={`/activities/${id}/distribute`} style={{ alignSelf: "flex-start" }}>{t`Groups`}</Link>}
        {helpCount > 0 ? (
          <p role="status" className="tc-callout" data-tone="warn">
            {plural(helpCount, { one: "# student asks for help.", other: "# students ask for help." })}
          </p>
        ) : null}
        {loading ? null : groups.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title={t`No group to follow yet`} description={t`Distribute the activity to a class to follow it here.`} action={<Link className="tc-btn tc-btn--primary" to={`/activities/${id}/distribute`}>{t`Distribute`}</Link>} />
        ) : (
          <ul className="tc-gtiles" data-projector={projector ? "true" : "false"}>
            {groups.map((g) => (
              <li key={g.instanceId} style={{ display: "contents" }}>
                <GroupTile g={g} activityId={id} now={now} names={names} projector={projector} />
              </li>
            ))}
          </ul>
        )}
      </Content>
    </div>
  );
}
