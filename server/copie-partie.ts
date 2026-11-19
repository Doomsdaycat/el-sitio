// Copie d'une partie, d'une base vers une autre (ou vers la même base) : sert à
// « Dupliquer la partie » et à l'import d'une partie depuis un export.
// Tout est recopié avec de nouveaux numéros : invitations, fiches, journal, scènes, pions,
// brouillard, combat en cours. Les deux bases doivent être au même niveau (migrerBase).
// Ce module n'ouvre aucune base lui-même.

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Combat } from "../shared/combat.ts";
import { nouveauJeton } from "./jetons.ts";

export interface OptionsCopie {
  /** Nom de la nouvelle partie. */
  nom: string;
  /**
   * « nouveaux » : nouveaux liens pour tous (copie sur le même serveur) ;
   * « garder » : mêmes liens qu'avant, sauf ceux déjà utilisés sur ce serveur.
   */
  liens: "nouveaux" | "garder";
  /** Copier aussi les images de la bibliothèque utilisées par les scènes (autre base). */
  images: boolean;
}

export interface BilanCopie {
  partieId: number;
  /** Faux si au moins un lien a dû être changé (déjà utilisé sur ce serveur). */
  liensGardes: boolean;
}

type Ligne = Record<string, unknown>;

function colonnes(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

/** Insère une ligne (seules les colonnes connues de la table d'arrivée), renvoie son rowid. */
function inserer(db: DatabaseSync, table: string, ligne: Ligne, connues: string[]): number {
  const cles = Object.keys(ligne).filter((c) => connues.includes(c));
  const r = db
    .prepare(`INSERT INTO ${table} (${cles.join(", ")}) VALUES (${cles.map(() => "?").join(", ")})`)
    .run(...(cles.map((c) => ligne[c]) as (string | number | null)[]));
  return Number(r.lastInsertRowid);
}

const idTexte = (octets: number) => randomBytes(octets).toString("hex");

/** Copie la partie n° partieId de « source » dans « destination ». */
export function copierPartie(
  source: DatabaseSync,
  partieId: number,
  destination: DatabaseSync,
  options: OptionsCopie,
): BilanCopie {
  const partie = source.prepare("SELECT * FROM partie WHERE id = ?").get(partieId) as Ligne | undefined;
  if (!partie) throw new Error(`Partie n° ${partieId} introuvable`);
  const lire = (table: string, ordre = "rowid") =>
    source.prepare(`SELECT * FROM ${table} WHERE partie_id = ? ORDER BY ${ordre}`).all(partieId) as Ligne[];
  // Lectures faites d'abord : la source peut être la même base que la destination.
  const participants = lire("participant", "id");
  const personnages = lire("personnage");
  const scenes = lire("scene");
  const pions = lire("pion");
  const jets = lire("jet", "id");
  const images = options.images
    ? (source
        .prepare("SELECT * FROM image WHERE id IN (SELECT image_id FROM scene WHERE partie_id = ?)")
        .all(partieId) as Ligne[])
    : [];

  const cols = (table: string) => colonnes(destination, table);
  const jetonPris = destination.prepare("SELECT 1 FROM participant WHERE jeton = ? OR ancien_jeton = ?");
  const maintenant = new Date().toISOString();

  destination.exec("BEGIN");
  try {
    // La partie (scène montrée et combat recopiés à la fin, une fois les numéros connus).
    const { id: _id, scene_active_id: _scene, combat: _combat, ...restePartie } = partie;
    const nouvellePartie = inserer(destination, "partie", { ...restePartie, nom: options.nom, cree_le: maintenant }, cols("partie"));

    // Invitations (MJ et joueurs).
    const participantsMap = new Map<number, number>();
    let liensGardes = true;
    for (const p of participants) {
      const garder = options.liens === "garder" && !jetonPris.get(p.jeton as string, p.jeton as string);
      if (options.liens === "garder" && !garder) liensGardes = false;
      const { id, ...reste } = p;
      const nouveau = inserer(
        destination,
        "participant",
        {
          ...reste,
          partie_id: nouvellePartie,
          jeton: garder ? p.jeton : nouveauJeton(),
          // Ancien lien long (d'avant les liens courts) : gardé lui aussi s'il est libre.
          ancien_jeton:
            garder && typeof p.ancien_jeton === "string" && !jetonPris.get(p.ancien_jeton, p.ancien_jeton) ? p.ancien_jeton : null,
          // Copie sur le même serveur : personne n'est encore venu par ces nouveaux liens.
          derniere_visite: options.liens === "nouveaux" ? null : p.derniere_visite,
        },
        cols("participant"),
      );
      participantsMap.set(id as number, nouveau);
    }
    const joueur = (id: unknown) => (typeof id === "number" ? (participantsMap.get(id) ?? null) : null);

    // Fiches de personnage.
    for (const f of personnages) {
      const joueurId = joueur(f.joueur_id);
      if (joueurId === null) continue;
      const donnees = JSON.parse(f.donnees as string) as { joueurId?: number };
      inserer(
        destination,
        "personnage",
        { ...f, joueur_id: joueurId, partie_id: nouvellePartie, donnees: JSON.stringify({ ...donnees, joueurId }) },
        cols("personnage"),
      );
    }

    // Images (bibliothèque commune : seulement celles qui n'y sont pas déjà).
    const imageExiste = destination.prepare("SELECT 1 FROM image WHERE id = ?");
    for (const image of images) {
      if (!imageExiste.get(image.id as string)) inserer(destination, "image", image, cols("image"));
    }

    // Scènes et pions.
    const scenesMap = new Map<string, string>();
    for (const s of scenes) {
      const id = idTexte(16);
      scenesMap.set(s.id as string, id);
      inserer(destination, "scene", { ...s, id, partie_id: nouvellePartie }, cols("scene"));
    }
    const pionsMap = new Map<string, string>();
    for (const p of pions) {
      const sceneId = scenesMap.get(p.scene_id as string);
      if (!sceneId) continue;
      if (p.joueur_id !== null && joueur(p.joueur_id) === null) continue;
      const id = idTexte(8);
      pionsMap.set(p.id as string, id);
      inserer(
        destination,
        "pion",
        { ...p, id, partie_id: nouvellePartie, scene_id: sceneId, joueur_id: joueur(p.joueur_id) },
        cols("pion"),
      );
    }

    // Journal des jets (dans l'ordre : un jet ne renvoie qu'à des jets plus anciens).
    const jetsMap = new Map<number, number>();
    for (const j of jets) {
      const { id, ...reste } = j;
      const vers = (ancien: unknown) => (typeof ancien === "number" ? (jetsMap.get(ancien) ?? null) : null);
      const nouveau = inserer(
        destination,
        "jet",
        {
          ...reste,
          partie_id: nouvellePartie,
          auteur_id: joueur(j.auteur_id) ?? 0,
          pour_id: joueur(j.pour_id),
          force_de: vers(j.force_de),
          oppose_a: vers(j.oppose_a),
        },
        cols("jet"),
      );
      jetsMap.set(id as number, nouveau);
    }

    // Scène montrée et combat en cours, avec les nouveaux numéros.
    const sceneActive = typeof partie.scene_active_id === "string" ? (scenesMap.get(partie.scene_active_id) ?? null) : null;
    let combat: string | null = null;
    if (typeof partie.combat === "string") {
      const c = JSON.parse(partie.combat) as Combat;
      const traces = Object.fromEntries(
        Object.entries(c.traces ?? {}).flatMap(([pionId, t]) => (pionsMap.has(pionId) ? [[pionsMap.get(pionId)!, t]] : [])),
      );
      combat = JSON.stringify({
        ...c,
        traces,
        combattants: c.combattants.map((x) => ({
          ...x,
          joueurId: x.joueurId === null ? null : joueur(x.joueurId),
          pionId: x.pionId === null ? null : (pionsMap.get(x.pionId) ?? null),
        })),
      });
    }
    destination
      .prepare("UPDATE partie SET scene_active_id = ?, combat = ? WHERE id = ?")
      .run(sceneActive, combat, nouvellePartie);

    destination.exec("COMMIT");
    return { partieId: nouvellePartie, liensGardes };
  } catch (erreur) {
    destination.exec("ROLLBACK");
    throw erreur;
  }
}

/**
 * Nom libre : le nom tel quel s'il n'est pas pris, sinon « Nom (copie) », « Nom (copie 2) »…
 * (raccourci au besoin pour tenir en « longueurMax » caractères).
 */
export function nomLibre(nom: string, pris: (nom: string) => boolean, suffixe: string, longueurMax: number, tel = false): string {
  if (tel && !pris(nom)) return nom.slice(0, longueurMax);
  for (let n = 1; ; n++) {
    const fin = ` (${suffixe}${n > 1 ? ` ${n}` : ""})`;
    const candidat = `${nom.slice(0, longueurMax - fin.length).trimEnd()}${fin}`;
    if (!pris(candidat)) return candidat;
  }
}
