# ADR 0009 — Authentification

**Statut** : accepté (implémenté dans `apps/auth`, testé contre un vrai CouchDB)

## Décisions
- **Jeton d'accès** : JWT HS256 de 15 minutes, lu directement par CouchDB. **Jeton de
  rafraîchissement** : 256 bits aléatoires dans un cookie `HttpOnly; SameSite=Strict; Path=/auth`,
  stocké **haché** côté serveur, **rotation à chaque usage**. Le rejeu d'un ancien jeton (hors
  tolérance de 10 s pour deux onglets) révoque toute la famille de sessions.
- **Jeton d'accès gardé en mémoire** par le client, jamais en `localStorage`.
- **CSRF** : `SameSite=Strict` plus un en-tête `X-Requested-With: toccata` exigé sur les routes à cookie.
- **Mots de passe d'enseignant** : Argon2id (19 Mio, 2 itérations, 1 voie), 12 caractères minimum,
  normalisés en NFC, et **score zxcvbn-ts de 4** (dictionnaires commun, fr, en) ; refus avec un code
  (`too_short`, `too_simple`, `too_common`, `contains_username`, nom affiché compris).
  **Élèves** : phrase de passe générée de **6 mots (66 bits)**, **sans accents**,
  acceptée à la connexion quelle que soit la graphie (accents, majuscules, espaces).
- **Pas de fuite d'information** : même réponse pour compte inconnu et mauvais mot de passe, et un
  hachage factice est calculé quand le compte n'existe pas (temps de réponse uniforme).
- **Limitation de débit sur quatre axes** (`LoginGuard`) : par identifiant (20 essais/15 min), par adresse
  (300 essais/5 min, 60 échecs/10 min, 40 identifiants distincts en échec/10 min : l'attaque
  *horizontale*, un même mot de passe sur beaucoup de comptes, contourne tout plafond par compte) et
  **global** (500 échecs/min bascule le service en mode « sous attaque » 10 min, aux seuils bien plus
  bas). Les succès ne comptent jamais pour l'adresse : une classe entière derrière une même NAT doit
  pouvoir se connecter. S'y ajoute le **verrouillage temporaire** d'un compte après 5 échecs
  (60 s, doublé à chaque échec, plafonné à 1 h). Un enseignant qui réinitialise le mot de passe d'un
  élève lève le verrouillage.
- **Un compte supprimé n'agit plus**, même avec un jeton encore valide : chaque route recharge le compte.
- **Révocation** : un retrait d'inscription ou une suppression prend effet au plus tard à l'expiration du
  jeton d'accès (15 min) ; le client rafraîchit aussi son jeton sur un refus 403 d'une base.
- **Configuration** : le service refuse de démarrer sans secret de 32 octets minimum, sans jamais
  afficher de valeur. Aucun secret par défaut.

## Côté client (`apps/web`)
- Le jeton d'accès vit en mémoire ; seul le profil public est mis en cache (`toccata.profile`) pour
  **ouvrir l'application hors ligne** sur les données locales. La synchronisation reprend au retour du réseau.
- Renouvellement **à vol unique** (dix requêtes simultanées n'envoient qu'un seul `/api/auth/refresh`),
  une minute avant l'expiration ; sur un refus 400/401/403 d'une base, **un** renouvellement puis un rejeu
  (jeton expiré, ou droits qui viennent de changer).
- L'API est servie sous **`/api`** (proxy du front) : l'interface et l'API sont de même origine (cookie sans
  CORS) et les routes de l'API ne peuvent pas entrer en collision avec celles de l'interface ; le service
  worker ne capture jamais `/api/*`.
- Fiche d'identifiants d'un élève : **QR code de connexion rapide** dont le secret est dans le fragment de
  l'adresse (jamais envoyé au serveur, effacé de l'historique à la lecture) ; affichée une seule fois.
- Textes d'erreur : le client traduit les **codes** de l'API ; l'écran de connexion est sans pronom (il sert
  aux élèves et aux enseignants).

## Constats qui ont changé la conception
1. **Taille du jeton** : un rôle CouchDB par instance donnerait ≈ 30 Ko à un enseignant de 50
   activités. L'enseignant porte donc **un seul rôle `owner:<id>`**, et les `validate_doc_update`
   sont générés à l'approvisionnement avec la liste de leurs propriétaires (identifiants validés
   avant insertion : pas d'injection de code). Mise à jour de l'ADR 0003.
2. **Accents de la liste française BIP-39** : elle est en Unicode décomposé ; un élève qui tape
   « débattre » n'aurait jamais retrouvé la valeur générée. Phrases affichées sans accents,
   saisie normalisée.
3. **Collision API / interface** : `/classes` est à la fois une route d'API et une page ; un proxy simple
   envoyait la page au service. Tout passe sous `/api`, et le cookie de rafraîchissement a pour chemin
   `/api/auth`.
4. **Ordre des vérifications** : valider les inscriptions *avant* de créer une instance (sinon une
   requête refusée laissait une instance orpheline).

## Revue de sécurité des phrases de passe d'élève

- **Entropie** : 4 mots = 44 bits, trop peu si le hachage fuit (hors ligne, ~50 ms/essai : ≈ 28 000
  cœurs·années). 6 mots = 66 bits : ≈ 1,2·10¹¹ cœurs·années. Retenu : **6 mots**.
- **Biais du modulo** : non applicable, le tirage utilise un échantillonnage par rejet exactement
  uniforme ; un test exhaustif (65 536 valeurs) le vérifie.
- **Somme de contrôle** : volontairement non ajoutée (elle réduirait l'espace de recherche ou
  allongerait la phrase). À la place, le client signale un mot absent de la liste BIP-39 avant l'envoi,
  avec une suggestion ; seul le premier envoi est bloqué (un mot de passe d'enseignant atypique passe
  au second), et cela économise un essai du compteur.
- **Langue** : la liste (fr/en) suit la langue de l'enseignant qui crée la classe.

## Limites connues
- Le limiteur de débit est **en mémoire** (un seul processus). Plusieurs instances du service
  demanderont un stockage partagé.
- Pas de récupération de compte par e-mail pour les enseignants (un administrateur doit
  réinitialiser) ; à ajouter avec la vérification d'adresse.
- Le verrouillage par identifiant permet à quelqu'un qui connaît un identifiant d'élève de le
  bloquer quelques minutes ; l'enseignant le débloque en réinitialisant le mot de passe.
- Un verrouillage révèle l'existence du compte (réponse `locked`) à qui a déjà échoué 5 fois dessus.
- La liste de comptes de la classe n'est pas encore répliquée vers un serveur local hors ligne
  (Phase 6).
