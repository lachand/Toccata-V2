import { useLingui } from "@lingui/react/macro";
import { Segmented } from "@toccata/ui";
import { LOCALES, type Locale, activateLocale } from "../i18n";

export function LocaleSwitcher({ current }: { current: Locale }) {
  const { t } = useLingui();
  return (
    <Segmented
      label={t`Language`}
      value={current}
      onChange={(l) => void activateLocale(l)}
      options={(Object.keys(LOCALES) as Locale[]).map((code) => ({ value: code, label: LOCALES[code], lang: code }))}
    />
  );
}
