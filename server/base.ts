// Base de données SQLite : un seul fichier, data/brumeland.db.
// Les sauvegardes sont prises par le serveur lui-même (voir sauvegardes.ts).

import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CHEMIN_BASE, DOSSIER_DONNEES } from "./chemins.ts";
import { migrerBase } from "./migrations.ts";
import { appliquerImportEnAttente } from "./restauration.ts";
import { sauvegarder } from "./sauvegardes.ts";

export { CHEMIN_BASE };

mkdirSync(DOSSIER_DONNEES, { recursive: true });

// Partie importée depuis le navigateur : mise en place avant d'ouvrir la base.
appliquerImportEnAttente();

export const base = new DatabaseSync(CHEMIN_BASE);
base.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// Mise à jour du schéma ; copie de la base avant de toucher à une partie existante.
migrerBase(base, () => sauvegarder(base, "avant-mise-a-jour"));
