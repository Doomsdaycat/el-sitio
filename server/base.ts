// Base de données SQLite : un seul fichier, data/brumeland.db.
// Pour sauvegarder la partie, il suffit de copier ce fichier (serveur arrêté).

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const CHEMIN_BASE = resolve(process.env.BRUMELAND_BASE ?? "data/brumeland.db");

mkdirSync(dirname(CHEMIN_BASE), { recursive: true });

export const base = new DatabaseSync(CHEMIN_BASE);
base.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// Évolutions successives du schéma. On n'en modifie jamais une déjà publiée :
// on en ajoute une nouvelle à la fin de la liste.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE partie (
    id        INTEGER PRIMARY KEY,
    nom       TEXT NOT NULL,
    cree_le   TEXT NOT NULL
  );
  CREATE TABLE participant (
    id               INTEGER PRIMARY KEY,
    partie_id        INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('mj', 'joueur')),
    jeton            TEXT NOT NULL UNIQUE,
    nom              TEXT,
    cree_le          TEXT NOT NULL,
    derniere_visite  TEXT
  );
  `,
  // Étape 1.3 : étiquette privée du MJ pour savoir à qui il a envoyé chaque lien.
  `
  ALTER TABLE participant ADD COLUMN etiquette TEXT;
  `,
  // Étape 2 : journal des jets de dés. Le nom et le rôle de l'auteur sont recopiés,
  // pour que le journal reste lisible même si une invitation est supprimée.
  `
  CREATE TABLE jet (
    id           INTEGER PRIMARY KEY,
    partie_id    INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    auteur_id    INTEGER NOT NULL,
    auteur_nom   TEXT NOT NULL,
    auteur_role  TEXT NOT NULL CHECK (auteur_role IN ('mj', 'joueur')),
    cree_le      TEXT NOT NULL,
    libelle      TEXT,
    secret       INTEGER NOT NULL DEFAULT 0,
    revele       INTEGER NOT NULL DEFAULT 0,
    resultat     TEXT NOT NULL,
    force_de     INTEGER REFERENCES jet(id) ON DELETE SET NULL,
    etat         TEXT,
    deja_force   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX jet_partie ON jet(partie_id, id);
  `,
  // Jet lancé par le MJ pour le personnage d'un joueur (nom recopié, comme pour l'auteur).
  `
  ALTER TABLE jet ADD COLUMN pour_id INTEGER;
  ALTER TABLE jet ADD COLUMN pour_nom TEXT;
  `,
  // Jets en opposition : lien vers le jet d'origine auquel on s'oppose.
  `
  ALTER TABLE jet ADD COLUMN oppose_a INTEGER REFERENCES jet(id) ON DELETE SET NULL;
  ALTER TABLE jet ADD COLUMN ouverte INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX jet_oppose_a ON jet(oppose_a) WHERE oppose_a IS NOT NULL;
  `,
  // Étape 3 : une fiche de personnage par joueur, enregistrée en JSON.
  // Elle disparaît avec le joueur si son invitation est supprimée.
  `
  CREATE TABLE personnage (
    joueur_id  INTEGER PRIMARY KEY REFERENCES participant(id) ON DELETE CASCADE,
    partie_id  INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    donnees    TEXT NOT NULL,
    maj_le     TEXT NOT NULL
  );
  `,
  // Étape 4 : images déposées par le MJ (fichiers dans data/medias/) et scène montrée à tous.
  `
  CREATE TABLE image (
    id         TEXT PRIMARY KEY,
    partie_id  INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    nom        TEXT NOT NULL,
    fichier    TEXT NOT NULL,
    type       TEXT NOT NULL,
    taille     INTEGER NOT NULL,
    cree_le    TEXT NOT NULL
  );
  ALTER TABLE partie ADD COLUMN scene_image_id TEXT;
  `,
  // Étape 5 : carte de combat (une image de la bibliothèque), grille propre à chaque image,
  // et pions posés sur chaque carte (un pion de personnage joueur par joueur et par carte).
  `
  ALTER TABLE partie ADD COLUMN carte_image_id TEXT;
  ALTER TABLE image ADD COLUMN grille TEXT;
  CREATE TABLE pion (
    id         TEXT PRIMARY KEY,
    partie_id  INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    image_id   TEXT NOT NULL REFERENCES image(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('pj', 'pnj')),
    joueur_id  INTEGER REFERENCES participant(id) ON DELETE CASCADE,
    nom        TEXT NOT NULL DEFAULT '',
    couleur    TEXT NOT NULL,
    taille     INTEGER NOT NULL,
    col        INTEGER NOT NULL,
    lig        INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX pion_pj ON pion(image_id, joueur_id) WHERE joueur_id IS NOT NULL;
  `,
];

function migrer(): void {
  const { user_version: versionActuelle } = base.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  for (let i = versionActuelle; i < MIGRATIONS.length; i++) {
    base.exec("BEGIN");
    try {
      base.exec(MIGRATIONS[i]);
      base.exec(`PRAGMA user_version = ${i + 1}`);
      base.exec("COMMIT");
    } catch (erreur) {
      base.exec("ROLLBACK");
      throw erreur;
    }
  }
}

migrer();
