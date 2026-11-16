// La partie et ses participants (MJ et joueurs).
// Pour l'instant, il n'existe qu'une seule partie, créée au premier lancement.

import { randomBytes } from "node:crypto";
import { base } from "./base.ts";
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
}

/** Jeton d'invitation : 32 caractères aléatoires, impossibles à deviner. */
function nouveauJeton(): string {
  return randomBytes(24).toString("base64url");
}

function maintenant(): string {
  return new Date().toISOString();
}

/** Renvoie la partie, en la créant (avec son MJ) si elle n'existe pas encore. */
export function partieCourante(): Partie {
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

const COLONNES = "id, partie_id AS partieId, role, jeton, nom";

export function participantParJeton(jeton: string): Participant | undefined {
  return base.prepare(`SELECT ${COLONNES} FROM participant WHERE jeton = ?`).get(jeton) as
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
