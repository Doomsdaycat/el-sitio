# Brumeland VTT

Table de jeu virtuelle maison pour jouer à **Dragonbane** en ligne entre amis.

> Projet en construction : étape 1 (socle et connexion) en cours.

## Prérequis

- WSL 2 sous Windows, avec Node.js 22 (version 22.12 ou plus récente).

## Installation (une seule fois)

Dans le terminal WSL, depuis le dossier du projet :

```bash
npm install
```

## Lancer une partie

```bash
npm start
```

Cette commande prépare l'interface puis démarre le serveur (quelques secondes).
Le terminal affiche ensuite le **lien MJ** : ouvre-le dans le navigateur Windows.
Pour arrêter : `Ctrl + C` dans le terminal.

## Inviter les joueurs

Sur ton écran MJ, la section **Invitations des joueurs** permet de créer un lien par joueur
(avec une note facultative, par exemple « Julien »), de le copier pour l'envoyer sur Discord,
et de le supprimer. Un lien supprimé ne fonctionne plus : le joueur est déconnecté aussitôt.

## Qui est à la table ?

Tout le monde voit la liste **À la table** : une pastille verte pour les personnes connectées,
grise pour celles qui sont parties. Après une coupure (Wi-Fi, redémarrage du serveur),
un bandeau jaune s'affiche et la page se reconnecte toute seule.

## Retrouver le lien MJ

```bash
npm run lien-mj
```

Le lien MJ donne tous les droits sur la partie : ne le partage pas.

## Données de la partie

La partie est enregistrée dans un seul fichier, `data/brumeland.db`.
Pour la sauvegarder, copie ce fichier pendant que le serveur est arrêté.
Ce dossier n'est jamais envoyé sur GitHub.

## Pour développer

`npm run dev` lance le serveur et l'interface en mode développement : la page se met à jour
à chaque modification du code. Les liens utilisent alors le port 5173 au lieu de 3000.

## Vérifier le code

```bash
npm run verifier
```
