# Brumeland VTT

Table de jeu virtuelle maison pour jouer à **Dragonbane** en ligne entre amis.
Les joueurs cliquent sur un lien et ils sont à la table : aucun compte, rien à installer.
La voix passe par Discord.

> **Avancement :** étapes 1 à 7 terminées : connexion, dés et journal, fiches de personnage,
> scènes (illustrations et scènes immersives avec grille et pions), combat, brouillard de guerre.
> Étape 8 en cours : sauvegardes automatiques et export de la partie (musique reportée).

## Lancer une séance (2 commandes)

Dans le terminal WSL, va dans le dossier du projet :

```bash
cd ~/workspace/brumeland-vtt
```

Ouvre le tunnel et démarre la partie :

```bash
npm run partie
```

Au bout de 10 à 20 secondes, le terminal affiche le **lien MJ** : ouvre-le dans ton navigateur.
Sur ton écran MJ, clique sur **Copier** à côté de chaque joueur et envoie-lui son lien sur Discord.

Pour arrêter la séance : `Ctrl + C` dans le terminal.

**À chaque séance, renvoie leurs liens aux joueurs** : l'adresse du tunnel gratuit change à chaque
lancement. Si un lien ne s'ouvre pas tout de suite, attends une minute : le tunnel finit de s'activer.

## Ce que fait l'outil aujourd'hui

- **Invitations** : sur ton écran MJ, crée un lien par joueur (avec une note pour toi, par exemple
  « Julien »), copie-le, ou supprime-le. Range-les à ta guise (poignée ⋮⋮ ou flèches ↑ ↓). Un lien supprimé ne marche plus et déconnecte le joueur aussitôt.
- **Arrivée d'un joueur** : à sa première visite, il choisit son nom. Ensuite, son lien suffit.
- **À la table** : tout le monde voit qui est là. Pastille verte : connecté. Grise : parti.
- **Reconnexion** : après une coupure (Wi-Fi, serveur redémarré), un bandeau jaune s'affiche et la page
  se reconnecte toute seule.
- **Dés** : jets de compétence (1D20 sous la valeur) avec faveurs et fléaux, dragon (1) et démon (20),
  et jets libres pour les dégâts (`2D6+3`, `1D8+1D4`, `1D3`…). Les dés sont lancés par le serveur.
- **Jets pour un joueur** : le MJ peut lancer pour le personnage d'un joueur (choix « Pour qui ? »).
- **Forcer la chance** : sur un jet raté (sauf démon) d'un personnage joueur, le joueur ou le MJ relance
  en choisissant un état, qui se coche sur la fiche. Un état déjà subi ne peut pas être choisi, et
  avec les six états on ne peut plus forcer la chance. Les jets de PNJ ne peuvent pas être forcés.
- **Jets en opposition** : sous un jet du journal, **S'opposer** prépare la réponse de l'adversaire.
  Le journal indique qui l'emporte. Seul celui qui agit peut forcer la chance, et seulement avant
  la réponse. Le MJ peut choisir une **opposition ouverte** (bras de fer, poison, maladie) : égalité
  si les deux ratent ou font le même dé, et chacun peut forcer la chance.
- **Jets secrets du MJ** : les joueurs voient « Le MJ lance les dés en secret… », sans le résultat,
  jusqu'à ce que le MJ clique sur **Révéler aux joueurs**.
- **Fiches de personnage** : une par joueur, visibles par tous, modifiables par le joueur et le MJ.
  PS max, PV max, déplacement, bonus aux dégâts et chances de base sont calculés d'après le livre.
  Un clic sur une compétence, une caractéristique ou une école de magie lance le dé ; un état subi
  ajoute automatiquement un fléau aux jets de sa caractéristique.
