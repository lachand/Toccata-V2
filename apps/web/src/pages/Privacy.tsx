import { useLingui } from "@lingui/react/macro";
import { Button, Card, Content, TopBar } from "@toccata/ui";
import { Download } from "lucide-react";
import { useState } from "react";
import { session, useSession } from "../auth/session";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OnlineStatus } from "../components/Layout";
import type { Locale } from "../i18n";
import { download } from "../review/download";

/** Données personnelles : ce qui est conservé, par qui c'est lisible, et comment l'obtenir (RGPD : accès et portabilité). */
export function Privacy({ locale }: { locale: Locale }) {
  const { t } = useLingui();
  const { user } = useSession();
  const [state, setState] = useState<"idle" | "error">("idle");
  const student = user?.role === "student";

  async function exportMine() {
    try {
      const r = await session.authorizedFetch("/api/auth/me/export");
      if (!r.ok) throw new Error(String(r.status));
      download("toccata-mes-donnees.json", "application/json", JSON.stringify(await r.json(), null, 2));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <TopBar title={t`Privacy and your data`}>
        <OnlineStatus />
        <LocaleSwitcher current={locale} />
      </TopBar>
      <Content>
        <Card>
          <h2>{student ? t`What is kept about you` : t`What is kept`}</h2>
          <ul>
            <li>{t`An account: a username, a display name and a language. No e-mail address and no photo are required for students.`}</li>
            <li>{t`What is written during activities: answers, cards, texts, the step you are on, and a log of actions (opening a step, asking for help…) with no names in it.`}</li>
            <li>{t`Teachers’ private notes are stored apart and are never readable by students.`}</li>
          </ul>
          <p>{student ? t`Your teacher can read what you write during an activity. Nobody else can.` : t`Students’ work is readable by you and by the students of the same group only.`}</p>
        </Card>
        <Card>
          <h2>{t`Your rights`}</h2>
          <p>{student ? t`You can download everything the platform holds about you. To have your account and your work erased, ask your teacher.` : t`You can download your data at any time. A student’s account and everything the student wrote can be exported or erased from the class page. Research exports are pseudonymised and require a confirmation that consent was collected.`}</p>
          <Button icon={<Download size={16} />} onClick={() => void exportMine()}>{t`Download my data`}</Button>
          {state === "error" ? <p role="alert">{t`Could not download the data. Try again when you are online.`}</p> : null}
        </Card>
      </Content>
    </>
  );
}
