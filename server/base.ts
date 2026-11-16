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