- **Scènes** : le MJ dépose ses images dans sa **bibliothèque** (JPG, PNG, WebP ou GIF, 30 Mo au plus),
  puis crée des **scènes** : un nom, un type et une image. Une même image peut servir à plusieurs scènes
  (par exemple une carte champêtre pour plusieurs combats). Une seule scène est montrée à la fois, dans
  l'onglet **Scène** ; les joueurs y basculent quand une nouvelle scène est montrée.
  - **Illustration** : l'image en grand, que chacun peut zoomer de son côté.
  - **Immersive** : une carte avec grille (1 case = 2 m, une diagonale compte aussi 2 m), pions, règle de
    mesure et pointeur. La grille s'aligne une fois par image ; chaque scène garde ses propres pions.
    Chaque personnage joueur a son pion et un joueur ne déplace que le sien. En glissant un pion, on voit
    la distance parcourue et le déplacement de la fiche (« 8 m / 10 m »).
  - Le MJ peut **préparer** une scène (placer les PNJ, régler la grille) sans que les joueurs la voient.
  - Pions : le MJ marque un PNJ ou un monstre **mort** (grisé, croix rouge) et un personnage joueur
    **à terre** (contour rouge). Il peut **cacher** un PNJ (jamais envoyé aux joueurs) et le révéler
    au bon moment, ou l'ajouter directement caché.
  - Le MJ range ses scènes à sa guise dans « Mes scènes » : poignée ⋮⋮ à glisser, ou flèches ↑ ↓.
  - **Brouillard sur une illustration** (carte de ville, de région) : le MJ dévoile la carte au
    **pinceau rond** aux bords doux (taille réglable), en mode Révéler ou Recouvrir, pour l'exploration.
  - **Brouillard de guerre** (scène immersive) : le MJ l'active dans « Préparer la scène ». Les joueurs
    ne voient que les cases révélées ; le MJ voit la carte à travers un voile. Outil **Brouillard** :
    **Révéler** ou **Recouvrir**, par **zone** (rectangle) ou au **pinceau** ; **Tout révéler**,
    **Tout recouvrir**. Un PNJ entièrement dans le brouillard n'est pas envoyé aux joueurs
    (« ??? » dans le combat) ; les pions des joueurs restent visibles.
  - Zoom : `Ctrl` + molette (ou molette seule en plein écran), double-clic, boutons − et +.
  - **🥾 Annuler déplacement** (ou `Ctrl + Z`, souris sur la carte) : annule son dernier déplacement
    de pion, puis le précédent… En combat, la trace raccourcit et les mètres sont rendus. Refusé si
    le pion a été déplacé depuis par quelqu'un d'autre, ou si le déplacement date d'un round passé.
- **Combat** : panneau en haut à gauche. Le MJ commence un combat (tous les personnages joueurs
  y sont), ajoute les PNJ de la scène, des groupes de PNJ (une carte pour le groupe) ou des
  monstres à plusieurs cartes, et peut noter leurs PS (visibles de lui seul). Le serveur tire les
  10 cartes d'initiative à chaque round ; le n° 1 joue en premier. Surprise au premier round
  (les attaquants choisissent leur carte), **Attendre** (échanger sa carte avec une plus tardive),
  **Réaction** (carte retournée, plus de déplacement), **Course** (déplacement doublé).
  Le pion dont c'est le tour a un halo doré ; en glissant son pion, le joueur voit ce qu'il lui
  reste à parcourir ce round (« 4 m (reste 2 m / 10 m) »). Le chemin de chaque pion pendant le
  round est tracé sur la carte. Les PS (joueurs et PNJ) se règlent depuis le combat ; à 0, le pion
  passe « mort » (PNJ) ou « à terre » (joueur). Le round suivant attend que tout le monde ait joué.
- **Journal** : tout le monde voit les jets, conservés d'une séance à l'autre (le MJ peut le vider).
- **Sauvegarde** : la partie, les liens, les noms et le journal sont conservés quand tu arrêtes le serveur.
  Le serveur en prend aussi des copies tout seul (voir « Sauvegardes et export » plus bas).
