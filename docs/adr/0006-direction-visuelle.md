# ADR 0006 — Direction visuelle : « Atelier », palette Menthe, fond clair

**Statut** : accepté

## Décision
- Direction **Atelier** : coins arrondis, rail de navigation clair, typographie Bricolage
  Grotesque (titres) + Figtree (texte) + JetBrains Mono (chiffres, chronos).
- **Fond clair uniquement** : pas de mode sombre. Les écrans de classe sont lus sous
  éclairage de salle et projetés ; un seul thème réduit aussi le travail de conception et
  de test.
- **Palette Menthe** (retenue parmi Menthe, Ciel, Lilas, Abricot) : jetons CSS `--bg`,
  `--surface`, `--accent`… Les couleurs sémantiques (ok, attention, critique) et les
  couleurs de groupe sont communes à toute palette.
- Contrastes : texte d'accent ≥ 4,5:1 sur surface blanche ; à re-mesurer avec axe en Phase 8.

## Écartée
Direction A « Partition » (rail sombre, titres en serif, portée musicale), mode sombre et
les palettes Ciel, Lilas, Abricot.

Maquettes (bilingues fr/en) : `docs/design/maquettes.html`.
