# @toccata/ui

Design system Toccata : direction **Atelier**, palette **Menthe**, fond clair (ADR 0006, 0008).

```ts
import "@toccata/ui/fonts.css";   // polices auto-hébergées
import "@toccata/ui/styles.css";  // jetons + composants
import { Button, StepTimeline, SyncStatus } from "@toccata/ui";
```

- **Neutre en langue** : aucun texte en dur ; tout libellé (y compris `aria-label`) est une
  propriété, fournie par l'application via Lingui.
- **Jetons** : `src/tokens.css`, seule source de couleurs. `pnpm contrast` vérifie le contraste WCAG AA.
- **Composants** : `Button`, `IconButton`, `Pill`, `Card`, `Avatar`/`AvatarGroup`, `EmptyState`,
  `Field`/`TextInput`/`NativeSelect`, `Switch`, `Segmented`, `Dialog`, `Tabs`, `AppShell`/`Rail`/`TopBar`,
  `StepTimeline`, `SyncStatus`, `TimerChip`. Exemples vivants : route `/gallery` de `apps/web`.
- **Tests** : `pnpm --filter @toccata/ui test` (comportement clavier, rôles ARIA, axe, absence de texte en dur).
