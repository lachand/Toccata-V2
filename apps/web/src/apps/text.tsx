import { useLingui } from "@lingui/react/macro";
import type { AppModule } from "@toccata/apps-sdk";
import { NotebookPen } from "lucide-react";
import { lazy, Suspense } from "react";

// TipTap et Yjs sont chargés à la première utilisation d'un texte partagé (poids du paquet principal).
const Runtime = lazy(() => import("./TextRuntime"));

export const textApp: AppModule<"text"> = {
  type: "text",
  useLabels() {
    const { t } = useLingui();
    return { typeName: t`Shared text`, description: t`A document everyone writes in together, at the same time.`, defaultName: t`Shared text` };
  },
  Icon: NotebookPen,
  defaultConfig: () => ({}),
  Runtime: (props) => (
    <Suspense fallback={null}>
      <Runtime {...props} />
    </Suspense>
  ),
};
