// Noms affichés dans le journal : celui du personnage s'il est noté sur sa fiche,
// sinon celui du joueur (enregistré avec le jet).

import type { Fiche } from "../../shared/fiche.ts";
import type { EntreeJournal } from "../../shared/jets.ts";

export function nomPersonnage(fiches: Fiche[] | null, joueurId: number, defaut: string): string {
  const nom = fiches?.find((f) => f.joueurId === joueurId)?.nomPersonnage.trim();
  return nom || defaut;
}

/** Auteur d'un jet : le personnage du joueur, ou le MJ. */
export function nomAuteur(entree: EntreeJournal, fiches: Fiche[] | null): string {
  if (entree.auteurRole === "mj") return entree.auteurNom;
  return nomPersonnage(fiches, entree.auteurId, entree.auteurNom);
}

/** Personnage pour qui le MJ a lancé, s'il y en a un. */
export function nomPour(entree: EntreeJournal, fiches: Fiche[] | null): string | null {
  if (entree.pourId === null) return null;
  return nomPersonnage(fiches, entree.pourId, entree.pourNom ?? "?");
}

/** Camp d'un jet dans une opposition : le personnage concerné, ou « le MJ » pour un PNJ. */
export function nomCampAffiche(entree: EntreeJournal, fiches: Fiche[] | null): string {
  const pour = nomPour(entree, fiches);
  if (pour) return pour;
  return entree.auteurRole === "mj" ? "le MJ" : nomAuteur(entree, fiches);
}
