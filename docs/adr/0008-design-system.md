# ADR 0008 — Design system `@toccata/ui`

**Statut** : accepté

## Décisions
- **CSS simple avec jetons**, pas Tailwind : un seul fichier de jetons (`tokens.css`) et une
  feuille de styles par composant (`.tc-*`, dans une `@layer`). Raison : une bibliothèque de
  composants sans étape de génération de CSS est plus simple à consommer et à tester ; Tailwind
  reste possible dans les applications pour la mise en page. *(Le plan initial prévoyait
  Tailwind v4 ; écarté pour cette raison.)*
- **Primitives accessibles Radix** (Switch, ToggleGroup, Tabs, Dialog) ; pour le reste du HTML
  natif (`<select>` natif, meilleur sur tablette et lecteur d'écran qu'une liste déroulante
  personnalisée).
- **Aucun texte en dur** : tout libellé, y compris les noms accessibles, arrive en propriété.
  Un test (`no-hardcoded-text.test.ts`) analyse le code des composants et échoue sur un texte
  JSX ou un `aria-label` littéral.
- **Polices auto-hébergées** (`@fontsource-variable`) : aucune requête vers un service tiers,
  utilisables hors ligne (précachées par le service worker).
- **Propriétés CSS logiques** uniquement, pour permettre l'écriture de droite à gauche.
- **Cibles tactiles de 44 px** (`--hit`) ; anneau de focus visible partout ; mouvement réduit respecté.
- **Catalogue des composants** : page `/gallery` de l'application (traduite fr/en, testée avec
  axe) plutôt que Storybook pour l'instant ; Storybook 10 est compatible Vite 8 et pourra être
  ajouté si la bibliothèque grossit.

## Contrôles automatiques
- `pnpm --filter @toccata/ui contrast` : contraste WCAG AA de 28 paires de jetons. Il a trouvé
  cinq paires insuffisantes dans la palette des maquettes (texte des pastilles ok, attention,
  critique, accent, et initiales du groupe 3) : ajout de jetons `*-ink` pour le texte et
  assombrissement de `--g3`.
- axe sur chaque composant et sur la galerie, en français et en anglais (le contraste, non
  mesurable sans mise en page dans jsdom, est couvert par le script ci-dessus).
- Playwright : hors ligne, langues, absence de débordement à 360 px avec et sans polices.

## Constats corrigés en route
- `Dialog` de Radix ne rend le focus qu'à un `Dialog.Trigger` : un dialogue contrôlé perdait
  le focus (WCAG 2.4.3). Le composant mémorise désormais l'élément d'ouverture.
- Le contrôle segmenté (4 filtres) débordait de 12 px à 360 px avec la police de repli en
  français : il passe à la ligne.
