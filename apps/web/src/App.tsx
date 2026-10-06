import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { type Locale } from "./i18n";

type ActivityCard = { id: string; title: string; students: number; lastSession: Date; syncedAt: Date };

// Données d'exemple : le titre est du contenu saisi par un enseignant, il n'est jamais traduit.
const SAMPLE: ActivityCard[] = [
  { id: "agile", title: "Atelier Agile : la ville en Lego", students: 20, lastSession: new Date("2026-10-05T16:05:00"), syncedAt: new Date("2026-10-06T09:41:00") },
  { id: "facts", title: "Vérifier l'information", students: 1, lastSession: new Date("2026-10-06T10:00:00"), syncedAt: new Date("2026-10-06T09:41:00") },
];

export function App({ locale }: { locale: Locale }) {
  const { t, i18n } = useLingui();
  return (
    <main className="page">
      <header className="bar">
        <h1>{t`My activities`}</h1>
        <LocaleSwitcher current={locale} />
      </header>
      {SAMPLE.map((a) => {
        const lastSession = i18n.date(a.lastSession, { dateStyle: "full", timeStyle: "short" });
        return (
        <article className="card" key={a.id}>
          <h2>{a.title}</h2>
          <p className="meta">
            {plural(a.students, { one: "# student", other: "# students" })}
          </p>
          <p className="meta">
            <Trans>
              Last session: <strong>{lastSession}</strong>
            </Trans>
          </p>
        </article>
        );
      })}
    </main>
  );
}
