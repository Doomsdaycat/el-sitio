// Scènes : création par le MJ, scène montrée à tous, pions (scènes immersives), grille,
// règle et pointeur. Les pions et la grille sont enregistrés ; la règle et le pointeur non.

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
  ETATS_PION,
  type EtatPion,
  type Grille,
  type Pion,
} from "../shared/carte.ts";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import { SCENE_NOM_MAX, vuePourJoueurs, type Scene, type TypeScene } from "../shared/scenes.ts";
import { base } from "./base.ts";
import { estSonTour } from "../shared/combat.ts";
import { annulerDansCombat, diffuserCombat, lireCombat, noterDeplacement } from "./combat.ts";
import { diffuserImages } from "./images.ts";
import type { Participant } from "./partie.ts";

interface DonneesSocket {
  participant: Participant;
}
type Io = Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;
type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

const SALLE_MJ = "mj";
const SALLE_JOUEURS = "joueurs";

// ---------------------------------------------------------------------------
// Mémoire des déplacements, pour pouvoir les annuler (le temps de la séance)

interface DeplacementMemorise {
  pionId: string;
  de: Case;
  a: Case;
  /** Round de combat pendant lequel il a eu lieu (null : hors combat). */
  round: number | null;
}

const MEMOIRE_MAX = 20;
/** Par participant : ses derniers déplacements, du plus ancien au plus récent. */
const memoireDeplacements = new Map<number, DeplacementMemorise[]>();

function memoriser(participantId: number, d: DeplacementMemorise): void {
  const liste = [...(memoireDeplacements.get(participantId) ?? []), d].slice(-MEMOIRE_MAX);
  memoireDeplacements.set(participantId, liste);
}

// ---------------------------------------------------------------------------
// Lecture

interface LigneScene {
  id: string;
  nom: string;
  type: TypeScene;
  imageId: string;
  imageNom: string;
  grille: string | null;
}

const SELECT_SCENE = `SELECT scene.id, scene.nom, scene.type, image.id AS imageId, image.nom AS imageNom,
  image.grille FROM scene JOIN image ON image.id = scene.image_id`;

function lireGrille(brute: string | null): Grille {
  if (!brute) return { ...GRILLE_PAR_DEFAUT };
  try {
    return { ...GRILLE_PAR_DEFAUT, ...(JSON.parse(brute) as Partial<Grille>) };
  } catch {
    return { ...GRILLE_PAR_DEFAUT };
  }
}

function pionsDe(sceneId: string): Pion[] {
  const lignes = base
    .prepare(
      `SELECT id, type, joueur_id AS joueurId, nom, couleur, taille, col, lig, etat, cache FROM pion
       WHERE scene_id = ? ORDER BY type, rowid`,
    )
    .all(sceneId) as unknown as (Omit<Pion, "taille" | "cache"> & { taille: number; cache: number })[];
  return lignes.map((l) => ({ ...l, taille: l.taille as 1 | 2 | 3, cache: l.cache === 1 }));
}

function versScene(l: LigneScene): Scene {
  return {
    id: l.id,
    nom: l.nom,
    type: l.type,
    image: { id: l.imageId, nom: l.imageNom },
    grille: lireGrille(l.grille),
    pions: l.type === "immersive" ? pionsDe(l.id) : [],
  };
}

function lireScene(partieId: number, id: string): Scene | undefined {
  const l = base.prepare(`${SELECT_SCENE} WHERE scene.partie_id = ? AND scene.id = ?`).get(partieId, id) as
    | LigneScene
    | undefined;
  return l && versScene(l);
}

export function toutesLesScenes(partieId: number): Scene[] {
  const lignes = base
    .prepare(`${SELECT_SCENE} WHERE scene.partie_id = ? ORDER BY scene.ordre, scene.cree_le DESC`)
    .all(partieId) as unknown as LigneScene[];
  return lignes.map(versScene);
}

export function sceneActive(partieId: number): Scene | null {
  const ligne = base.prepare("SELECT scene_active_id AS id FROM partie WHERE id = ?").get(partieId) as {
    id: string | null;
  };
  return (ligne.id && lireScene(partieId, ligne.id)) || null;
}

/** Noms des scènes qui utilisent une image (pour empêcher de supprimer une image utilisée). */
export function scenesUtilisant(partieId: number, imageId: string): string[] {
  const lignes = base
    .prepare("SELECT nom FROM scene WHERE partie_id = ? AND image_id = ? ORDER BY cree_le")
    .all(partieId, imageId) as { nom: string }[];
  return lignes.map((l) => l.nom);
}

// ---------------------------------------------------------------------------
// Pions des personnages joueurs

