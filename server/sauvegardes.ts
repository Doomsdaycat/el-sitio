// Sauvegardes de la base : copies complètes et propres, prises même pendant la partie.
// Elles sont rangées dans data/sauvegardes/, les plus récentes d'abord ; on en garde 20.
// Les images ne sont pas recopiées : elles restent dans data/medias/, et une image supprimée
// part dans data/corbeille/ au lieu d'être effacée, pour que chaque sauvegarde reste complète.
// Ce module n'ouvre pas la base lui-même : il sert au serveur et à la commande de restauration.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DOSSIER_CORBEILLE, DOSSIER_MEDIAS, DOSSIER_SAUVEGARDES, NOM_FICHIER_IMAGE } from "./chemins.ts";

export const SAUVEGARDES_GARDEES = 20;

export interface Sauvegarde {
  fichier: string;
  chemin: string;
  /** Date de la copie. */
  date: Date;
  /** Motif particulier (« avant restauration », « avant mise à jour »), sinon null. */
  motif: string | null;
  taille: number;
}

const MOTIFS: Record<string, string> = {
  "avant-restauration": "avant restauration",
  "avant-mise-a-jour": "avant mise à jour de l'outil",
  "avant-suppression": "avant suppression d'une partie",
};

const deux = (n: number) => String(n).padStart(2, "0");

/** « 2026-11-18_14h30m05 », en heure locale : se trie dans l'ordre chronologique. */
function horodatage(d: Date): string {
  return (
    `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}` +
    `_${deux(d.getHours())}h${deux(d.getMinutes())}m${deux(d.getSeconds())}`
  );
}

const MOTIF_NOM = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)h(\d\d)m(\d\d)(?:_([a-z-]+))?\.db$/;

/** Copie complète de la base, cohérente même si la partie est en cours. */
export function copierBase(db: DatabaseSync, destination: string): void {
  db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
}

/** Toutes les sauvegardes, la plus récente en premier. */
export function listerSauvegardes(): Sauvegarde[] {
  if (!existsSync(DOSSIER_SAUVEGARDES)) return [];
  const liste: Sauvegarde[] = [];
  for (const fichier of readdirSync(DOSSIER_SAUVEGARDES)) {
    const m = MOTIF_NOM.exec(fichier);
    if (!m) continue;
    const [, an, mois, jour, h, min, s, motif] = m;
    const chemin = join(DOSSIER_SAUVEGARDES, fichier);
    liste.push({
      fichier,
      chemin,
      date: new Date(+an, +mois - 1, +jour, +h, +min, +s),
      motif: motif ? (MOTIFS[motif] ?? motif) : null,
      taille: statSync(chemin).size,
    });
  }
  return liste.sort((a, b) => (a.fichier < b.fichier ? 1 : -1));
}

/**
 * Prend une sauvegarde. Si elle est identique à la précédente (rien n'a changé), elle n'est
 * pas gardée. Renvoie le chemin de la sauvegarde gardée, ou null.
 */
export function sauvegarder(db: DatabaseSync, motif?: keyof typeof MOTIFS): string | null {
  mkdirSync(DOSSIER_SAUVEGARDES, { recursive: true });
  const precedente = listerSauvegardes()[0];
  let fichier = `${horodatage(new Date())}${motif ? `_${motif}` : ""}.db`;
  // Deux copies dans la même seconde : on ajoute une seconde au nom.
  for (let decalage = 1; existsSync(join(DOSSIER_SAUVEGARDES, fichier)); decalage++) {
    fichier = `${horodatage(new Date(Date.now() + decalage * 1000))}${motif ? `_${motif}` : ""}.db`;
  }
  const chemin = join(DOSSIER_SAUVEGARDES, fichier);
  copierBase(db, chemin);
  // Une sauvegarde « avant … » est toujours gardée : elle a un sens à part.
  if (!motif && precedente && !precedente.motif && memesOctets(chemin, precedente.chemin)) {
    unlinkSync(chemin);
    return null;
  }
  elaguer(db);
  return chemin;
}

