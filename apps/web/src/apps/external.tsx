import { useLingui } from "@lingui/react/macro";
import { Field, TextInput } from "@toccata/ui";
import type { AppModule } from "@toccata/apps-sdk";
import { Globe } from "lucide-react";
import { ExternalFrame } from "./ExternalFrame";
import { DisplayModeField } from "./DisplayModeField";

export const externalApp: AppModule<"external"> = {
  type: "external",
  useLabels() {
    const { t } = useLingui();
    return { typeName: t`Web app`, description: t`A web page or tool (collaborative document, simulator…) shown inside the activity.`, defaultName: t`Web app` };
  },
  Icon: Globe,
  defaultConfig: () => ({ url: "https://", display: "iframe" }),
  Editor({ app, onChange }) {
    const { t } = useLingui();
    return (
      <>
        <Field label={t`Address`} hint={t`Must start with https://`}>
          <TextInput type="url" inputMode="url" defaultValue={app.config.url} onChange={(e) => onChange({ ...app.config, url: e.currentTarget.value.trim() })} />
        </Field>
        <DisplayModeField value={app.config.display} onChange={(display) => onChange({ ...app.config, display })} />
      </>
    );
  },
  Runtime({ app }) {
    return <ExternalFrame url={app.config.url} display={app.config.display} title={app.name} />;
  },
};
