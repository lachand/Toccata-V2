# ADR 0011 — Texte riche et assainissement

Statut : accepté (Phase 3B).

## Décisions

- **Éditeur** : TipTap (MIT), chargé à la demande (`React.lazy`) ; un champ texte inerte s'affiche pendant le chargement.
- **Une seule porte d'entrée du HTML** : `apps/web/src/richtext/sanitize.ts` (DOMPurify). Liste blanche stricte :
  `p br strong em u s code pre blockquote h2 h3 ul ol li a`, seul attribut `href`. Les liens ne gardent `href`
  que s'il commence par `https://`, et reçoivent `target="_blank" rel="noopener noreferrer"`. Pas de style en ligne,
  d'image, d'iframe, de formulaire ni d'attribut `data-*`/`aria-*` : les médias passent par l'assistant d'ajout, qui
  contrôle leur source.
- **Assainissement à l'écriture ET à l'affichage** (`RichView`) : la base peut contenir n'importe quoi (version plus
  ancienne, écriture hors règle, autre client). `RichView` est le seul usage de `dangerouslySetInnerHTML`.
- **Texte partagé** (application `text`) : le schéma ProseMirror interdit déjà tout nœud hors liste ; les liens
  restreints à `https`.
- **Kanban, questionnaire** : le texte saisi n'est jamais interprété comme HTML (rendu en nœuds texte React).
- **Apps externes** : `https:` uniquement, `iframe sandbox` sans `allow-top-navigation`, `referrerpolicy="no-referrer"`,
  `allow=""` (aucune permission), et **jamais notre propre origine** (un cadre `allow-same-origin allow-scripts`
  sur notre origine sortirait du bac à sable). Certains sites refusent l'intégration : lien « ouvrir dans un onglet »
  toujours proposé à côté (spike e).

## Conséquences

- Les consignes déjà écrites en texte brut (3A) restent lisibles : TipTap les lit comme du HTML.
- Tests : jeux d'attaque (`script`, `onerror`, `javascript:`, `data:`, `http:`, SVG, formulaire, majuscules/espaces
  dans le schéma) et idempotence de l'assainissement.
