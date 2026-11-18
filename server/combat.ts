// Combat : participants, tirage de l'initiative (par le serveur), tours, attendre, réactions,
// et déplacement de chaque personnage joueur pendant le round. Enregistré en JSON dans la partie.

import { randomBytes, randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  ajouterATrace,
  attendre,
  carteCourante,
  CARTES_MAX_PAR_COMBATTANT,
  choisirCarteSurprise,
  combatVide,
  ErreurCombat,
  NOM_COMBATTANT_MAX,
  reagir,
  retournerCarte,
  surpriseEnAttente,
  tirerInitiative,
  vueCombatJoueurs,
  type Combat,
  type Combattant,
} from "../shared/combat.ts";
import { distanceMetres, type Case } from "../shared/carte.ts";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import { base } from "./base.ts";
import type { Participant } from "./partie.ts";
import { etatSelonPs } from "./scenes.ts";

interface DonneesSocket {
  participant: Participant;
}
type Io = Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;
type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

const SALLE_MJ = "mj";
const SALLE_JOUEURS = "joueurs";

// ---------------------------------------------------------------------------
// Lecture et écriture

function joueursNommes(partieId: number): number[] {
  return (
    base
      .prepare("SELECT id FROM participant WHERE partie_id = ? AND role = 'joueur' AND nom IS NOT NULL ORDER BY id")
      .all(partieId) as { id: number }[]
  ).map((j) => j.id);
}

export function lireCombat(partieId: number): Combat | null {
  const ligne = base.prepare("SELECT combat FROM partie WHERE id = ?").get(partieId) as { combat: string | null };
  if (!ligne.combat) return null;
  // (« traces » ajouté après coup : un combat enregistré avant n'en a pas.)
  const c = { traces: {}, ...(JSON.parse(ligne.combat) as Partial<Combat>) } as Combat;
  // Un joueur dont l'invitation a été supprimée quitte le combat (avec ses cartes).
  const joueurs = new Set(joueursNommes(partieId));
  const partis = new Set(c.combattants.filter((x) => x.type === "pj" && !joueurs.has(x.joueurId ?? -1)).map((x) => x.id));
  if (partis.size === 0) return c;
  return {
    ...c,
    combattants: c.combattants.filter((x) => !partis.has(x.id)),
    cartes: c.cartes.filter((x) => !partis.has(x.combattantId)),
  };
}

function ecrireCombat(partieId: number, c: Combat | null): void {
  base.prepare("UPDATE partie SET combat = ? WHERE id = ?").run(c ? JSON.stringify(c) : null, partieId);
}

function pionsCaches(partieId: number): Set<string> {
  return new Set(
    (base.prepare("SELECT id FROM pion WHERE partie_id = ? AND cache = 1").all(partieId) as { id: string }[]).map(
      (p) => p.id,
    ),
  );
}

// ---------------------------------------------------------------------------
// Diffusions

/** Le MJ voit tout ; les joueurs ne voient ni les PS des PNJ ni le nom des PNJ cachés. */
export function diffuserCombat(io: Io, partieId: number): void {
  const c = lireCombat(partieId);
  io.to(SALLE_MJ).emit("combat", c);
  io.to(SALLE_JOUEURS).emit("combat", vueCombatJoueurs(c, pionsCaches(partieId)));
}

export function envoyerCombat(socket: SocketBrumeland, partieId: number): void {
  const c = lireCombat(partieId);
  socket.emit("combat", socket.data.participant.role === "mj" ? c : vueCombatJoueurs(c, pionsCaches(partieId)));
}

/**
 * Un pion a bougé dans la scène montrée pendant un round :
 * - son chemin du round s'allonge (tracé sur la carte) ;
 * - si c'est un joueur qui a bougé son propre pion, les mètres comptent pour son déplacement du round.
 */
