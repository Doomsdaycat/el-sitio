// Restauration d'une partie : depuis une sauvegarde automatique ou depuis un export .zip.
// Toujours faite base fermée : par la commande « npm run restaurer » (serveur arrêté), ou au
// démarrage du serveur quand un import a été déposé depuis le navigateur (fichier en attente).
// Ce module n'importe pas base.ts : il travaille avant que la base soit ouverte.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { unzipSync } from "fflate";
import { CHEMIN_BASE, DOSSIER_DONNEES, DOSSIER_MEDIAS, FICHIER_IMPORT, NOM_FICHIER_IMAGE } from "./chemins.ts";
import { ressortirImages, sauvegarder } from "./sauvegardes.ts";

/** Erreur à montrer telle quelle à Antoine (message en français). */
export class ErreurRestauration extends Error {}

export interface InfosBase {
  nomPartie: string;
  jetonMj: string;
}

/** Vérifie qu'un fichier est une base Brumeland lisible. */
export function lireBase(chemin: string): InfosBase {
  try {
    const db = new DatabaseSync(chemin, { readOnly: true });
    try {
      const partie = db.prepare("SELECT id, nom FROM partie ORDER BY id LIMIT 1").get() as
        | { id: number; nom: string }
        | undefined;
      const mj = partie
        ? (db.prepare("SELECT jeton FROM participant WHERE partie_id = ? AND role = 'mj' LIMIT 1").get(partie.id) as
            | { jeton: string }
            | undefined)
        : undefined;
      if (!partie || !mj) throw new Error("incomplète");
      return { nomPartie: partie.nom, jetonMj: mj.jeton };
    } finally {
      db.close();
    }
  } catch {
    throw new ErreurRestauration("Ce fichier n'est pas une partie Brumeland lisible : rien n'a été modifié.");
  }
}

/** Fait un travail sur une copie temporaire d'un fichier de base. */
function avecCopie<T>(octets: Uint8Array, travail: (chemin: string) => T): T {
  const dossier = mkdtempSync(join(tmpdir(), "brumeland-restauration-"));
  try {
    const chemin = join(dossier, "brumeland.db");
    writeFileSync(chemin, octets);
    return travail(chemin);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * Remplace la base de la partie par celle du chemin donné (déjà vérifiée).
 * L'état actuel est d'abord sauvegardé (« avant restauration »). Renvoie vrai s'il y en avait un.
 */
export function remplacerBase(source: string): boolean {
  const ancienne = existsSync(CHEMIN_BASE);
  if (ancienne) {
    const actuelle = new DatabaseSync(CHEMIN_BASE);
    try {
      sauvegarder(actuelle, "avant-restauration");
    } finally {
      actuelle.close(); // range aussi le journal d'écritures en attente (fichier -wal)
    }
  }
  mkdirSync(DOSSIER_DONNEES, { recursive: true });
  copyFileSync(source, CHEMIN_BASE);
  // D'éventuels restes de l'ancienne base ne doivent pas s'appliquer à la nouvelle.
  rmSync(`${CHEMIN_BASE}-wal`, { force: true });
  rmSync(`${CHEMIN_BASE}-shm`, { force: true });
  return ancienne;
}

/** Après restauration : images ressorties de la corbeille. Renvoie celles qui manquent encore. */
export function finirRestauration(): string[] {
  const db = new DatabaseSync(CHEMIN_BASE);
  try {
    return ressortirImages(db);
  } finally {
    db.close();
  }
}

export interface ContenuExport extends InfosBase {
  octetsBase: Uint8Array;
  medias: [string, Uint8Array][];
}

/** Lit et vérifie un export .zip, sans rien modifier. */
export function lireExport(octets: Uint8Array): ContenuExport {
  let contenu: Record<string, Uint8Array>;
  try {
    contenu = unzipSync(octets);
  } catch {
    throw new ErreurRestauration("Ce fichier .zip est illisible : rien n'a été modifié.");
  }
  const octetsBase = contenu["brumeland.db"];
  if (!octetsBase) {
    throw new ErreurRestauration("Ce fichier n'est pas un export Brumeland (pas de brumeland.db) : rien n'a été modifié.");
  }
  const infos = avecCopie(octetsBase, lireBase);
  // Images : seulement les noms attendus (jamais de chemin vers un autre dossier).
  const medias: [string, Uint8Array][] = [];
  for (const [nom, donnees] of Object.entries(contenu)) {
    const m = /^medias\/([^/]+)$/.exec(nom);
    if (m && NOM_FICHIER_IMAGE.test(m[1])) medias.push([m[1], donnees]);
  }
  return { ...infos, octetsBase, medias };
}

export interface BilanRestauration {
  nomPartie: string;
  images: number;
  manquants: string[];
  ancienneMiseDeCote: boolean;
}

/** Restaure un export .zip (base fermée). */
export function restaurerExport(octets: Uint8Array): BilanRestauration {
  const contenu = lireExport(octets);
  const ancienneMiseDeCote = avecCopie(contenu.octetsBase, remplacerBase);
  mkdirSync(DOSSIER_MEDIAS, { recursive: true });
  for (const [nom, donnees] of contenu.medias) writeFileSync(join(DOSSIER_MEDIAS, nom), donnees);
  return { nomPartie: contenu.nomPartie, images: contenu.medias.length, manquants: finirRestauration(), ancienneMiseDeCote };
}

/**
 * Au démarrage du serveur, avant d'ouvrir la base : applique l'import déposé depuis le
 * navigateur, s'il y en a un. En cas d'échec, la partie actuelle reste en place.
 */
export function appliquerImportEnAttente(): void {
  if (!existsSync(FICHIER_IMPORT)) return;
  try {
    const bilan = restaurerExport(readFileSync(FICHIER_IMPORT));
    rmSync(FICHIER_IMPORT);
    console.log(`Partie « ${bilan.nomPartie} » importée (${bilan.images} image(s)).`);
  } catch (erreur) {
    console.error("L'import de la partie a échoué, la partie actuelle est conservée :", erreur);
    renameSync(FICHIER_IMPORT, `${FICHIER_IMPORT}.echec`);
  }
}
