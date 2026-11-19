// Les parties et leurs participants (MJ et joueurs).
// La partie principale (la plus ancienne) est créée au premier lancement.

import { base } from "./base.ts";
import { FORMAT_JETON, nouveauJeton } from "./jetons.ts";
import type { Role } from "../shared/messages.ts";

export interface Partie {
  id: number;
  nom: string;
}

export interface Participant {
  id: number;
  partieId: number;
  role: Role;
  jeton: string;
  nom: string | null;
  etiquette: string | null;
}

function maintenant(): string {
  return new Date().toISOString();
}

export function partieParId(id: number): Partie | undefined {
  return base.prepare("SELECT id, nom FROM partie WHERE id = ?").get(id) as Partie | undefined;
}

/** Renvoie la partie principale (la plus ancienne), en la créant (avec son MJ) s'il n'y en a aucune. */
export function partiePrincipale(): Partie {
  const existante = base.prepare("SELECT id, nom FROM partie ORDER BY id LIMIT 1").get() as
    | Partie
    | undefined;
  if (existante) return existante;

  const cree = base
    .prepare("INSERT INTO partie (nom, cree_le) VALUES (?, ?) RETURNING id, nom")
    .get("Brumeland", maintenant()) as unknown as Partie;
  base
    .prepare(
      "INSERT INTO participant (partie_id, role, jeton, nom, cree_le) VALUES (?, 'mj', ?, ?, ?)",
    )
    .run(cree.id, nouveauJeton(), "Meneur de jeu", maintenant());
  return cree;
}

const COLONNES = "id, partie_id AS partieId, role, jeton, nom, etiquette";

/**
 * Participant d'après le jeton de son lien. Un lien court est reconnu même tapé en majuscules
 * ou sans tirets ; un ancien lien long (d'avant les liens courts) marche toujours.
 */
export function participantParJeton(jeton: string): Participant | undefined {
  const court = jeton.toLowerCase().replaceAll("-", "").replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3");
  if (FORMAT_JETON.test(court)) {
    return base.prepare(`SELECT ${COLONNES} FROM participant WHERE jeton = ?`).get(court) as
      | Participant
      | undefined;
  }
  return base.prepare(`SELECT ${COLONNES} FROM participant WHERE ancien_jeton = ?`).get(jeton) as
    | Participant
    | undefined;
}

export function jetonMj(partieId: number): string {
  const ligne = base
    .prepare("SELECT jeton FROM participant WHERE partie_id = ? AND role = 'mj' LIMIT 1")
    .get(partieId) as { jeton: string };
  return ligne.jeton;
}

export function noterVisite(participantId: number): void {
  base
    .prepare("UPDATE participant SET derniere_visite = ? WHERE id = ?")
    .run(maintenant(), participantId);
}

// ---------------------------------------------------------------------------
// Invitations des joueurs (étape 1.3)

export interface LigneInvitation {
  id: number;
  etiquette: string | null;
  nom: string | null;
  jeton: string;
  dejaVenu: boolean;
}

export function listerInvitations(partieId: number): LigneInvitation[] {
  const lignes = base
    .prepare(
      `SELECT id, etiquette, nom, jeton, derniere_visite IS NOT NULL AS dejaVenu
       FROM participant WHERE partie_id = ? AND role = 'joueur' ORDER BY ordre, id`,
    )
    .all(partieId) as unknown as (Omit<LigneInvitation, "dejaVenu"> & { dejaVenu: number })[];
  return lignes.map((l) => ({ ...l, dejaVenu: l.dejaVenu === 1 }));
}

export function creerInvitation(partieId: number, etiquette: string | null): number {
  const { id } = base
    .prepare(
      `INSERT INTO participant (partie_id, role, jeton, etiquette, cree_le, ordre)
       VALUES (?, 'joueur', ?, ?, ?, (SELECT coalesce(max(ordre), 0) + 1 FROM participant WHERE partie_id = ?))
       RETURNING id`,
    )
    .get(partieId, nouveauJeton(), etiquette, maintenant(), partieId) as { id: number };
  return id;
}

/** Nouvel ordre des invitations (tous les identifiants de joueurs, du haut vers le bas). Renvoie false si la liste ne correspond pas. */
export function ordonnerInvitations(partieId: number, ids: number[]): boolean {
  const existants = (
    base.prepare("SELECT id FROM participant WHERE partie_id = ? AND role = 'joueur'").all(partieId) as { id: number }[]
  ).map((p) => p.id);
  const memeListe = ids.length === existants.length && new Set(ids).size === ids.length && ids.every((id) => existants.includes(id));
  if (!memeListe) return false;
  base.exec("BEGIN");
  try {
    const maj = base.prepare("UPDATE participant SET ordre = ? WHERE id = ?");
    ids.forEach((id, rang) => maj.run(rang + 1, id));
    base.exec("COMMIT");
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
  return true;
}

/** Supprime une invitation de joueur. Renvoie false si elle n'existe pas. Le MJ ne peut pas être supprimé. */
export function supprimerInvitation(partieId: number, id: number): boolean {
  const resultat = base
    .prepare("DELETE FROM participant WHERE id = ? AND partie_id = ? AND role = 'joueur'")
    .run(id, partieId);
  return resultat.changes > 0;
}

// ---------------------------------------------------------------------------
// Nom des joueurs (étape 1.4)

/** Vrai si un autre participant de la partie porte déjà ce nom (sans tenir compte des majuscules). */
export function nomDejaPris(partieId: number, nom: string, saufId: number): boolean {
  // Comparaison faite ici plutôt qu'en SQL : lower() de SQLite ignore les lettres accentuées.
  const cle = (texte: string) => texte.toLocaleLowerCase("fr");
  const noms = base
    .prepare("SELECT nom FROM participant WHERE partie_id = ? AND id <> ? AND nom IS NOT NULL")
    .all(partieId, saufId) as { nom: string }[];
  return noms.some((ligne) => cle(ligne.nom) === cle(nom));
}

export function changerNom(participantId: number, nom: string): void {
  base.prepare("UPDATE participant SET nom = ? WHERE id = ?").run(nom, participantId);
}

// ---------------------------------------------------------------------------
// Liste des participants (étape 1.5)

export interface LigneParticipant {
  id: number;
  role: Role;
  nom: string | null;
}

/** Tous les participants de la partie : le MJ d'abord, puis les joueurs dans l'ordre d'invitation. */
export function listerParticipants(partieId: number): LigneParticipant[] {
  return base
    .prepare(
      `SELECT id, role, nom FROM participant WHERE partie_id = ?
       ORDER BY role = 'joueur', id`,
    )
    .all(partieId) as unknown as LigneParticipant[];
}
