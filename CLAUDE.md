# Brumeland VTT — cadrage du projet

Ce fichier donne à Claude Code le contexte du projet. Il résume le cadrage décidé avec Antoine le 16 novembre 2026. À tenir à jour quand une décision change.

## Le projet en bref

Brumeland VTT est une table de jeu virtuelle (VTT) maison, dans l'esprit d'Owlbear Rodeo ou de Foundry, pour jouer à **Dragonbane** en ligne entre amis.

- **Usage** : personnel. Antoine est le meneur de jeu (MJ).
- **Joueurs** : 2 à 5, tous à distance, sur PC uniquement (pas d'interface mobile à prévoir).
- **Hébergement** : sur le PC d'Antoine (Windows avec WSL 2), le projet tourne dans WSL. Piste pour plus tard : un hébergement sur le serveur personnel d'un ami (adresse fixe, ou service toujours en ligne). Le projet doit donc rester facile à installer ailleurs (conteneur Docker prévu à la fin de l'étape 1).
- **Voix et discussion** : sur Discord, hors de l'outil. Pas d'audio ni de vidéo intégrés.
- **Échéance** : aucune date ferme, mais l'objectif est de tester vite, étape par étape.

## Priorités, dans l'ordre

1. **Simplicité d'accès pour les joueurs** : un joueur clique sur un lien et il est dans la partie. Aucun compte, aucune installation.
2. **Connexion fiable** : reconnexion automatique, et un joueur qui revient retrouve l'état complet de la partie.
3. **Simplicité pour le MJ** : lancer une session doit tenir en deux commandes au maximum.
4. **Fidélité aux règles de Dragonbane**.

## Travailler avec Antoine

- Antoine est consultant BA/PO, pas développeur. Il débute avec le terminal et accepte d'y taper quelques commandes simples.
- Donner les commandes prêtes à copier, une par une, en expliquant en une phrase ce que chacune fait.
- Expliquer les choix en langage clair, sans jargon inutile. Proposer une recommandation plutôt qu'une liste d'options ouvertes.
- Avancer par étapes courtes et testables : à la fin de chaque étape, dire à Antoine comment vérifier lui-même que ça marche.
- Interface de l'outil, messages et documentation : **en français**.

## Règles de Dragonbane

**Vocabulaire** : utiliser celui de l'édition française, comme dans le résumé des règles. PS = points de santé, PV = points de volonté, faveur / fléau, forcer la chance, tomber sur un dragon / un démon, caractéristiques (FOR, CON, AGI, INT, VOL, CHA). Le fichier `regles-dragonbane.md` reste sur le PC : il est exclu du dépôt (texte du livre).

Un résumé des règles au format markdown est déjà présent dans ce dossier, ajouté par Antoine. **C'est la référence** pour tout ce qui touche aux règles : jets, fiches, combat, distances. Le lire avant de coder les étapes 2, 3, 5 et 6, et poser la question à Antoine en cas de doute plutôt que de supposer.

Mécaniques à couvrir, à vérifier dans ce résumé :

- jet de d20 sous la valeur de compétence ou d'attribut ;
- faveur et fléau (avantage et désavantage) ;
- réussite critique (Dragon) et échec critique (Démon) ;
- relance en « forçant la chance », au prix d'un état ;
- initiative par tirage de cartes à chaque round ;
- points de santé (PS), points de volonté (PV), états ;
- déplacements et distances sur grille.

## Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| Serveur | Node.js + TypeScript, Socket.IO | Temps réel simple, reconnexion automatique |
| Interface | React + Vite | Standard, bien outillé |
| Carte et pions | Canvas 2D avec Konva (à partir de l'étape 5) | Zoom, glisser-déposer, calques |
| Données | SQLite, un seul fichier | Aucune installation, sauvegarde par copie |
| Comptes | Aucun : liens d'invitation avec jeton | Un lien MJ, un lien par joueur |
| Accès Internet | Cloudflare Tunnel | Pas de port à ouvrir sur la box, HTTPS inclus |

Ces choix sont des recommandations validées avec Antoine. Une alternative reste possible si elle sert mieux les priorités ci-dessus, à condition de la lui expliquer d'abord.

## Principes d'architecture

- **Le serveur est la seule source de vérité.** Il valide chaque action et diffuse l'état à tous les clients. Les clients n'appliquent jamais un changement sans confirmation du serveur.
- **Deux rôles** : MJ et joueur. Le rôle vient du jeton du lien d'invitation.
- **Droits** : tout le monde voit toutes les fiches de personnage (transparence voulue). Seuls le joueur concerné et le MJ peuvent modifier une fiche. Un joueur ne déplace que son propre pion. Le MJ peut tout faire.
- **Jets de dés calculés côté serveur**, jamais côté client.
- **Persistance** : l'état survit à un redémarrage du serveur.
- **Un seul dépôt**, avec le serveur et l'interface. En production, le serveur sert aussi l'interface compilée, pour n'avoir qu'un seul port à exposer dans le tunnel.

## Plan en 8 étapes

Chaque étape doit être jouable et testée avant de passer à la suivante.

1. **Socle et connexion** : serveur, lien MJ et liens joueurs, liste des présents, reconnexion, tunnel.
2. **Dés et journal** : jets Dragonbane, jets secrets du MJ, historique partagé.
3. **Fiches de personnage** : caractéristiques, compétences, points de santé (PS), points de volonté (PV), états, jets en un clic depuis la fiche.
4. **Scènes et images** : afficher une illustration ou une carte à tous.
5. **Carte, pions et grille** : déplacement synchronisé, mesure des distances, zoom, pointeur pour montrer un endroit.
6. **Combat** : initiative par tirage de cartes, suivi des tours.
7. **Brouillard de guerre simple** : zones que le MJ révèle à la main.
8. **Confort** : lecteur de musique synchronisé, sauvegarde et export.

Les étapes 1 à 4 donnent une version « théâtre de l'esprit » jouable. Les étapes 5 à 7 ajoutent le combat tactique : la gestion des distances sur grille est importante pour Antoine.

## Étape 1 en détail

À construire :

- structure du dépôt, scripts de lancement, fichier README en français ;
- serveur Node.js avec Socket.IO et base SQLite ;
- création d'une partie avec un lien MJ et un lien par joueur, que le MJ peut générer et copier depuis son écran ;
- page d'arrivée du joueur : il choisit son nom à la première visite, puis il est reconnu automatiquement ;
- liste des participants avec leur statut (connecté ou déconnecté), mise à jour en direct ;
- reconnexion automatique après une coupure réseau ou un rechargement de page ;
- mise en place du tunnel Cloudflare et d'une commande simple pour l'ouvrir.

L'étape est terminée quand :

- Antoine lance le serveur avec une seule commande et ouvre son écran MJ dans son navigateur Windows ;
- un ami hors de son réseau rejoint la partie en cliquant sur un lien, sans rien installer ;
- chacun voit qui est présent, et la liste se met à jour quand quelqu'un part ou revient ;
- après un redémarrage du serveur, la partie et les joueurs sont toujours là.

## État d'avancement

- **Étape 1 terminée** le 17 novembre 2026 (sous-étapes 1.0 à 1.8), validée : un ami s'est connecté depuis chez lui par le tunnel.
- **Étape 2 codée** le 17 novembre 2026 (dés, journal, forcer la chance, jets secrets), à tester par Antoine. Choix validés : jet secret affiché aux joueurs comme « Le MJ lance les dés en secret… » avec bouton « Révéler » ; avant les fiches, le joueur tape la valeur de sa compétence ; journal conservé entre séances, 100 derniers jets affichés, vidable par le MJ ; on ne force la chance qu'une fois par jet. Le MJ peut lancer « pour » un joueur (jet de personnage joueur) ; la chance se force par le joueur concerné ou par le MJ, jamais sur un jet de PNJ. Jets en opposition : bouton « S'opposer » sous un jet du journal ; on s'oppose toujours au jet d'origine ; une seule réponse par jet ; seul celui qui agit force la chance, avant la réponse ; opposition ouverte (MJ seulement) où chacun peut forcer et où l'égalité impose de relancer.
- **Étape 3 codée** le 17 novembre 2026 (fiches), à tester par Antoine. Choix validés : fléau automatique des états sur les jets en un clic (calculé par le serveur depuis la fiche) ; une fiche par joueur, créée vide quand il choisit son nom, supprimée avec son invitation ; texte libre pour capacités, sorts, armes, équipement ; fiche au centre avec un onglet par personnage. Fiches de PNJ prévues plus tard (combat). Règles des fiches dans `shared/fiche.ts`, testées dans `server/fiche.test.ts`.
- **Étape 4 terminée** le 17 novembre 2026 (scènes), validée par Antoine et un ami (affichage des images correct). Choix validés : bascule automatique des joueurs sur l'onglet Scène quand une nouvelle image est montrée ; bibliothèque visible du MJ seul ; images dans `data/medias/` (sauvegarde = copier `data/`) ; JPG, PNG, WebP, GIF, 30 Mo au plus. Dépôt en HTTP (`POST /api/images`, jeton MJ en en-tête), format vérifié sur le contenu ; images servies par identifiant aléatoire, avec cache navigateur.
- **Étape 5 terminée** le 17 novembre 2026 (carte, pions, grille), validée par Antoine. Choix validés : diagonale = 2 m (le livre ne précise pas ; cohérent avec « case adjacente en diagonale = à moins de 2 m ») ; onglet Carte séparé de Scène ; pions PJ automatiques (un par joueur et par carte), pions PNJ créés et déplacés par le MJ seul ; l'outil affiche la distance parcourue par rapport au déplacement de la fiche mais n'interdit rien ; molette comme pour les scènes. Grille enregistrée par image ; règle et pointeur éphémères. Règles dans `shared/carte.ts`, testées dans `server/carte.test.ts`.
- **Réorganisation des scènes** (17 novembre 2026, validée par Antoine) : une scène = nom + type + image ; une image peut servir à plusieurs scènes. Types : « Illustration » (image en grand) et « Immersive » (ancien « combat » : grille, pions, règle, pointeur). Une seule scène montrée à la fois ; onglets centraux Scène et Personnages (plus d'onglet Carte). Grille liée à l'image, pions liés à la scène. Le MJ peut préparer une scène sans la montrer. Suppression d'une image utilisée par une scène refusée. Données reprises automatiquement (migration 9). Code : `server/scenes.ts`, `server/images.ts` (bibliothèque seule), `client/src/Scene.tsx`, `client/src/Carte.tsx`.
- **Pions** : états « mort » (PNJ) et « à terre » (PJ) ; pions de PNJ cachés jamais envoyés aux joueurs (filtrés par le serveur) ; scènes réordonnables par le MJ.
- **Étape 6 terminée** le 18 novembre 2026 (combat), validée par Antoine. Choix validés : tours avancés par le MJ (« Tour suivant ») ou par le joueur (« J'ai joué ») ; une réaction retourne la carte et coupe le déplacement du round ; PJ ajoutés automatiquement, PNJ à la main ou depuis les pions de la scène ; surprise : les attaquants choisissent leur carte au premier round ; PS des PNJ visibles du MJ seul ; panneau Combat en haut de la colonne de gauche ; 10 cartes au plus par round. En plus : déplacement restant du round pour le pion d'un joueur (seuls ses propres déplacements comptent ; Course ×2 ; réaction = 0), halo sur le pion dont c'est le tour. MJ : un clic sur un numéro de carte la retourne (réaction d'un monstre, correction). Ajouts du 18 novembre : PS modifiables pour tout PNJ (y compris ajouté depuis la scène) et pour les joueurs depuis le combat (écrits dans la fiche) ; PS à 0 → pion « mort » (PNJ) ou « à terre » (PJ, toutes scènes), et retour à normal si les PS remontent ; round suivant refusé tant qu'une carte n'est pas jouée ; trace du chemin de chaque pion pendant le round (effacée au round suivant ; jamais envoyée aux joueurs pour un pion caché) ; partie de la trace au-delà du déplacement autorisé en rouge. Le MJ peut jouer à la place d'un joueur : Course, Réaction et déplacement restant sur son écran ; ses déplacements du pion d'un joueur comptent pendant le tour de ce joueur, pas en dehors (repoussement, correction). Annuler un déplacement : bouton « 🥾 Annuler déplacement » ou Ctrl + Z (souris sur la carte) ; chacun annule ses propres déplacements (mémoire de 20 par personne, en mémoire du serveur, perdue au redémarrage) ; en combat, trace raccourcie et mètres rendus ; refusé si le pion a bougé depuis ou si le round a changé. Règles dans `shared/combat.ts`, testées dans `server/combat.test.ts`.
- **Étape 7 terminée** le 18 novembre 2026 (brouillard de guerre), validée par Antoine. Choix : brouillard activé scène par scène (immersives) ; révélation case par case sur la grille, par zone (rectangle) ou au pinceau, en mode Révéler ou Recouvrir, plus Tout révéler / Tout recouvrir ; opaque pour les joueurs, voile pour le MJ ; un PNJ entièrement dans le brouillard est filtré par le serveur comme un pion caché (« ??? » dans le combat, trace non envoyée) ; pions des PJ toujours visibles. Limite connue : l'image est envoyée entière aux joueurs (le brouillard est dessiné par-dessus). Ajout : brouillard aussi sur les illustrations, au pinceau rond aux bords doux (coups de pinceau en pixels de l'image, « tout » pour tout révéler) ; barres au-dessus des scènes rangées sur trois lignes (scène / outils et zoom / réglages de l'outil) ; « Montrer » (outil) renommé « 👉 Pointer du doigt », boutons « Montrer la scène » / « Ne plus montrer la scène » ; « Meneur de jeu » avec majuscule. Ensuite : invitations réordonnables ; image cachée (indicateur « Chargement… ») jusqu'à ce que son brouillard soit dessiné ; barre d'outils : ✋ Déplacer (🥾 sur les scènes immersives depuis le 19 novembre), ☁️ Brouillard (pas 🌫️, mal affiché sous Windows), section « navigation » (zoom, Ajuster, plein écran) à droite de la ligne des outils, bouton d'annulation réduit à une botte 🥾 barrée (texte au survol), place toujours réservée et invisible s'il n'y a rien à annuler (le serveur envoie le nombre à chacun). Règles dans `shared/brouillard.ts`, testées dans `server/brouillard.test.ts`.
- **Étape 8** : lecteur de musique **reporté** (Antoine teste d'abord Kenku FM). **Sauvegarde et export codés** le 18 novembre 2026, à tester par Antoine. Choix validés : sauvegardes automatiques de la base (`VACUUM INTO`) dans `data/sauvegardes/` au démarrage, toutes les 30 min si `total_changes()` a bougé, et à l'arrêt ; une copie identique à la précédente n'est pas gardée ; 20 gardées ; copie « avant mise à jour » avant une migration. Images non recopiées : une image supprimée part dans `data/corbeille/` (vidée des images dont plus aucune sauvegarde n'a besoin) et revient à la restauration. Export `.zip` (base + images, fflate) par le bouton « 📦 Exporter la partie » du MJ (`GET /api/export`, jeton MJ en en-tête) ; il contient les liens d'invitation. Restauration en ligne de commande, serveur arrêté (vérifié par `data/serveur.pid`), état actuel mis de côté d'abord (« avant restauration ») : `npm run sauvegardes`, `npm run restaurer -- <numéro | fichier.zip>`. Chemins dans `server/chemins.ts`, code dans `server/sauvegardes.ts`, `server/export.ts`, `server/sauvegardes-commande.ts`. Piste notée : export lisible du journal ou des fiches.
- Lancer une séance : `cd ~/workspace/brumeland-vtt` puis `npm run partie` (tunnel rapide Cloudflare + serveur sur le port 3000).
- Le tunnel rapide (`trycloudflare.com`) change d'adresse à chaque lancement : les liens joueurs sont à renvoyer à chaque séance. Une adresse fixe (domaine de l'ami hébergeur) réglerait ce point.
- SQLite via le module `node:sqlite` intégré à Node 22 (aucune dépendance native). Migrations dans `server/base.ts` (`PRAGMA user_version`).
- `Dockerfile` écrit mais **pas encore testé** (Docker n'est pas accessible depuis WSL sur le PC d'Antoine) : GitHub le fabrique et l'essaie à chaque version.
- **Hébergement en ligne** (préparé le 18 novembre 2026) : Brumeland remplace el-sitio (simple page d'attente, accord d'Antoine pour l'écraser) et réutilise son système sans nouvelle manip de l'ami : dépôt public `Doomsdaycat/el-sitio` = copie exacte de ce dépôt (distant git `hebergement` ; ancien site gardé dans la branche `ancien-site`), image `ghcr.io/doomsdaycat/el-sitio` fabriquée par `.github/workflows/release.yml` sur étiquette `v*`, ArgoCD de l'ami qui suit `chart/` (nom `el-sitio` gardé : service `el-sitio` port 80 → conteneur port 3000), adresse `https://antoine.vanyda.cloud`. Chart : un exemplaire, stratégie RollingUpdate avec maxSurge 0 et maxUnavailable 1 (équivaut à Recreate ; « Recreate » refusé par le Deployment déjà installé chez l’ami, qui gardait ses réglages rollingUpdate), disque permanent 2 Go (`helm.sh/resource-policy: keep`) sur `/app/data`, `fsGroup` 1000, sondes sur `/api/sante`, `BRUMELAND_ADRESSE` dans `values.yaml`. Publication : `npm run mettre-en-ligne` (version mineure +1, étiquette, attente de l'image, puis `appVersion` du chart). Seule demande à l'ami : retirer Cloudflare Access sur antoine.vanyda.cloud (les joueurs doivent entrer sans compte) ; à vérifier au premier déploiement : classe de stockage par défaut et WebSockets. Import d'une partie depuis le navigateur (`POST /api/import`, MJ, ou n'importe qui tant que le serveur est neuf : personne n'est venu et bibliothèque vide) : le `.zip` est vérifié, mis en attente (`data/import-en-attente.zip`), le serveur s'arrête avec le code 75 et applique l'import au redémarrage, base fermée (`server/restauration.ts`) ; relance automatique par `npm run partie`, `npm start` et Kubernetes. Écran d'installation (import ou nouvelle partie) à la première ouverture d'un serveur neuf. **État au 19 novembre 2026** : version 0.3.0 publiée ; ArgoCD de l’ami refusait la synchronisation (« spec.strategy.rollingUpdate: Forbidden … Recreate ») : stratégie corrigée dans le chart, Brumeland s’affiche en ligne (écran d’installation). Partie importée par Antoine (session MJ en ligne OK) ; version 0.4.0 (liens courts) publiée le 19 novembre et fonctionnelle. Reste : test des WebSockets avec un joueur (Prout), puis retrait de Cloudflare Access par l’ami. Le fork `merlindorin/el-sitio` ne sert qu'aux propositions de modification (pas de chart sur son main).
- **Liens courts** (19 novembre 2026, demandés par Antoine) : jetons de 12 caractères en trois groupes (`k7m2-qx9p-4hdt`, minuscules et chiffres sans 0/o/1/l/i), créés par `server/jetons.ts`. Migration 15 : chaque jeton long remplacé, l'ancien gardé dans `ancien_jeton` ; un ancien lien ou un lien tapé en majuscules ou sans tirets redirige vers le lien exact (`GET /jeu/:jeton`, mode partie). Les migrations peuvent être du SQL ou une fonction.
- **Étape 9 : plusieurs parties** (décidée le 19 novembre 2026). Usage : une partie principale, plus des parties de test ou nouvelles « si jamais ». Choix validés : bibliothèque d'images **commune** à toutes les parties (scènes, pions, grille par image inchangée, propres à chaque partie pour les scènes) ; une partie = son lien MJ et ses liens joueurs. Découpage : 9.1 séparation des parties sur le serveur ; 9.2 menu des parties sur l'écran MJ (sélecteur, partie principale en tête, nouvelle / renommer / supprimer avec confirmation, jamais la dernière, sauvegarde avant) ; 9.3 export d'une seule partie, import qui ajoute une partie, « Dupliquer la partie » (nouveaux liens pour la copie). **9.1 codée** le 19 novembre : salles Socket.IO par partie (`server/salles.ts`), partie déduite du jeton, images sans `partie_id` (migration 16 ; les migrations tournent clés étrangères suspendues, avec `foreign_key_check`), une image utilisée par une scène d'une autre partie ne se supprime pas (« Taverne (partie « X ») »). Partie principale = la plus ancienne (`partiePrincipale()`), seule installée sur un serveur neuf. Export et import encore globaux (toute la base) jusqu'à 9.3. Test avec un vrai serveur et deux parties : `server/parties.test.ts`. **9.2 codée** le 19 novembre : panneau « Mes parties » en tête de la zone MJ (`client/src/Parties.tsx`) et sélecteur à la place du nom de la partie en haut (dès deux parties) ; ⭐ = partie principale (la plus ancienne) ; changer de partie = ouvrir son lien MJ ; tout MJ reçoit la liste de toutes les parties (événement `parties`) ; création (nom unique, 40 caractères), renommage (`partie:nom` diffusé à la partie), suppression avec double clic, refusée pour la partie ouverte (donc jamais la dernière), sauvegarde « avant suppression d'une partie » d'abord, joueurs de la partie supprimée exclus. Une nouvelle partie n'est pas ouverte automatiquement (bouton « Ouvrir »). **9.3 codée** le 19 novembre : copie d'une partie d'une base vers une autre (`server/copie-partie.ts`, nouveaux numéros partout, combat et brouillard repris) ; migrations déplacées dans `server/migrations.ts` (`migrerBase(db)`, sert aussi à mettre à niveau la base d'un export ancien). « 📑 Dupliquer » : copie dans le même serveur, nouveaux liens, nom « X (copie) ». « 📦 Exporter cette partie » (`GET /api/export`) : base neuve avec la seule partie du MJ, mêmes liens, images de ses scènes ; « Exporter tout le serveur » (`?tout=1`) : copie de la base entière. « 📥 Importer une partie » (MJ) : chaque partie de l'export est **ajoutée** (nom « X (importée) » si pris), liens gardés s'ils sont libres sur ce serveur, sinon nouveaux ; plus de redémarrage. Le remplacement complet reste pour l'installation d'un serveur neuf (redémarrage, code 75) et `npm run restaurer`. Testé sur une copie de la vraie partie : dupliquer, exporter, réimporter, et import d'un export 0.3.0 (schéma 14).
- **Refonte de l'interface** (demandée le 19 novembre 2026, maquettes validées) : scène plus grande, gestion à part. Découpage : R1 barre du haut + panneau Gestion ; R2 deux colonnes (droite empilée, pas d'onglets, car Combat, Lancer les dés et Journal servent souvent ensemble : combat replié en une ligne hors combat, liste d'initiative compacte avec PS des PNJ visibles en court et détail au clic, lancer de dés en une ligne avec options dépliables, journal qui prend la hauteur restante et défile) ; R3 finitions après une séance. Même disposition pour les joueurs (sans Gestion). **R1 codée** le 19 novembre : titre « Brumeland VTT » retiré (reste dans l'onglet du navigateur) ; barre fine en haut (`client/src/BarreHaut.tsx`) : partie (menu des parties pour le MJ) et rôle à gauche ; à droite, pastille « ● 4 / 5 à la table » qui se déplie au survol ou au clavier (présents, état du serveur, version, « Changer de nom » pour un joueur), bordure rouge si le serveur est injoignable ; bouton « ⚙️ Gestion » (MJ) qui ouvre un panneau latéral (`client/src/Gestion.tsx`, Échap ou ✕ pour fermer, onglet retenu par le navigateur) : Invitations, Mes parties, Export et import. Panneau « À la table » retiré de la colonne de gauche. Couleurs (19 novembre, choisies par Antoine) : fond gris très sombre teinté de vert (`--fond #191e1b`, `--fond-carte #222924`, `--bordure #354039`, `--discret #97a399`), texte parchemin inchangé, accent vert mousse `#a4b866` (au lieu de l'or) ; signal « Pointer du doigt » en vert mousse clair et vif `#cdee55` cerclé de sombre ; règle, halo de tour et pions restent en or sur la carte.
- Pendant les tests : Antoine a souvent son propre serveur lancé sur les ports 3000 et 5173. Tester sur le port 3100 avec une base séparée (`BRUMELAND_BASE`), et n'arrêter un processus que par son numéro exact.

## Hors périmètre

- Audio et vidéo intégrés (Discord s'en charge).
- Interface mobile ou tablette.
- Comptes utilisateurs, mots de passe, gestion multi-parties publique.
- Éclairage dynamique et lignes de vue automatiques.
- Automatisation complète des règles : l'outil aide le MJ, il ne le remplace pas.

## Musique d'ambiance

Pour commencer, Antoine utilise **Kenku FM** (logiciel externe qui diffuse du son dans Discord), donc rien à développer. Un lecteur intégré simple est prévu à l'étape 8 : le MJ dépose des fichiers audio, lance une piste, et le serveur la synchronise chez tous les joueurs, chacun réglant son propre volume.

## Dépôt et environnement

- Dossier local : `/home/antoine/workspace/brumeland-vtt`, dans WSL.
- Dépôt GitHub : `brumeland-vtt`, sur le compte d'Antoine. Au démarrage, vérifier que le dossier est bien relié au dépôt et qu'Antoine est authentifié auprès de GitHub depuis WSL ; sinon, l'accompagner pas à pas.
- Node.js est déjà installé dans WSL. Vérifier la version avant de choisir celles des dépendances.
- Faire des commits petits et réguliers, avec des messages en français qui décrivent le changement.
- Ne jamais mettre dans le dépôt : la base SQLite, les jetons d'invitation, les fichiers de configuration du tunnel, les images et musiques de la partie.

## Premier message suggéré

« Lis CLAUDE.md et le résumé des règles de Dragonbane présents dans ce dossier, vérifie l'état du dépôt git, puis propose-moi le découpage de l'étape 1 avant de commencer. »
