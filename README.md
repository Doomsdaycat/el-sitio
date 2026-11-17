# Brumeland VTT

Table de jeu virtuelle maison pour jouer à **Dragonbane** en ligne entre amis.
Les joueurs cliquent sur un lien et ils sont à la table : aucun compte, rien à installer.
La voix passe par Discord.

> **Avancement :** étapes 1 à 4 terminées : la version « théâtre de l'esprit » est jouable
> (connexion, dés et journal, fiches de personnage, scènes). Prochaine étape : la carte et la grille.

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
  « Julien »), copie-le, ou supprime-le. Un lien supprimé ne marche plus et déconnecte le joueur aussitôt.
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
- **Scènes** : au centre, l'onglet **Scène** affiche l'image que le MJ montre à tous (en grand, ou en
  plein écran). Chacun peut zoomer de son côté (molette, double-clic, boutons − et +) et se déplacer
  en faisant glisser l'image ; **Ajuster** revient à l'image entière. Le MJ dépose ses images dans sa bibliothèque (glisser-déposer, JPG, PNG, WebP ou GIF,
  30 Mo au plus), les prévisualise pour lui seul, les renomme, les montre ou les retire. Les joueurs
  ne voient jamais la bibliothèque, et passent sur l'onglet Scène quand une nouvelle image est montrée.
- **Journal** : tout le monde voit les jets, conservés d'une séance à l'autre (le MJ peut le vider).
- **Sauvegarde** : la partie, les liens, les noms et le journal sont conservés quand tu arrêtes le serveur.

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
| `npm run lien-mj` | Réaffiche ton lien MJ, adresse `localhost` (marche sur ton PC même pendant une séance en ligne) |
| `npm run dev` | Mode développement (port 5173), utilisé pendant la construction de l'outil |
| `npm run verifier` | Vérifie le code |
| `npm run tester` | Lance les tests automatiques des règles de dés |

Le lien MJ donne tous les droits sur la partie : ne le partage pas.

## Données de la partie

La partie est enregistrée dans le dossier `data/` : la base `data/brumeland.db` et les images
déposées par le MJ dans `data/medias/`. Pour tout sauvegarder, copie le dossier `data/` entier
pendant que le serveur est arrêté.
Le dossier `data/` n'est jamais envoyé sur GitHub. Le journal du tunnel s'y trouve aussi
(`data/tunnel.log`), utile en cas de problème.

## En cas de problème

| Message ou symptôme | Que faire |
|---|---|
| « Le port 3000 est déjà utilisé » | Brumeland tourne déjà dans un autre terminal : ferme-le avec `Ctrl + C`, puis relance. |
| « Le programme cloudflared est introuvable » | Refais l'installation de cloudflared ci-dessus. |
| « Le tunnel n'a pas répondu » | Vérifie ta connexion Internet, puis relance `npm run partie`. |
| Le lien d'un joueur ne s'ouvre pas du tout | Il date sans doute d'une séance précédente (ancienne adresse) : renvoie-lui le lien du jour. |
| Un joueur voit « ce lien n'est pas reconnu » | Son invitation a été supprimée : crée-lui un nouveau lien. |
| Bandeau jaune qui ne disparaît pas | Le serveur est arrêté : regarde le terminal, relance `npm run partie`. |

## Héberger ailleurs (plus tard)

Un `Dockerfile` permet d'installer Brumeland sur un autre serveur, avec une adresse fixe.
Les instructions sont en tête du fichier. **Il n'a pas encore été testé.**
