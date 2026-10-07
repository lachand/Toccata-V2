import { useLingui } from "@lingui/react/macro";
import { Segmented } from "@toccata/ui";

type Display = "iframe" | "window" | "link";

/** Comment une page web s'ouvre : dans le cadre, dans une fenêtre, ou en simple lien (certains sites refusent d'être intégrés). */
export function DisplayModeField({ value, onChange }: { value: Display; onChange: (v: Display) => void }) {
  const { t } = useLingui();
  return (
    <Segmented
      label={t`How it opens`}
      value={value}
      onChange={onChange}
      options={[
        { value: "iframe", label: t`Embedded` },
        { value: "window", label: t`New window` },
        { value: "link", label: t`Link only` },
      ]}
    />
  );
}