export function noterDeplacement(
  io: Io,
  partieId: number,
  d: { pionId: string; de: Case; a: Case; joueurQuiBouge: number | null },
): void {
  let c = lireCombat(partieId);
  if (!c || c.phase !== "round") return;
  const metres = distanceMetres(d.de, d.a);
  if (metres === 0) return;
  c = ajouterATrace(c, d.pionId, d.de, d.a, d.joueurQuiBouge !== null);
  const x = d.joueurQuiBouge === null ? undefined : c.combattants.find((y) => y.type === "pj" && y.joueurId === d.joueurQuiBouge);
  const m = x && c.mouvements[x.id];
  if (x && m) c = { ...c, mouvements: { ...c.mouvements, [x.id]: { ...m, parcouru: m.parcouru + metres } } };
  ecrireCombat(partieId, c);
  diffuserCombat(io, partieId);
}

// ---------------------------------------------------------------------------
// Commandes

const hasard = (n: number) => randomInt(0, n);
const nouvelId = () => randomBytes(8).toString("hex");

function nettoyerNom(brut: unknown): string {
  return typeof brut === "string" ? brut.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function combattantPj(joueurId: number): Combattant {
  return { id: nouvelId(), type: "pj", joueurId, pionId: null, nom: "", nbCartes: 1, ps: null, surprise: false };
}

export function brancherCombat(io: Io, socket: SocketBrumeland, partieId: number): void {
  const moi = () => socket.data.participant;
  const estMj = () => moi().role === "mj";

  /**
   * Exécute une modification du combat : vérifie qu'il existe, applique, enregistre, diffuse.
   * `action` renvoie le nouveau combat (ou lance ErreurCombat avec un message pour l'écran).
   */
  function agir<D>(action: (c: Combat, d: D) => Combat | null, options: { mj?: boolean; creer?: boolean } = {}) {
    return (d: D, reponse: (r: Reponse) => void) => {
      if (typeof reponse !== "function") return;
      if (options.mj && !estMj()) {
        reponse({ ok: false, erreur: "Action réservée au meneur de jeu." });
        return;
      }
      try {
        const c = lireCombat(partieId);
        if (!c && !options.creer) throw new ErreurCombat("Aucun combat en cours.");
        const apres = action(c ?? combatVide(), d);
        ecrireCombat(partieId, apres);
        diffuserCombat(io, partieId);
        reponse({ ok: true });
      } catch (erreur) {
        if (erreur instanceof ErreurCombat) {
          reponse({ ok: false, erreur: erreur.message });
        } else {
          console.error(erreur);
          reponse({ ok: false, erreur: "Erreur inattendue sur le serveur." });
        }
      }
    };
  }

  /** Le combattant de ce personnage joueur (ou erreur), pour les actions d'un joueur. */
  function verifierSien(c: Combat, combattantId: string): Combattant {
    const x = c.combattants.find((y) => y.id === combattantId);
    if (!x) throw new ErreurCombat("Ce participant n'est plus dans le combat.");
    if (!estMj() && !(x.type === "pj" && x.joueurId === moi().id)) {
      throw new ErreurCombat("Tu ne peux agir que pour ton personnage.");
    }
    return x;
  }

  /** Le tour en cours doit être le sien (ou le MJ). */
  function verifierSonTour(c: Combat): void {
    const courante = carteCourante(c);
    if (!courante) throw new ErreurCombat("Aucun tour en cours.");
    if (!estMj()) verifierSien(c, courante.combattantId);
  }

  // --- MJ : mise en place

  socket.on(
    "mj:combat:commencer",
    agir((c) => {
      if (lireCombat(partieId)) throw new ErreurCombat("Un combat est déjà en cours.");
      // Tous les personnages joueurs participent ; le MJ peut retirer un absent.
      return { ...c, combattants: joueursNommes(partieId).map(combattantPj) };
    }, { mj: true, creer: true }),
  );

  socket.on(
    "mj:combat:finir",
    agir(() => null, { mj: true }),
  );

  socket.on(
    "mj:combat:ajouterJoueurs",
    agir((c) => {
      const presents = new Set(c.combattants.map((x) => x.joueurId));
      const nouveaux = joueursNommes(partieId).filter((id) => !presents.has(id)).map(combattantPj);
      if (nouveaux.length === 0) throw new ErreurCombat("Tous les personnages joueurs participent déjà.");
      return { ...c, combattants: [...c.combattants, ...nouveaux] };
    }, { mj: true }),
  );

  socket.on(
    "mj:combat:ajouterPnj",
    agir((c, d: { nom: string; nbCartes: number; psMax: number | null }) => {
      const nom = nettoyerNom(d?.nom);
      if (nom === "") throw new ErreurCombat("Donne un nom au PNJ (ou au groupe).");
      if (nom.length > NOM_COMBATTANT_MAX) throw new ErreurCombat(`${NOM_COMBATTANT_MAX} caractères au plus.`);
      const nbCartes = Number(d.nbCartes ?? 1);
      if (!Number.isInteger(nbCartes) || nbCartes < 1 || nbCartes > CARTES_MAX_PAR_COMBATTANT) {
        throw new ErreurCombat(`De 1 à ${CARTES_MAX_PAR_COMBATTANT} cartes.`);
      }
      const psMax = d.psMax === null || d.psMax === undefined ? null : Number(d.psMax);
      if (psMax !== null && (!Number.isInteger(psMax) || psMax < 1 || psMax > 999)) {
        throw new ErreurCombat("PS : un nombre de 1 à 999.");
      }
      const x: Combattant = {
        id: nouvelId(),
        type: "pnj",
        joueurId: null,
        pionId: null,
        nom,
        nbCartes,
        ps: psMax === null ? null : { actuels: psMax, max: psMax },
        surprise: false,
      };
      return { ...c, combattants: [...c.combattants, x] };
    }, { mj: true }),
  );

  // Les pions de PNJ (vivants) de la scène montrée rejoignent le combat, un par pion.
  socket.on(
    "mj:combat:ajouterPionsScene",
    agir((c) => {
      const pions = base
        .prepare(
          `SELECT pion.id, pion.nom FROM pion JOIN partie ON partie.scene_active_id = pion.scene_id
           WHERE partie.id = ? AND pion.type = 'pnj' AND pion.etat <> 'mort' ORDER BY pion.rowid`,
        )
        .all(partieId) as { id: string; nom: string }[];
      const deja = new Set(c.combattants.map((x) => x.pionId));
      const nouveaux: Combattant[] = pions
        .filter((p) => !deja.has(p.id))
        .map((p) => ({ id: nouvelId(), type: "pnj", joueurId: null, pionId: p.id, nom: p.nom, nbCartes: 1, ps: null, surprise: false }));
      if (nouveaux.length === 0) throw new ErreurCombat("Aucun nouveau pion de PNJ dans la scène montrée.");
      return { ...c, combattants: [...c.combattants, ...nouveaux] };
    }, { mj: true }),
  );

  socket.on(
    "mj:combat:retirer",
    agir((c, d: { id: string }) => {
      if (!c.combattants.some((x) => x.id === d?.id)) throw new ErreurCombat("Ce participant n'est plus dans le combat.");
      return {
        ...c,
        combattants: c.combattants.filter((x) => x.id !== d.id),
        cartes: c.cartes.filter((x) => x.combattantId !== d.id),
      };
    }, { mj: true }),
  );

  socket.on(
    "mj:combat:modifier",
    agir((c, d: { id: string; nbCartes?: number; surprise?: boolean; ps?: { actuels: number; max: number } | null }) => {
      const x = c.combattants.find((y) => y.id === d?.id);
      if (!x) throw new ErreurCombat("Ce participant n'est plus dans le combat.");
      const maj: Combattant = { ...x };
      if (d.nbCartes !== undefined) {
        if (!Number.isInteger(d.nbCartes) || d.nbCartes < 1 || d.nbCartes > CARTES_MAX_PAR_COMBATTANT) {
          throw new ErreurCombat(`De 1 à ${CARTES_MAX_PAR_COMBATTANT} cartes.`);
        }
        maj.nbCartes = d.nbCartes;
      }
      if (d.surprise !== undefined) {
        if (c.phase !== "preparation") throw new ErreurCombat("La surprise se décide avant le premier tirage.");
        maj.surprise = d.surprise === true;
      }
      if (d.ps !== undefined) {
        if (x.type !== "pnj") throw new ErreurCombat("Les PS des personnages joueurs sont sur leur fiche.");
        if (d.ps === null) {
          maj.ps = null;
        } else {
          const { actuels, max } = d.ps;
          if (!Number.isInteger(max) || max < 1 || max > 999 || !Number.isInteger(actuels) || actuels < 0 || actuels > max) {
            throw new ErreurCombat("PS : entre 0 et le maximum.");
          }
          maj.ps = { actuels, max };
        }
      }
      // PS d'un PNJ à 0 : son pion passe « mort » (et redevient normal si les PS remontent).
      if (x.pionId && x.ps && maj.ps) {
        const pionId = x.pionId;
        const [avant, apres] = [x.ps.actuels, maj.ps.actuels];
        queueMicrotask(() => etatSelonPs(io, partieId, { pionId }, avant, apres));
      }
      return { ...c, combattants: c.combattants.map((y) => (y.id === x.id ? maj : y)) };
    }, { mj: true }),
  );

  // --- Tirage de l'initiative

  socket.on(
    "mj:combat:tirer",
    agir((c) => {
      if (c.phase === "preparation" && c.combattants.some((x) => x.surprise)) {
        // Premier round avec surprise : les attaquants choisissent d'abord leur carte.
        return { ...c, phase: "surprise", choixSurprise: {}, cartes: [] };
      }
      if (c.phase === "surprise") {
        const attente = surpriseEnAttente(c);
        if (attente.length > 0) throw new ErreurCombat("Des attaquants doivent encore choisir leur carte.");
      }
      // Round suivant : seulement quand toutes les cartes ont été jouées (ou retournées par le MJ).
      const restante = carteCourante(c);
      if (c.phase === "round" && restante) {
        const qui = c.combattants.find((x) => x.id === restante.combattantId);
        throw new ErreurCombat(
          `Tout le monde n'a pas encore joué (carte ${restante.valeur}${qui?.type === "pnj" ? ` : ${qui.nom}` : ""}).`,
        );
      }
      const tire = tirerInitiative(c, hasard, c.phase === "surprise" ? c.choixSurprise : {});
      // La surprise ne vaut que pour le premier round.
      return { ...tire, combattants: tire.combattants.map((x) => ({ ...x, surprise: false })) };
    }, { mj: true }),
  );

  socket.on(
    "combat:choisirCarte",
    agir((c, d: { combattantId: string; valeur: number }) => {
      verifierSien(c, String(d?.combattantId));
      const choisi = choisirCarteSurprise(c, d.combattantId, Number(d.valeur));
      // Quand tous les attaquants ont choisi, le serveur distribue les autres cartes.
      if (surpriseEnAttente(choisi).length > 0) return choisi;
      const tire = tirerInitiative(choisi, hasard, choisi.choixSurprise);
      return { ...tire, combattants: tire.combattants.map((x) => ({ ...x, surprise: false })) };
    }),
  );

  // --- Tours

  socket.on(
    "combat:terminerTour",
    agir((c) => {
      verifierSonTour(c);
      return retournerCarte(c, carteCourante(c)!.valeur);
    }),
  );

  socket.on(
    "combat:attendre",
    agir((c, d: { valeur: number }) => {
      verifierSonTour(c);
      return attendre(c, Number(d?.valeur));
    }),
  );

  socket.on(
    "combat:reaction",
    agir((c, d: { combattantId: string }) => {
      const x = verifierSien(c, String(d?.combattantId));
      return reagir(c, x.id);
    }),
  );

  socket.on(
    "combat:course",
    agir((c, d: { combattantId: string; course: boolean }) => {
      const x = verifierSien(c, String(d?.combattantId));
      const m = c.mouvements[x.id];
      if (c.phase !== "round" || !m) throw new ErreurCombat("Aucun round en cours.");
      return { ...c, mouvements: { ...c.mouvements, [x.id]: { ...m, course: d.course === true } } };
    }),
  );

  // MJ : retourner ou remettre face visible n'importe quelle carte (monstre qui réagit, correction).
  socket.on(
    "mj:combat:retourner",
    agir((c, d: { valeur: number; jouee: boolean }) => retournerCarte(c, Number(d?.valeur), d?.jouee !== false), {
      mj: true,
    }),
  );
}
