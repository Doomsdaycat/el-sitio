// Fiches de personnage enregistrées dans la base (une par joueur).

import { base } from "./base.ts";
import { ficheVide, type Fiche } from "../shared/fiche.ts";

/**
 * Complète une fiche lue en base avec les valeurs par défaut :
 * une fiche enregistrée par une version plus ancienne reste lisible.
 */
function completer(joueurId: number, brute: Partial<Fiche>): Fiche {
  const vide = ficheVide(joueurId);
  return {
    ...vide,
    ...brute,
    joueurId,
    caracs: { ...vide.caracs, ...brute.caracs },
    textes: { ...vide.textes, ...brute.textes },
  };
}

export function lireFiche(partieId: number, joueurId: number): Fiche | undefined {
  const ligne = base
    .prepare("SELECT donnees FROM personnage WHERE partie_id = ? AND joueur_id = ?")
    .get(partieId, joueurId) as { donnees: string } | undefined;
  return ligne && completer(joueurId, JSON.parse(ligne.donnees) as Partial<Fiche>);
}

export function enregistrerFiche(partieId: number, fiche: Fiche): void {
  base
    .prepare(
      `INSERT INTO personnage (joueur_id, partie_id, donnees, maj_le) VALUES (?, ?, ?, ?)
       ON CONFLICT (joueur_id) DO UPDATE SET donnees = excluded.donnees, maj_le = excluded.maj_le`,
    )
    .run(fiche.joueurId, partieId, JSON.stringify(fiche), new Date().toISOString());
}

/** Crée une fiche vide pour ce joueur s'il n'en a pas encore. Renvoie sa fiche. */
export function ficheDuJoueur(partieId: number, joueurId: number): Fiche {
  const existante = lireFiche(partieId, joueurId);
  if (existante) return existante;
  const fiche = ficheVide(joueurId);
  enregistrerFiche(partieId, fiche);
  return fiche;
}

/**
 * Toutes les fiches de la partie, dans l'ordre des invitations.
 * Chaque joueur qui a choisi son nom en a une (créée au besoin).
 */
export function toutesLesFiches(partieId: number): Fiche[] {
  const joueurs = base
    .prepare(
      "SELECT id FROM participant WHERE partie_id = ? AND role = 'joueur' AND nom IS NOT NULL ORDER BY id",
    )
    .all(partieId) as { id: number }[];
  return joueurs.map((j) => ficheDuJoueur(partieId, j.id));
}
