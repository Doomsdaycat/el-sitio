// Emplacement des données de la partie, tout dans un même dossier (data/ par défaut) :
// la base, les images, la corbeille des images supprimées et les sauvegardes.
// Ce module n'ouvre pas la base : la commande de restauration peut l'utiliser serveur arrêté.

import { dirname, join, resolve } from "node:path";

export const CHEMIN_BASE = resolve(process.env.BRUMELAND_BASE ?? "data/brumeland.db");
export const DOSSIER_DONNEES = dirname(CHEMIN_BASE);
export const DOSSIER_MEDIAS = join(DOSSIER_DONNEES, "medias");
/** Images supprimées de la bibliothèque : gardées pour que les anciennes sauvegardes restent complètes. */
export const DOSSIER_CORBEILLE = join(DOSSIER_DONNEES, "corbeille");
export const DOSSIER_SAUVEGARDES = join(DOSSIER_DONNEES, "sauvegardes");
/** Numéro du processus serveur, présent tant qu'il tourne. */
export const FICHIER_PID = join(DOSSIER_DONNEES, "serveur.pid");

/** Nom de fichier d'image tel que le serveur les crée (identifiant aléatoire + extension). */
export const NOM_FICHIER_IMAGE = /^[0-9a-f]{32}\.(jpg|png|webp|gif)$/;