function memesOctets(a: string, b: string): boolean {
  return statSync(a).size === statSync(b).size && readFileSync(a).equals(readFileSync(b));
}

/**
 * Ne garde que les 20 sauvegardes les plus récentes, puis vide de la corbeille les images
 * dont plus aucune sauvegarde (ni la partie en cours) n'a besoin.
 */
function elaguer(db: DatabaseSync): void {
  const liste = listerSauvegardes();
  for (const vieille of liste.slice(SAUVEGARDES_GARDEES)) unlinkSync(vieille.chemin);
  if (!existsSync(DOSSIER_CORBEILLE)) return;
  const utiles = new Set(fichiersImages(db));
  for (const s of liste.slice(0, SAUVEGARDES_GARDEES)) {
    try {
      const copie = new DatabaseSync(s.chemin, { readOnly: true });
      try {
        for (const f of fichiersImages(copie)) utiles.add(f);
      } finally {
        copie.close();
      }
    } catch {
      return; // Sauvegarde illisible : prudence, on ne vide rien.
    }
  }
  for (const f of readdirSync(DOSSIER_CORBEILLE)) {
    if (NOM_FICHIER_IMAGE.test(f) && !utiles.has(f)) unlinkSync(join(DOSSIER_CORBEILLE, f));
  }
}

/** Fichiers d'images cités par une base. */
export function fichiersImages(db: DatabaseSync): string[] {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'image'").get();
  if (!table) return [];
  return (db.prepare("SELECT fichier FROM image").all() as { fichier: string }[]).map((l) => l.fichier);
}

/** Image supprimée de la bibliothèque : mise de côté dans la corbeille. */
export function mettreALaCorbeille(fichier: string): void {
  mkdirSync(DOSSIER_CORBEILLE, { recursive: true });
  try {
    renameSync(join(DOSSIER_MEDIAS, fichier), join(DOSSIER_CORBEILLE, fichier));
  } catch {
    // Fichier déjà absent : rien à faire.
  }
}

/**
 * Après une restauration : remet dans data/medias/ les images de la corbeille dont la base
 * a besoin. Renvoie les fichiers encore introuvables.
 */
export function ressortirImages(db: DatabaseSync): string[] {
  mkdirSync(DOSSIER_MEDIAS, { recursive: true });
  const manquants: string[] = [];
  for (const f of fichiersImages(db)) {
    if (!NOM_FICHIER_IMAGE.test(f) || existsSync(join(DOSSIER_MEDIAS, f))) continue;
    const dansCorbeille = join(DOSSIER_CORBEILLE, f);
    if (existsSync(dansCorbeille)) renameSync(dansCorbeille, join(DOSSIER_MEDIAS, f));
    else manquants.push(f);
  }
  return manquants;
}

// ---------------------------------------------------------------------------
// Sauvegardes automatiques du serveur

const INTERVALLE = 30 * 60 * 1000;

function changements(db: DatabaseSync): number {
  return (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
}

/**
 * Sauvegarde au démarrage, puis toutes les 30 minutes si quelque chose a changé.
 * Renvoie la fonction à appeler à l'arrêt du serveur (dernière sauvegarde si besoin).
 */
export function demarrerSauvegardesAuto(db: DatabaseSync): () => void {
  let dernierEtat = -1;
  function tenter(): void {
    const n = changements(db);
    if (n === dernierEtat) return;
    try {
      sauvegarder(db);
      dernierEtat = n;
    } catch (erreur) {
      console.error("La sauvegarde automatique a échoué :", erreur);
    }
  }
  tenter();
  const minuteur = setInterval(tenter, INTERVALLE);
  minuteur.unref();
  return () => {
    clearInterval(minuteur);
    tenter();
  };
}
