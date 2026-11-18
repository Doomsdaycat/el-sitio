// Brouillard de guerre : zones d'une scène immersive que le MJ révèle à la main, case par case.
// Partagé entre le serveur (qui enregistre et filtre ce que voient les joueurs) et l'interface.

import type { Case, Pion } from "./carte.ts";

export interface Brouillard {
  /** Brouillard activé sur cette scène. */
  actif: boolean;
  /** Cases révélées, sous la forme « colonne,ligne ». */
  reveles: string[];
}

export const BROUILLARD_VIDE: Brouillard = { actif: false, reveles: [] };

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
export function visibleDansBrouillard(p: Pick<Pion, "col" | "lig" | "taille">, b: Brouillard | undefined): boolean {
  if (!b?.actif) return true;
  const reveles = new Set(b.reveles);
  return casesDuPion(p).some((c) => reveles.has(cleCase(c)));
}
