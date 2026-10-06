import { useLingui } from "@lingui/react/macro";
import { LOCALES, type Locale, activateLocale, isLocale } from "./i18n";

export function LocaleSwitcher({ current }: { current: Locale }) {
  const { t } = useLingui();
  return (
    <label className="meta">
      {t`Language`}{" "}
      <select
        value={current}
        onChange={(e) => {
          if (isLocale(e.target.value)) void activateLocale(e.target.value);
        }}
      >
        {Object.entries(LOCALES).map(([code, name]) => (
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
