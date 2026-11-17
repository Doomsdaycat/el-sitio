// Scènes et images : définitions partagées entre le serveur et l'interface.
//
// - Une image est un fichier de la bibliothèque du MJ (déposé une fois).
// - Une scène a un nom, un type et une image ; une même image peut servir à plusieurs scènes.
// - Une seule scène est montrée à tous à la fois.
// La grille est liée à l'image (alignée une fois), les pions à la scène.

import type { Grille, Pion } from "./carte.ts";

/** Taille maximale d'une image déposée par le MJ. */
export const IMAGE_TAILLE_MAX = 30 * 1024 * 1024;
export const IMAGE_NOM_MAX = 60;
export const SCENE_NOM_MAX = 60;
export const FORMATS_IMAGE = "JPG, PNG, WebP ou GIF";

/** Une image de la bibliothèque du MJ. */
export interface ImageBibliotheque {
  id: string;
  nom: string;
  type: string;
  taille: number;
  creeLe: string;
  /** Noms des scènes qui utilisent cette image. */
  scenes: string[];
}

export type TypeScene = "illustration" | "immersive";

export const TYPES_SCENE: { id: TypeScene; nom: string; aide: string }[] = [
  { id: "illustration", nom: "Illustration", aide: "Une image en grand, que chacun peut zoomer." },
  { id: "immersive", nom: "Immersive", aide: "Une carte avec grille, pions, règle et pointeur." },
];

/** Une scène, avec tout ce qu'il faut pour l'afficher. */
export interface Scene {
  id: string;
  nom: string;
  type: TypeScene;
  image: { id: string; nom: string };
  /** Grille de l'image (utile pour une scène immersive). */
  grille: Grille;
  /** Pions de la scène (scène immersive). */
  pions: Pion[];
}

/** Adresse d'une image (servie par le serveur). */
export const urlImage = (id: string): string => `/api/images/${id}`;
