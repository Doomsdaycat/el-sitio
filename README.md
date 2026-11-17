# Brumeland VTT

Table de jeu virtuelle maison pour jouer à **Dragonbane** en ligne entre amis.
Les joueurs cliquent sur un lien et ils sont à la table : aucun compte, rien à installer.
La voix passe par Discord.

> **Avancement :** étape 1 (socle et connexion) terminée. Prochaine étape : les dés et le journal.

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
- **Sauvegarde** : la partie, les liens et les noms sont conservés quand tu arrêtes le serveur.

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

Le lien MJ donne tous les droits sur la partie : ne le partage pas.

## Données de la partie

La partie est enregistrée dans un seul fichier, `data/brumeland.db`.
Pour la sauvegarder, copie ce fichier pendant que le serveur est arrêté.
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