- **📦 Exporter la partie** (en bas de l'écran MJ) : télécharge un seul fichier `.zip` avec toute la
  partie et ses images, pour la garder ailleurs ou la déplacer sur un autre ordinateur.

## Installation (une seule fois)

### Prérequis

WSL 2 sous Windows, avec Node.js 22 (version 22.12 ou plus récente).

### Dépendances du projet

Depuis le dossier du projet :

```bash
npm install
```

### cloudflared (le tunnel)

Crée le dossier des programmes personnels (sans effet s'il existe déjà) :

```bash
mkdir -p ~/.local/bin
```

Télécharge cloudflared depuis le site officiel de Cloudflare sur GitHub :

```bash
curl -L --fail -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
```

Rends-le exécutable :

```bash
chmod +x ~/.local/bin/cloudflared
```

Vérifie qu'il répond (il affiche son numéro de version) :

```bash
cloudflared --version
```

## Commandes utiles

| Commande | À quoi elle sert |
|---|---|
| `npm run partie` | Séance en ligne : tunnel + serveur, liens publics en `https://…` |
| `npm start` | Partie sur ton PC seulement, sans tunnel (liens en `localhost:3000`), pour tester seul |
| `npm run sauvegardes` | Liste les sauvegardes automatiques, numérotées (la plus récente en n° 1) |
| `npm run restaurer -- 3` | Revient à la sauvegarde n° 3 (serveur arrêté) ; ou `npm run restaurer -- fichier.zip` pour un export |
| `npm run mettre-en-ligne` | Publie la version actuelle sur l'hébergement en ligne (voir plus bas) |
| `npm run lien-mj` | Réaffiche ton lien MJ, adresse `localhost` (marche sur ton PC même pendant une séance en ligne) |
| `npm run dev` | Mode développement (port 5173), utilisé pendant la construction de l'outil |
| `npm run verifier` | Vérifie le code |
| `npm run tester` | Lance les tests automatiques des règles de dés |

Le lien MJ donne tous les droits sur la partie : ne le partage pas.

## Données de la partie

La partie est enregistrée dans le dossier `data/` : la base `data/brumeland.db` et les images
déposées par le MJ dans `data/medias/`.
Le dossier `data/` n'est jamais envoyé sur GitHub. Le journal du tunnel s'y trouve aussi
(`data/tunnel.log`), utile en cas de problème.

## Sauvegardes et export

**Sauvegardes automatiques.** Le serveur copie la partie dans `data/sauvegardes/` au démarrage,
toutes les 30 minutes si quelque chose a changé, et à l'arrêt. Il garde les 20 plus récentes.
Il en prend aussi une avant chaque mise à jour de l'outil qui modifie la base.
Les images ne sont pas recopiées à chaque fois : une image supprimée de la bibliothèque est mise de
côté dans `data/corbeille/`, et revient toute seule si tu restaures une sauvegarde qui l'utilise.

**Revenir en arrière** (par exemple après une fausse manipulation). Arrête d'abord le serveur
(`Ctrl + C`). Affiche la liste des sauvegardes :

```bash
npm run sauvegardes
```

Puis restaure celle que tu veux, par son numéro dans la liste (ici la n° 3) :

```bash
npm run restaurer -- 3
```

Avant de restaurer, l'outil met de côté l'état actuel : il apparaît en tête de liste
(« avant restauration »), pour pouvoir annuler la restauration de la même façon.

**Export.** Sur ton écran MJ, **📦 Exporter la partie** télécharge un fichier `.zip` avec toute la
partie et ses images. Garde-le hors du PC (clé USB, cloud), ou sers-t'en pour installer la partie
ailleurs : copie le fichier dans le dossier du projet, serveur arrêté, puis :

```bash
npm run restaurer -- brumeland-2026-11-18_21h30.zip
```

(remplace par le nom de ton fichier). ⚠️ L'export contient les liens d'invitation, le tien compris :
ne le partage pas.

## En cas de problème

| Message ou symptôme | Que faire |
|---|---|
| « Le port 3000 est déjà utilisé » | Brumeland tourne déjà dans un autre terminal : ferme-le avec `Ctrl + C`, puis relance. |
| « Le programme cloudflared est introuvable » | Refais l'installation de cloudflared ci-dessus. |
| « Le tunnel n'a pas répondu » | Vérifie ta connexion Internet, puis relance `npm run partie`. |
| Le lien d'un joueur ne s'ouvre pas du tout | Il date sans doute d'une séance précédente (ancienne adresse) : renvoie-lui le lien du jour. |
| Un joueur voit « ce lien n'est pas reconnu » | Son invitation a été supprimée : crée-lui un nouveau lien. |
| Bandeau jaune qui ne disparaît pas | Le serveur est arrêté : regarde le terminal, relance `npm run partie`. |

## Hébergement en ligne (adresse fixe)

Brumeland peut tourner en permanence sur le serveur d'un ami, à l'adresse fixe
**https://antoine.vanyda.cloud**. Plus besoin de tunnel ni de laisser ton PC allumé, et les liens
des joueurs ne changent plus d'une séance à l'autre.

Ça réutilise le dépôt GitHub **el-sitio**, que le serveur de l'ami surveille : el-sitio contient
désormais une copie exacte de Brumeland (l'ancien site reste dans la branche `ancien-site`).

**Publier une nouvelle version** (pas pendant une séance : le serveur en ligne redémarre) :

```bash
npm run mettre-en-ligne
```

La commande vérifie le code, envoie la version sur GitHub, attend que GitHub fabrique l'image
(3 à 6 minutes), puis demande au serveur de l'installer. La partie et les liens ne changent pas.

**Première installation** : à la première ouverture de l'adresse, une page propose
d'**importer une partie** (le `.zip` de « 📦 Exporter la partie ») ou d'en commencer une nouvelle.
Après l'import, ton lien MJ s'ouvre tout seul. À faire avant que l'adresse soit ouverte au public.

**Ensuite**, depuis ton écran MJ en ligne : **📦 Exporter la partie** pour en garder une copie,
**📥 Importer une partie** pour la remplacer par un export (l'état actuel est d'abord sauvegardé).

Détails techniques (pour l'hébergeur) : le chart Helm est dans `chart/` (nom `el-sitio` gardé
pour que l'installation existante reste valable) ; un seul exemplaire, disque permanent de 2 Go
monté sur `/app/data`, port 3000 derrière le service `el-sitio` (port 80), WebSockets nécessaires.
L'image `ghcr.io/doomsdaycat/el-sitio` est fabriquée par `.github/workflows/release.yml`.

Le `Dockerfile` permet aussi d'installer Brumeland sur n'importe quel serveur (instructions en tête du fichier).
