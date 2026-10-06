# ADR 0006 — Direction visuelle : « Atelier », fond clair

**Statut** : accepté

## Décision
- Direction **Atelier** : coins arrondis, rail de navigation clair, typographie Bricolage
  Grotesque (titres) + Figtree (texte) + JetBrains Mono (chiffres, chronos).
- **Fond clair uniquement** : pas de mode sombre. Les écrans de classe sont lus sous
  éclairage de salle et projetés ; un seul thème réduit aussi le travail de conception et
  de test.
- Quatre palettes claires à départager (Menthe, Ciel, Lilas, Abricot), toutes déclinées par
  jetons CSS (`--bg`, `--surface`, `--accent`…). Les couleurs sémantiques (ok, attention,
  critique) et les couleurs de groupe sont communes à toutes les palettes.
- Contrastes : texte d'accent ≥ 4,5:1 sur surface blanche ; à re-mesurer avec axe en Phase 8.

## Écartée
Direction A « Partition » (rail sombre, titres en serif, portée musicale) et mode sombre.

Maquettes : `docs/design/maquettes.html`.
