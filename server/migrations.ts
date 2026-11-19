// Évolutions du schéma de la base, appliquées dans l'ordre (PRAGMA user_version).
// Ce module n'ouvre aucune base : il sert à la base du serveur et aux bases lues dans un export.

import type { DatabaseSync } from "node:sqlite";
import { FORMAT_JETON, nouveauJeton } from "./jetons.ts";

// Évolutions successives du schéma. On n'en modifie jamais une déjà publiée :
// on en ajoute une nouvelle à la fin de la liste. Une évolution est du SQL, ou une fonction
// quand il faut calculer quelque chose (jetons aléatoires…).
const MIGRATIONS: (string | ((db: DatabaseSync) => void))[] = [
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
  // Réorganisation des scènes : une scène a un nom, un type (illustration ou immersive) et une
  // image ; une image peut servir à plusieurs scènes. Les pions appartiennent à une scène
  // (et non plus à une image). Les données existantes sont reprises :
  // - chaque image qui avait des pions (ou servait de carte) devient une scène immersive ;
  // - l'image montrée devient une scène illustration ;
  // - la scène montrée est la carte de combat si elle existait, sinon l'illustration.
  `
  CREATE TABLE scene (
    id         TEXT PRIMARY KEY,
    partie_id  INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    nom        TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('illustration', 'immersive')),
    image_id   TEXT NOT NULL REFERENCES image(id),
    cree_le    TEXT NOT NULL
  );
  ALTER TABLE partie ADD COLUMN scene_active_id TEXT;

  INSERT INTO scene (id, partie_id, nom, type, image_id, cree_le)
    SELECT 'm' || image.id, image.partie_id, image.nom, 'immersive', image.id, image.cree_le
    FROM image
    WHERE image.id IN (SELECT image_id FROM pion)
       OR image.id IN (SELECT carte_image_id FROM partie WHERE carte_image_id IS NOT NULL);

  INSERT INTO scene (id, partie_id, nom, type, image_id, cree_le)
    SELECT 'i' || image.id, image.partie_id, image.nom, 'illustration', image.id, image.cree_le
    FROM image
    WHERE image.id IN (SELECT scene_image_id FROM partie WHERE scene_image_id IS NOT NULL);

  UPDATE partie SET scene_active_id = CASE
    WHEN carte_image_id IS NOT NULL AND EXISTS (SELECT 1 FROM image WHERE id = carte_image_id)
      THEN 'm' || carte_image_id
    WHEN scene_image_id IS NOT NULL AND EXISTS (SELECT 1 FROM image WHERE id = scene_image_id)
      THEN 'i' || scene_image_id
    ELSE NULL END;

  CREATE TABLE pion_scene (
    id         TEXT PRIMARY KEY,
    partie_id  INTEGER NOT NULL REFERENCES partie(id) ON DELETE CASCADE,
    scene_id   TEXT NOT NULL REFERENCES scene(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('pj', 'pnj')),
    joueur_id  INTEGER REFERENCES participant(id) ON DELETE CASCADE,
    nom        TEXT NOT NULL DEFAULT '',
    couleur    TEXT NOT NULL,
    taille     INTEGER NOT NULL,
    col        INTEGER NOT NULL,
    lig        INTEGER NOT NULL
  );
  INSERT INTO pion_scene (id, partie_id, scene_id, type, joueur_id, nom, couleur, taille, col, lig)
    SELECT id, partie_id, 'm' || image_id, type, joueur_id, nom, couleur, taille, col, lig FROM pion;
  DROP TABLE pion;
  ALTER TABLE pion_scene RENAME TO pion;
  CREATE UNIQUE INDEX pion_pj ON pion(scene_id, joueur_id) WHERE joueur_id IS NOT NULL;
  `,
  // Ordre des scènes, choisi par le MJ (0 = en haut de la liste). On part de l'ordre affiché
  // jusqu'ici : la plus récente en haut.
  `
  ALTER TABLE scene ADD COLUMN ordre INTEGER NOT NULL DEFAULT 0;
  UPDATE scene SET ordre = (
    SELECT count(*) FROM scene AS autre
    WHERE autre.partie_id = scene.partie_id
      AND (autre.cree_le > scene.cree_le OR (autre.cree_le = scene.cree_le AND autre.rowid > scene.rowid))
  );
  `,
  // États des pions (« mort » pour un PNJ, « à terre » pour un personnage joueur)
  // et pions de PNJ cachés aux joueurs.
  `
  ALTER TABLE pion ADD COLUMN etat TEXT NOT NULL DEFAULT 'normal';
  ALTER TABLE pion ADD COLUMN cache INTEGER NOT NULL DEFAULT 0;
  `,
  // Étape 6 : combat en cours (participants, cartes d'initiative, déplacements du round), en JSON.
  `
  ALTER TABLE partie ADD COLUMN combat TEXT;
  `,
  // Étape 7 : brouillard de guerre de chaque scène (activé, cases révélées), en JSON.
  `
  ALTER TABLE scene ADD COLUMN brouillard TEXT;
  `,
  // Ordre des invitations des joueurs, choisi par le MJ (on part de l'ordre de création).
  `
  ALTER TABLE participant ADD COLUMN ordre INTEGER NOT NULL DEFAULT 0;
  UPDATE participant SET ordre = id;
  `,
  // Liens d'invitation plus courts (« k7m2-qx9p-4hdt ») : chaque jeton long est remplacé.
  // L'ancien est gardé pour que les liens déjà envoyés mènent au nouveau (redirection).
  (db) => {
    db.exec("ALTER TABLE participant ADD COLUMN ancien_jeton TEXT");
    db.exec("CREATE UNIQUE INDEX participant_ancien_jeton ON participant (ancien_jeton)");
    const lignes = db.prepare("SELECT id, jeton FROM participant").all() as { id: number; jeton: string }[];
    const remplacer = db.prepare("UPDATE participant SET jeton = ?, ancien_jeton = jeton WHERE id = ?");
    for (const { id, jeton } of lignes) {
      if (!FORMAT_JETON.test(jeton)) remplacer.run(nouveauJeton(), id);
    }
  },
  // Plusieurs parties : la bibliothèque d'images devient commune à toutes les parties
  // (la colonne partie_id disparaît ; les scènes, elles, restent propres à leur partie).
  `
  CREATE TABLE image_commune (
    id         TEXT PRIMARY KEY,
    nom        TEXT NOT NULL,
    fichier    TEXT NOT NULL,
    type       TEXT NOT NULL,
    taille     INTEGER NOT NULL,
    cree_le    TEXT NOT NULL,
    grille     TEXT
  );
  INSERT INTO image_commune (id, nom, fichier, type, taille, cree_le, grille)
    SELECT id, nom, fichier, type, taille, cree_le, grille FROM image;
  DROP TABLE image;
  ALTER TABLE image_commune RENAME TO image;
  `,
  // Un joueur peut être retiré d'une scène par le MJ : son pion reste, marqué absent (pour que
  // l'outil ne le remette pas tout seul), et le MJ peut l'y remettre.
  `
  ALTER TABLE pion ADD COLUMN absent INTEGER NOT NULL DEFAULT 0;
  `,
];