/**
 * Dans chaque scène immersive, chaque joueur qui a choisi son nom a son pion.
 * Les nouveaux pions sont posés sur la première ligne, dans des cases libres.
 */
export function assurerPionsPj(partieId: number): void {
  const joueurs = base
    .prepare("SELECT id FROM participant WHERE partie_id = ? AND role = 'joueur' AND nom IS NOT NULL ORDER BY id")
    .all(partieId) as { id: number }[];
  const scenes = base
    .prepare("SELECT id FROM scene WHERE partie_id = ? AND type = 'immersive'")
    .all(partieId) as { id: string }[];
  for (const scene of scenes) {
    const pions = pionsDe(scene.id);
    const occupees = new Set(pions.map((p) => `${p.col},${p.lig}`));
    joueurs.forEach((j, rang) => {
      if (pions.some((p) => p.joueurId === j.id)) return;
      let col = 0;
      while (occupees.has(`${col},0`)) col++;
      occupees.add(`${col},0`);
      base
        .prepare(
          `INSERT INTO pion (id, partie_id, scene_id, type, joueur_id, nom, couleur, taille, col, lig)
           VALUES (?, ?, ?, 'pj', ?, '', ?, 1, ?, 0)`,
        )
        .run(randomBytes(8).toString("hex"), partieId, scene.id, j.id, COULEURS_PJ[rang % COULEURS_PJ.length], col);
    });
  }
}

// ---------------------------------------------------------------------------
// Diffusions

/**
 * Le MJ reçoit toutes les scènes (et sa bibliothèque, qui indique les scènes de chaque image) ;
 * tout le monde reçoit la scène montrée.
 */
export function diffuserScenes(io: Io, partieId: number): void {
  io.to(SALLE_MJ).emit("scenes", toutesLesScenes(partieId));
  diffuserImages(io, partieId);
  // Les pions cachés ne quittent jamais le serveur pour les joueurs.
  const active = sceneActive(partieId);
  io.to(SALLE_MJ).emit("scene", active);
  io.to(SALLE_JOUEURS).emit("scene", vuePourJoueurs(active));
}

export function envoyerScenes(socket: SocketBrumeland, partieId: number): void {
  const active = sceneActive(partieId);
  if (socket.data.participant.role === "mj") {
    socket.emit("scene", active);
    socket.emit("scenes", toutesLesScenes(partieId));
  } else {
    socket.emit("scene", vuePourJoueurs(active));
  }
}

/**
 * Les PS d'un combattant changent : à 0, son pion devient « à terre » (personnage joueur, dans
 * toutes les scènes) ou « mort » (PNJ). Si ses PS remontent, le pion redevient normal.
 */
export function etatSelonPs(
  io: Io,
  partieId: number,
  cible: { joueurId: number } | { pionId: string },
  avant: number,
  apres: number,
): void {
  const tombe = avant > 0 && apres === 0;
  const releve = avant === 0 && apres > 0;
  if (!tombe && !releve) return;
  const etat = "joueurId" in cible ? "a-terre" : "mort";
  const [nouvel, ancien] = tombe ? [etat, "normal"] : ["normal", etat];
  const r =
    "joueurId" in cible
      ? base
          .prepare("UPDATE pion SET etat = ? WHERE partie_id = ? AND joueur_id = ? AND etat = ?")
          .run(nouvel, partieId, cible.joueurId, ancien)
      : base.prepare("UPDATE pion SET etat = ? WHERE partie_id = ? AND id = ? AND etat = ?").run(nouvel, partieId, cible.pionId, ancien);
  if (r.changes > 0) diffuserScenes(io, partieId);
}

