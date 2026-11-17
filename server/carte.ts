// Carte de combat : image choisie par le MJ, grille, pions ; règle et pointeur partagés.
// Les pions et la grille sont enregistrés ; la règle et le pointeur sont éphémères (non enregistrés).

import { randomBytes } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  CASE_MAX,
  COULEUR_PNJ,
  COULEURS_PIONS,
  COULEURS_PJ,
  GRILLE_PAR_DEFAUT,
  NOM_PION_MAX,
  normaliserDecalage,
  TAILLE_CASE_MAX,
  TAILLE_CASE_MIN,
  type Case,
  type EtatCarte,
  type Grille,
  type Pion,
} from "../shared/carte.ts";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import { base } from "./base.ts";
import type { Participant } from "./partie.ts";

interface DonneesSocket {
  participant: Participant;
}
type Io = Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;
type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

// ---------------------------------------------------------------------------
// Base de données

function imageCarte(partieId: number): { id: string; nom: string; grille: string | null } | undefined {
  return base
    .prepare(
      `SELECT image.id, image.nom, image.grille FROM partie JOIN image ON image.id = partie.carte_image_id
       WHERE partie.id = ?`,
    )
    .get(partieId) as { id: string; nom: string; grille: string | null } | undefined;
}

function lireGrille(brute: string | null): Grille {
  if (!brute) return { ...GRILLE_PAR_DEFAUT };
  try {
    return { ...GRILLE_PAR_DEFAUT, ...(JSON.parse(brute) as Partial<Grille>) };
  } catch {
    return { ...GRILLE_PAR_DEFAUT };
  }
}

interface LignePion {
  id: string;
  type: "pj" | "pnj";
  joueurId: number | null;
  nom: string;
  couleur: string;
  taille: number;
  col: number;
  lig: number;
}

function pionsDe(partieId: number, imageId: string): Pion[] {
  const lignes = base
    .prepare(
      `SELECT id, type, joueur_id AS joueurId, nom, couleur, taille, col, lig FROM pion
       WHERE partie_id = ? AND image_id = ? ORDER BY type, rowid`,
    )
    .all(partieId, imageId) as unknown as LignePion[];
  return lignes.map((l) => ({ ...l, taille: l.taille as 1 | 2 | 3 }));
}

/**
 * Chaque joueur qui a choisi son nom a un pion sur la carte active.
 * Les nouveaux pions sont posés sur la première ligne, dans des cases libres.
 */
export function assurerPionsPj(partieId: number): void {
  const carte = imageCarte(partieId);
  if (!carte) return;
  const joueurs = base
    .prepare("SELECT id FROM participant WHERE partie_id = ? AND role = 'joueur' AND nom IS NOT NULL ORDER BY id")
    .all(partieId) as { id: number }[];
  const pions = pionsDe(partieId, carte.id);
  const occupees = new Set(pions.map((p) => `${p.col},${p.lig}`));
  joueurs.forEach((j, rang) => {
    if (pions.some((p) => p.joueurId === j.id)) return;
    let col = 0;
    while (occupees.has(`${col},0`)) col++;
    occupees.add(`${col},0`);
    base
      .prepare(
        `INSERT INTO pion (id, partie_id, image_id, type, joueur_id, nom, couleur, taille, col, lig)
         VALUES (?, ?, ?, 'pj', ?, '', ?, 1, ?, 0)`,
      )
      .run(randomBytes(8).toString("hex"), partieId, carte.id, j.id, COULEURS_PJ[rang % COULEURS_PJ.length], col);
  });
}

export function etatCarte(partieId: number): EtatCarte {
  const carte = imageCarte(partieId);
  if (!carte) return { image: null, grille: { ...GRILLE_PAR_DEFAUT }, pions: [] };
  return {
    image: { id: carte.id, nom: carte.nom },
    grille: lireGrille(carte.grille),
    pions: pionsDe(partieId, carte.id),
  };
}

// ---------------------------------------------------------------------------
// Diffusions

export function diffuserCarte(io: Io, partieId: number): void {
  io.emit("carte", etatCarte(partieId));
}

export function envoyerCarte(socket: SocketBrumeland, partieId: number): void {
  socket.emit("carte", etatCarte(partieId));
}

/** Appelé quand un joueur choisit son nom : son pion apparaît sur la carte active. */
export function apresNouveauJoueur(io: Io, partieId: number): void {
  if (!imageCarte(partieId)) return;
  assurerPionsPj(partieId);
  diffuserCarte(io, partieId);
}

/** Appelé quand une image est supprimée de la bibliothèque. */
export function apresSuppressionImage(io: Io, partieId: number, imageId: string): void {
  const partie = base.prepare("SELECT carte_image_id AS id FROM partie WHERE id = ?").get(partieId) as {
    id: string | null;
  };
  if (partie.id === imageId) {
    base.prepare("UPDATE partie SET carte_image_id = NULL WHERE id = ?").run(partieId);
    diffuserCarte(io, partieId);
  }
}

// ---------------------------------------------------------------------------
// Vérifications

const estEntier = (n: unknown, min: number, max: number): n is number =>
  Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

function lireCase(d: unknown): Case | null {
  const c = d as Case | null;
  return c && estEntier(c.col, 0, CASE_MAX) && estEntier(c.lig, 0, CASE_MAX) ? { col: c.col, lig: c.lig } : null;
}

const fini = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Commandes

