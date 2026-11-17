// Scènes et images : définitions partagées entre le serveur et l'interface.

/** Taille maximale d'une image déposée par le MJ. */
export const IMAGE_TAILLE_MAX = 30 * 1024 * 1024;
export const IMAGE_NOM_MAX = 60;
export const FORMATS_IMAGE = "JPG, PNG, WebP ou GIF";

/** Une image de la bibliothèque du MJ. */
export interface ImageBibliotheque {
  id: string;
  nom: string;
  type: string;
  taille: number;
  creeLe: string;
}

/** Ce que tout le monde voit : l'image montrée par le MJ, ou rien. */
export interface Scene {
  image: { id: string; nom: string } | null;
}

/** Adresse d'une image (servie par le serveur). */
export const urlImage = (id: string): string => `/api/images/${id}`;