/** Appelé quand un joueur choisit son nom : son pion apparaît dans les scènes immersives. */
export function apresNouveauJoueur(io: Io, partieId: number): void {
  assurerPionsPj(partieId);
  diffuserScenes(io, partieId);
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

function nettoyerNom(brut: unknown): string {
  return typeof brut === "string" ? brut.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

const typeValide = (t: unknown): t is TypeScene => t === "illustration" || t === "immersive";

function imageExiste(partieId: number, id: unknown): id is string {
  return typeof id === "string" && !!base.prepare("SELECT 1 FROM image WHERE partie_id = ? AND id = ?").get(partieId, id);
}

// ---------------------------------------------------------------------------
// Commandes

export function brancherScenes(io: Io, socket: SocketBrumeland, partieId: number): void {
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
    "mj:creerScene",
    proteger((d: { nom: string; type: TypeScene; imageId: string }) => {
      const nom = nettoyerNom(d?.nom);
      if (nom === "") return { ok: false, erreur: "Donne un nom à la scène." };
      if (nom.length > SCENE_NOM_MAX) return { ok: false, erreur: `${SCENE_NOM_MAX} caractères au plus.` };
      if (!typeValide(d.type)) return { ok: false, erreur: "Type de scène inconnu." };
      if (!imageExiste(partieId, d.imageId)) return { ok: false, erreur: "Choisis une image de la bibliothèque." };
      const id = randomBytes(16).toString("hex");
      base
        .prepare(
          `INSERT INTO scene (id, partie_id, nom, type, image_id, cree_le, ordre)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT coalesce(min(ordre), 0) - 1 FROM scene WHERE partie_id = ?))`,
        )
        .run(id, partieId, nom, d.type, d.imageId, new Date().toISOString(), partieId); // en haut de la liste
      assurerPionsPj(partieId);
      diffuserScenes(io, partieId);
      return { ok: true, id };
    }, true),
  );

  socket.on(
    "mj:modifierScene",
    proteger((d: { id: string; nom?: string; type?: TypeScene; imageId?: string }) => {
      const scene = typeof d?.id === "string" ? lireScene(partieId, d.id) : undefined;
      if (!scene) return { ok: false, erreur: "Cette scène n'existe plus." };
      if (d.nom !== undefined) {
        const nom = nettoyerNom(d.nom);
        if (nom === "") return { ok: false, erreur: "Donne un nom à la scène." };
        if (nom.length > SCENE_NOM_MAX) return { ok: false, erreur: `${SCENE_NOM_MAX} caractères au plus.` };
        base.prepare("UPDATE scene SET nom = ? WHERE id = ?").run(nom, scene.id);
      }
      if (d.type !== undefined) {
        if (!typeValide(d.type)) return { ok: false, erreur: "Type de scène inconnu." };
        base.prepare("UPDATE scene SET type = ? WHERE id = ?").run(d.type, scene.id);
      }
      if (d.imageId !== undefined) {
        if (!imageExiste(partieId, d.imageId)) return { ok: false, erreur: "Choisis une image de la bibliothèque." };
        base.prepare("UPDATE scene SET image_id = ? WHERE id = ?").run(d.imageId, scene.id);
      }
      assurerPionsPj(partieId);
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  // Nouvel ordre de la liste « Mes scènes » : tous les identifiants, du haut vers le bas.
  socket.on(
    "mj:ordonnerScenes",
    proteger((d: { ids: string[] }) => {
      const existantes = (
        base.prepare("SELECT id FROM scene WHERE partie_id = ?").all(partieId) as { id: string }[]
      ).map((s) => s.id);
      const ids = Array.isArray(d?.ids) ? d.ids : [];
      const memeListe =
        ids.length === existantes.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => existantes.includes(id));
      if (!memeListe) return { ok: false, erreur: "La liste des scènes a changé entre-temps : réessaie." };
      base.exec("BEGIN");
      try {
        const maj = base.prepare("UPDATE scene SET ordre = ? WHERE id = ?");
        ids.forEach((id, rang) => maj.run(rang, id));
        base.exec("COMMIT");
      } catch (erreur) {
        base.exec("ROLLBACK");
        throw erreur;
      }
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "mj:supprimerScene",
    proteger((d: { id: string }) => {
      const scene = typeof d?.id === "string" ? lireScene(partieId, d.id) : undefined;
      if (!scene) return { ok: false, erreur: "Cette scène n'existe plus." };
      base.prepare("UPDATE partie SET scene_active_id = NULL WHERE id = ? AND scene_active_id = ?").run(partieId, scene.id);
      base.prepare("DELETE FROM scene WHERE id = ?").run(scene.id); // ses pions partent avec elle
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "mj:montrerScene",
    proteger((d: { id: string | null }) => {
      if (d?.id !== null && !(typeof d?.id === "string" && lireScene(partieId, d.id))) {
        return { ok: false, erreur: "Cette scène n'existe plus." };
      }
      base.prepare("UPDATE partie SET scene_active_id = ? WHERE id = ?").run(d.id, partieId);
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  // La grille appartient à l'image : toutes les scènes qui l'utilisent en profitent.
  socket.on(
    "mj:grille",
    proteger((d: { imageId: string; grille: Grille }) => {
      if (!imageExiste(partieId, d?.imageId)) return { ok: false, erreur: "Cette image n'existe plus." };
      const g = d.grille;
      if (!fini(g?.taille) || g.taille < TAILLE_CASE_MIN || g.taille > TAILLE_CASE_MAX) {
        return { ok: false, erreur: `Taille d'une case : de ${TAILLE_CASE_MIN} à ${TAILLE_CASE_MAX} pixels.` };
      }
      if (!fini(g.decalageX) || !fini(g.decalageY)) return { ok: false, erreur: "Décalage invalide." };
      const taille = Math.round(g.taille * 10) / 10;
      const grille: Grille = {
        taille,
        decalageX: Math.round(normaliserDecalage(g.decalageX, taille) * 10) / 10,
        decalageY: Math.round(normaliserDecalage(g.decalageY, taille) * 10) / 10,
        visible: g.visible !== false,
      };
      base.prepare("UPDATE image SET grille = ? WHERE id = ?").run(JSON.stringify(grille), d.imageId);
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "mj:ajouterPion",
    proteger((d: { sceneId: string; nom: string; couleur: string; taille: number; col: number; lig: number; cache?: boolean }) => {
      const scene = typeof d?.sceneId === "string" ? lireScene(partieId, d.sceneId) : undefined;
      if (!scene) return { ok: false, erreur: "Cette scène n'existe plus." };
      if (scene.type !== "immersive") return { ok: false, erreur: "Les pions vont dans une scène immersive." };
      const nom = nettoyerNom(d.nom);
      if (nom === "") return { ok: false, erreur: "Donne un nom au pion." };
      if (nom.length > NOM_PION_MAX) return { ok: false, erreur: `${NOM_PION_MAX} caractères au plus.` };
      const couleur = COULEURS_PIONS.some((c) => c.id === d.couleur) ? d.couleur : COULEUR_PNJ;
      if (![1, 2, 3].includes(d.taille)) return { ok: false, erreur: "Taille : 1, 2 ou 3 cases." };
      const position = lireCase(d) ?? { col: 0, lig: 0 };
      base
        .prepare(
          `INSERT INTO pion (id, partie_id, scene_id, type, joueur_id, nom, couleur, taille, col, lig, cache)
           VALUES (?, ?, ?, 'pnj', NULL, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomBytes(8).toString("hex"),
          partieId,
          scene.id,
          nom,
          couleur,
          d.taille,
          position.col,
          position.lig,
          d.cache === true ? 1 : 0,
        );
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  // État d'un pion (mort / à terre) et pion caché : réservé au MJ.
  socket.on(
    "mj:modifierPion",
    proteger((d: { id: string; etat?: EtatPion; cache?: boolean }) => {
      const pion = base
        .prepare("SELECT type, cache, scene_id AS sceneId FROM pion WHERE partie_id = ? AND id = ?")
        .get(partieId, String(d?.id)) as { type: "pj" | "pnj"; cache: number; sceneId: string } | undefined;
      if (!pion) return { ok: false, erreur: "Ce pion n'existe plus." };
      if (d.etat !== undefined) {
        if (!ETATS_PION[pion.type].includes(d.etat)) {
          return {
            ok: false,
            erreur: pion.type === "pj" ? "Un personnage joueur peut être « à terre », pas « mort »." : "Un PNJ peut être « mort », pas « à terre ».",
          };
        }
        base.prepare("UPDATE pion SET etat = ? WHERE id = ?").run(d.etat, String(d.id));
      }
      if (d.cache !== undefined) {
        if (pion.type !== "pnj") return { ok: false, erreur: "Seuls les pions de PNJ et de monstres peuvent être cachés." };
        base.prepare("UPDATE pion SET cache = ? WHERE id = ?").run(d.cache === true ? 1 : 0, String(d.id));
      }
      diffuserScenes(io, partieId);
      if (d.cache !== undefined) diffuserCombat(io, partieId); // nom « ??? » ou révélé dans l'ordre du combat
      // Pion caché qui devient visible : tout le monde joue l'animation de révélation.
      if (pion.cache === 1 && d.cache === false) {
        io.emit("carte:revelation", { sceneId: pion.sceneId, pionId: String(d.id) });
      }
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
      diffuserScenes(io, partieId);
      return { ok: true };
    }, true),
  );

  socket.on(
    "carte:deplacerPion",
    proteger((d: { id: string; col: number; lig: number }) => {
      const pion = base
        .prepare("SELECT scene_id AS sceneId, joueur_id AS joueurId, col, lig FROM pion WHERE partie_id = ? AND id = ?")
        .get(partieId, String(d?.id)) as { sceneId: string; joueurId: number | null; col: number; lig: number } | undefined;
      if (!pion) return { ok: false, erreur: "Ce pion n'existe plus." };
      if (!estMj()) {
        // Un joueur ne déplace que son propre pion, et seulement dans la scène montrée.
        if (pion.joueurId !== moi().id) {
          return { ok: false, erreur: "Tu ne peux déplacer que le pion de ton personnage." };
        }
        if (sceneActive(partieId)?.id !== pion.sceneId) {
          return { ok: false, erreur: "Cette scène n'est plus montrée." };
        }
      }
      const position = lireCase(d);
      if (!position) return { ok: false, erreur: "Case invalide." };
      base.prepare("UPDATE pion SET col = ?, lig = ? WHERE id = ?").run(position.col, position.lig, String(d.id));
      diffuserScenes(io, partieId);
      // En combat (scène montrée) : le chemin du pion est tracé. Les mètres comptent pour le
      // round du joueur s'il a bougé son propre pion, ou si le MJ le bouge pendant son tour (il
      // joue à sa place) ; pas les corrections du MJ pendant le tour d'un autre (repoussement…).
      let round: number | null = null;
      if (sceneActive(partieId)?.id === pion.sceneId) {
        const parLeJoueur = !estMj() && pion.joueurId === moi().id;
        const mjPourLeJoueur = estMj() && pion.joueurId !== null && estSonTour(lireCombat(partieId), pion.joueurId);
        round = noterDeplacement(io, partieId, {
          pionId: String(d.id),
          de: { col: pion.col, lig: pion.lig },
          a: position,
          joueurQuiBouge: parLeJoueur || mjPourLeJoueur ? pion.joueurId : null,
        });
      }
      if (pion.col !== position.col || pion.lig !== position.lig) {
        memoriser(moi().id, { pionId: String(d.id), de: { col: pion.col, lig: pion.lig }, a: position, round });
      }
      return { ok: true };
    }),
  );

  // Annuler son dernier déplacement (puis le précédent…) : le pion revient à sa case précédente ;
  // en combat, la trace raccourcit et les mètres sont rendus.
  socket.on(
    "carte:annulerDeplacement",
    proteger(() => {
      const liste = memoireDeplacements.get(moi().id) ?? [];
      const dernier = liste.at(-1);
      if (!dernier) return { ok: false, erreur: "Aucun déplacement à annuler." };
      // Quoi qu'il arrive, ce déplacement sort de la mémoire (pour ne pas bloquer les suivants).
      memoireDeplacements.set(moi().id, liste.slice(0, -1));
      const pion = base
        .prepare("SELECT scene_id AS sceneId, joueur_id AS joueurId, col, lig FROM pion WHERE partie_id = ? AND id = ?")
        .get(partieId, dernier.pionId) as { sceneId: string; joueurId: number | null; col: number; lig: number } | undefined;
      if (!pion) return { ok: false, erreur: "Ce pion n'existe plus." };
      if (pion.col !== dernier.a.col || pion.lig !== dernier.a.lig) {
        return { ok: false, erreur: "Ce pion a été déplacé depuis : annulation impossible." };
      }
      if (!estMj() && sceneActive(partieId)?.id !== pion.sceneId) {
        return { ok: false, erreur: "Cette scène n'est plus montrée." };
      }
      if (dernier.round !== null) {
        const refus = annulerDansCombat(io, partieId, {
          pionId: dernier.pionId,
          a: dernier.a,
          round: dernier.round,
          joueurId: pion.joueurId,
        });
        if (refus) return { ok: false, erreur: refus };
      }
      base.prepare("UPDATE pion SET col = ?, lig = ? WHERE id = ?").run(dernier.de.col, dernier.de.lig, dernier.pionId);
      diffuserScenes(io, partieId);
      return { ok: true };
    }),
  );

  // Règle et pointeur : transmis aux autres avec la scène concernée (chacun n'affiche que ceux
  // de la scène qu'il regarde). Un joueur ne les utilise que dans la scène montrée.
  const peutAgirSur = (sceneId: unknown) =>
    typeof sceneId === "string" && (estMj() || sceneActive(partieId)?.id === sceneId);

  socket.on("carte:regle", (d) => {
    if (!peutAgirSur(d?.sceneId)) return;
    const de = lireCase(d.mesure?.de);
    const a = lireCase(d.mesure?.a);
    socket.broadcast.emit("carte:regle", {
      sceneId: d.sceneId,
      auteurId: moi().id,
      auteur: moi().nom ?? "Meneur de jeu",
      mesure: de && a ? { de, a } : null,
    });
  });

  socket.on("carte:pointeur", (d) => {
    if (!peutAgirSur(d?.sceneId) || !fini(d.x) || !fini(d.y)) return;
    socket.broadcast.emit("carte:pointeur", {
      sceneId: d.sceneId,
      auteurId: moi().id,
      auteur: moi().nom ?? "Meneur de jeu",
      x: d.x,
      y: d.y,
    });
  });
}
