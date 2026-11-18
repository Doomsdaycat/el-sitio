// Brouillard de guerre : zones d'une scène que le MJ révèle à la main.
// - Scène immersive : case par case, sur la grille.
// - Illustration (carte de ville, de région…) : au pinceau rond, façon jeu de stratégie.
// Partagé entre le serveur (qui enregistre et filtre ce que voient les joueurs) et l'interface.

import type { Case, Pion } from "./carte.ts";

/**
 * Coup de pinceau sur une illustration, en pixels de l'image : un disque révélé ou recouvert.
 * `tout` : tout révéler (ou tout recouvrir) d'un coup.
 */
export type TraitBrouillard = { x: number; y: number; r: number; reveler: boolean } | { tout: true; reveler: boolean };

export interface Brouillard {
  /** Brouillard activé sur cette scène. */
  actif: boolean;
  /** Scène immersive : cases révélées, sous la forme « colonne,ligne ». */
  reveles: string[];
  /** Illustration : coups de pinceau, dans l'ordre (le dernier l'emporte). */
  traits: TraitBrouillard[];
}

export const BROUILLARD_VIDE: Brouillard = { actif: false, reveles: [], traits: [] };

/** Nombre maximal de coups de pinceau envoyés en une fois, et gardés par illustration. */
export const TRAITS_PAR_ENVOI_MAX = 2_000;
export const TRAITS_MAX = 30_000;

/** Taille du pinceau rond : en proportion du plus grand côté de l'image. */
export const PINCEAU_MIN = 0.01;
export const PINCEAU_MAX = 0.2;

/** Ajoute des coups de pinceau ; « tout » efface l'historique (plus rien d'avant ne compte). */
export function ajouterTraits(traits: TraitBrouillard[], nouveaux: TraitBrouillard[]): TraitBrouillard[] {
  let resultat = [...traits];
  for (const t of nouveaux) resultat = "tout" in t ? [t] : [...resultat, t];
  return resultat;
}

/** Nombre maximal de cases modifiées en une fois, et de cases révélées par scène. */
export const CASES_PAR_ENVOI_MAX = 10_000;
export const CASES_REVELEES_MAX = 50_000;

export const cleCase = (c: Case): string => `${c.col},${c.lig}`;

/** Toutes les cases d'un rectangle tracé d'une case à une autre (dans n'importe quel sens). */
export function casesDuRectangle(a: Case, b: Case): Case[] {
  const cases: Case[] = [];
  for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) {
    for (let lig = Math.min(a.lig, b.lig); lig <= Math.max(a.lig, b.lig); lig++) cases.push({ col, lig });
  }
  return cases;
}

/** Cases occupées par un pion (1×1, 2×2 ou 3×3). */
export function casesDuPion(p: Pick<Pion, "col" | "lig" | "taille">): Case[] {
  return casesDuRectangle({ col: p.col, lig: p.lig }, { col: p.col + p.taille - 1, lig: p.lig + p.taille - 1 });
}

/** Révèle ou recouvre des cases ; renvoie la nouvelle liste (triée, sans doublon). */
export function modifierBrouillard(reveles: string[], cases: Case[], reveler: boolean): string[] {
  const ensemble = new Set(reveles);
  for (const c of cases) {
    if (reveler) ensemble.add(cleCase(c));
    else ensemble.delete(cleCase(c));
  }
  return [...ensemble].sort();
}

/**
 * Un pion est visible des joueurs s'il n'y a pas de brouillard, ou si au moins une de ses cases
 * est révélée. (Les pions des personnages joueurs restent toujours visibles : voir le serveur.)
 */
export function visibleDansBrouillard(
  p: Pick<Pion, "col" | "lig" | "taille">,
  b: Pick<Brouillard, "actif" | "reveles"> | undefined,
): boolean {
  if (!b?.actif) return true;
  const reveles = new Set(b.reveles);
  return casesDuPion(p).some((c) => reveles.has(cleCase(c)));
}
