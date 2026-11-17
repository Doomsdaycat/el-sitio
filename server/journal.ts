// Journal des jets de dés, enregistré dans la base.

import { base } from "./base.ts";
import type { EntreeJournal, IdEtat, Resultat } from "../shared/jets.ts";
import type { Role } from "../shared/messages.ts";

/** Nombre de jets envoyés à l'arrivée sur la page. */
export const TAILLE_JOURNAL = 100;

interface LigneJet {
  id: number;
  auteurId: number;
  auteurNom: string;
  auteurRole: Role;
  creeLe: string;
  libelle: string | null;
  secret: number;
  revele: number;
  resultat: string;
  forceDe: number | null;
  etat: IdEtat | null;
  dejaForce: number;
  pourId: number | null;
  pourNom: string | null;
}

const COLONNES = `id, auteur_id AS auteurId, auteur_nom AS auteurNom, auteur_role AS auteurRole,
  cree_le AS creeLe, libelle, secret, revele, resultat, force_de AS forceDe, etat,
  deja_force AS dejaForce, pour_id AS pourId, pour_nom AS pourNom`;

/** Entrée complète, telle que le MJ la voit. */
function versEntree(ligne: LigneJet): EntreeJournal {
  return {
    id: ligne.id,
    auteurId: ligne.auteurId,
    auteurNom: ligne.auteurNom,
    auteurRole: ligne.auteurRole,
    creeLe: ligne.creeLe,
    libelle: ligne.libelle,
    pourId: ligne.pourId,
    pourNom: ligne.pourNom,
    secret: ligne.secret === 1,
    revele: ligne.revele === 1,
    resultat: JSON.parse(ligne.resultat) as Resultat,
    forceDe: ligne.forceDe,
    etat: ligne.etat,
    dejaForce: ligne.dejaForce === 1,
  };
}

/** Version vue par un joueur : un jet secret non révélé ne montre ni libellé ni résultat. */
export function vuePourJoueur(entree: EntreeJournal): EntreeJournal {
  if (!entree.secret || entree.revele) return entree;
  return { ...entree, libelle: null, resultat: null };
}

export interface NouveauJet {
  partieId: number;
  auteurId: number;
  auteurNom: string;
  auteurRole: Role;
  libelle: string | null;
  secret: boolean;
  resultat: Resultat;
  forceDe?: number;
  etat?: IdEtat;
  pourId?: number | null;
  pourNom?: string | null;
}

export function enregistrerJet(jet: NouveauJet): EntreeJournal {
  const ligne = base
    .prepare(
      `INSERT INTO jet (partie_id, auteur_id, auteur_nom, auteur_role, cree_le, libelle, secret,
         resultat, force_de, etat, pour_id, pour_nom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLONNES}`,
    )
    .get(
      jet.partieId,
      jet.auteurId,
      jet.auteurNom,
      jet.auteurRole,
      new Date().toISOString(),
      jet.libelle,
      jet.secret ? 1 : 0,
      JSON.stringify(jet.resultat),
      jet.forceDe ?? null,
      jet.etat ?? null,
      jet.pourId ?? null,
      jet.pourNom ?? null,
    ) as unknown as LigneJet;
  return versEntree(ligne);
}

export function trouverJet(partieId: number, id: number): EntreeJournal | undefined {
  const ligne = base
    .prepare(`SELECT ${COLONNES} FROM jet WHERE partie_id = ? AND id = ?`)
    .get(partieId, id) as unknown as LigneJet | undefined;
  return ligne && versEntree(ligne);
}

/** Les derniers jets, du plus ancien au plus récent. */
export function derniersJets(partieId: number, limite = TAILLE_JOURNAL): EntreeJournal[] {
  const lignes = base
    .prepare(`SELECT ${COLONNES} FROM jet WHERE partie_id = ? ORDER BY id DESC LIMIT ?`)
    .all(partieId, limite) as unknown as LigneJet[];
  return lignes.reverse().map(versEntree);
}

/**
 * Marque un jet comme « chance déjà forcée ». Renvoie false si c'était déjà fait :
 * cela empêche deux clics rapides de produire deux nouvelles tentatives.
 */
export function marquerForce(partieId: number, id: number): boolean {
  const r = base
    .prepare("UPDATE jet SET deja_force = 1 WHERE partie_id = ? AND id = ? AND deja_force = 0")
    .run(partieId, id);
  return r.changes > 0;
}

export function revelerJet(partieId: number, id: number): boolean {
  const r = base
    .prepare("UPDATE jet SET revele = 1 WHERE partie_id = ? AND id = ? AND secret = 1 AND revele = 0")
    .run(partieId, id);
  return r.changes > 0;
}

export function viderJournal(partieId: number): void {
  base.prepare("DELETE FROM jet WHERE partie_id = ?").run(partieId);
}