/** Nombre de migrations : la version du schéma d'une base à jour. */
export const VERSION_SCHEMA = MIGRATIONS.length;

/**
 * Met une base au niveau de cet outil (la partie du serveur, ou une base lue dans un export).
 * @param avantMiseAJour appelée avant de toucher à une base existante (sauvegarde de sécurité).
 */
export function migrerBase(db: DatabaseSync, avantMiseAJour?: () => void): void {
  const { user_version: versionActuelle } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (versionActuelle > MIGRATIONS.length) {
    throw new Error("Cette base vient d'une version plus récente de Brumeland : mets l'outil à jour.");
  }
  if (versionActuelle > 0 && versionActuelle < MIGRATIONS.length) avantMiseAJour?.();
  // Clés étrangères suspendues pendant les migrations (méthode recommandée par SQLite pour
  // reconstruire une table) ; on vérifie avant chaque validation qu'aucune référence
  // incohérente n'est apparue.
  db.exec("PRAGMA foreign_keys = OFF");
  const incoherencesAvant = db.prepare("PRAGMA foreign_key_check").all().length;
  try {
    for (let i = versionActuelle; i < MIGRATIONS.length; i++) {
      db.exec("BEGIN");
      try {
        const migration = MIGRATIONS[i];
        if (typeof migration === "string") db.exec(migration);
        else migration(db);
        const incoherences = db.prepare("PRAGMA foreign_key_check").all();
        if (incoherences.length > incoherencesAvant) {
          throw new Error(`Migration ${i + 1} : références incohérentes ${JSON.stringify(incoherences)}`);
        }
        db.exec(`PRAGMA user_version = ${i + 1}`);
        db.exec("COMMIT");
      } catch (erreur) {
        db.exec("ROLLBACK");
        throw erreur;
      }
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
