// Reconnaissance des images déposées : fonctions sans accès à la base (testables seules).

import { IMAGE_NOM_MAX } from "../shared/scenes.ts";

/**
 * Reconnaît le format d'après les premiers octets du fichier (on ne se fie pas au nom).
 * Renvoie le type et l'extension, ou null si ce n'est pas une image acceptée.
 */
export function reconnaitreImage(octets: Buffer): { type: string; extension: string } | null {
  const debut = (n: number) => octets.subarray(0, n);
  if (octets.length >= 3 && debut(3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { type: "image/jpeg", extension: "jpg" };
  }
  if (debut(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: "image/png", extension: "png" };
  }
  const ascii = octets.subarray(0, 12).toString("latin1");
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) {
    return { type: "image/gif", extension: "gif" };
  }
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return { type: "image/webp", extension: "webp" };
  }
  return null;
}

/** Nom lisible à partir du nom du fichier : sans extension, espaces nettoyés. */
export function nomDepuisFichier(nomFichier: string): string {
  const sansExtension = nomFichier.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const propre = sansExtension.normalize("NFC").replace(/[_\s]+/g, " ").trim();
  return (propre || "Image").slice(0, IMAGE_NOM_MAX);
}