export function brancherCarte(io: Io, socket: SocketBrumeland, partieId: number): void {
  const moi = () => socket.data.participant;
  const estMj = () => moi().role === "mj";

  function proteger<D>(action: (d: D) => Reponse, reserveMj = false) {
    return (d: D, reponse: (r: Reponse) => void) => {
      if (typeof reponse !== "function") return;
      if (reserveMj && !estMj()) {
        reponse({ ok: false, erreur: "Action réservée au meneur de jeu." });
        return;
      }
      try {
        reponse(action(d));
      } catch (erreur) {
        console.error(erreur);
        reponse({ ok: false, erreur: "Erreur inattendue sur le serveur." });
      }
    };
  }

  socket.on(
    "mj:choisirCarte",
    proteger((d: { id: string | null }) => {
      if (d?.id === null) {
        base.prepare("UPDATE partie SET carte_image_id = NULL WHERE id = ?").run(partieId);
      } else {
        const existe = typeof d?.id === "string" &&
          base.prepare("SELECT 1 FROM image WHERE partie_id = ? AND id = ?").get(partieId, d.id);
        if (!existe) return { ok: false, erreur: "Cette image n'existe plus." };
        base.prepare("UPDATE partie SET carte_image_id = ? WHERE id = ?").run(d.id, partieId);
        assurerPionsPj(partieId);
      }
      diffuserCarte(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "mj:grille",
    proteger((d: Grille) => {
      const carte = imageCarte(partieId);
      if (!carte) return { ok: false, erreur: "Aucune carte n'est choisie." };
      if (!fini(d?.taille) || d.taille < TAILLE_CASE_MIN || d.taille > TAILLE_CASE_MAX) {
        return { ok: false, erreur: `Taille d'une case : de ${TAILLE_CASE_MIN} à ${TAILLE_CASE_MAX} pixels.` };
      }
      if (!fini(d.decalageX) || !fini(d.decalageY)) return { ok: false, erreur: "Décalage invalide." };
      const taille = Math.round(d.taille * 10) / 10;
      const grille: Grille = {
        taille,
        decalageX: Math.round(normaliserDecalage(d.decalageX, taille) * 10) / 10,
        decalageY: Math.round(normaliserDecalage(d.decalageY, taille) * 10) / 10,
        visible: d.visible !== false,
      };
      base.prepare("UPDATE image SET grille = ? WHERE id = ?").run(JSON.stringify(grille), carte.id);
      diffuserCarte(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "mj:ajouterPion",
    proteger((d: { nom: string; couleur: string; taille: number; col: number; lig: number }) => {
      const carte = imageCarte(partieId);
      if (!carte) return { ok: false, erreur: "Aucune carte n'est choisie." };
      const nom = typeof d?.nom === "string" ? d.nom.normalize("NFC").replace(/\s+/g, " ").trim() : "";
      if (nom === "") return { ok: false, erreur: "Donne un nom au pion." };
      if (nom.length > NOM_PION_MAX) return { ok: false, erreur: `${NOM_PION_MAX} caractères au plus.` };
      const couleur = COULEURS_PIONS.some((c) => c.id === d.couleur) ? d.couleur : COULEUR_PNJ;
      if (![1, 2, 3].includes(d.taille)) return { ok: false, erreur: "Taille : 1, 2 ou 3 cases." };
      const position = lireCase(d) ?? { col: 0, lig: 0 };
      base
        .prepare(
          `INSERT INTO pion (id, partie_id, image_id, type, joueur_id, nom, couleur, taille, col, lig)
           VALUES (?, ?, ?, 'pnj', NULL, ?, ?, ?, ?, ?)`,
        )
        .run(randomBytes(8).toString("hex"), partieId, carte.id, nom, couleur, d.taille, position.col, position.lig);
      diffuserCarte(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "mj:retirerPion",
    proteger((d: { id: string }) => {
      const r = base
        .prepare("DELETE FROM pion WHERE partie_id = ? AND id = ? AND type = 'pnj'")
        .run(partieId, String(d?.id));
      if (r.changes === 0) {
        return { ok: false, erreur: "Ce pion n'existe plus (les pions de personnages joueurs restent)." };
      }
      diffuserCarte(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "carte:deplacerPion",
    proteger((d: { id: string; col: number; lig: number }) => {
      const carte = imageCarte(partieId);
      const pion = carte ? pionsDe(partieId, carte.id).find((p) => p.id === d?.id) : undefined;
      if (!pion) return { ok: false, erreur: "Ce pion n'existe plus." };
      // Un joueur ne déplace que son propre pion ; le MJ peut tout déplacer.
      if (!estMj() && pion.joueurId !== moi().id) {
        return { ok: false, erreur: "Tu ne peux déplacer que le pion de ton personnage." };
      }
      const position = lireCase(d);
      if (!position) return { ok: false, erreur: "Case invalide." };
      base.prepare("UPDATE pion SET col = ?, lig = ? WHERE id = ?").run(position.col, position.lig, pion.id);
      diffuserCarte(io, partieId);
      return { ok: true };
    }),
  );

  // Règle et pointeur : transmis tels quels aux autres, sans enregistrement.
  socket.on("carte:regle", (d) => {
    const de = lireCase(d?.de);
    const a = lireCase(d?.a);
    socket.broadcast.emit("carte:regle", {
      auteurId: moi().id,
      auteur: moi().nom ?? "Meneur de jeu",
      mesure: de && a ? { de, a } : null,
    });
  });

  socket.on("carte:pointeur", (d) => {
    if (!fini(d?.x) || !fini(d?.y)) return;
    socket.broadcast.emit("carte:pointeur", {
      auteurId: moi().id,
      auteur: moi().nom ?? "Meneur de jeu",
      x: d.x,
      y: d.y,
    });
  });
}
