// Combat : initiative par cartes, ordre des tours, attendre, réactions, déplacement du round.
// Partagé entre le serveur (qui décide et tire les cartes) et l'interface (qui affiche).
//
// Règles du livre (chapitre 4) :
// - 10 cartes d'initiative numérotées de 1 à 10, tirées au hasard au début de chaque round ;
//   le n° 1 agit en premier. Un groupe de PNJ peut partager une carte ; un monstre peut en avoir plusieurs.
// - Surprise : au premier round, les attaquants qui surprennent choisissent leur carte.
// - Attendre (règle optionnelle) : à son tour, échanger sa carte avec celle d'un participant qui
//   agit plus tard, s'il n'a pas encore agi ni attendu.
// - Une réaction (parer, esquiver) compte comme l'action du round : la carte est retournée et
//   le déplacement du round est perdu.
// - Déplacement : jusqu'à sa valeur de déplacement par round, doublée par l'action Course.

import type { Case } from "./carte.ts";

export const NB_CARTES = 10;
export const CARTES_MAX_PAR_COMBATTANT = 5;
export const NOM_COMBATTANT_MAX = 30;

export interface Combattant {
  id: string;
  type: "pj" | "pnj";
  /** Personnage joueur : son joueur (nom tiré de la fiche). */
  joueurId: number | null;
  /** PNJ ajouté depuis un pion de la scène (pour le mettre en évidence sur la carte). */
  pionId: string | null;
  /** Nom d'un PNJ ou d'un groupe de PNJ. */
  nom: string;
  /** Nombre de cartes tirées par round (plusieurs pour certains monstres). */
  nbCartes: number;
  /** Points de santé d'un PNJ, suivis par le MJ (jamais envoyés aux joueurs). */
  ps: { actuels: number; max: number } | null;
  /** Attaquant qui surprend : choisit sa carte au premier round. */
  surprise: boolean;
}

export interface CarteTiree {
  valeur: number;
  combattantId: string;
  /** Carte retournée : le tour est joué (ou une réaction a été faite). */
  jouee: boolean;
  /** Carte obtenue en attendant : on ne peut plus l'échanger. */
  attendue: boolean;
}

export interface MouvementRound {
  /** Mètres parcourus pendant le round (déplacements faits par le joueur). */
  parcouru: number;
  /** Action Course : déplacement doublé. */
  course: boolean;
  /** Réaction faite : plus de déplacement ce round. */
  reaction: boolean;
}

export type PhaseCombat = "preparation" | "surprise" | "round";

export interface Combat {
  phase: PhaseCombat;
  /** 0 pendant la préparation, puis 1, 2… */
  round: number;
  combattants: Combattant[];
  cartes: CarteTiree[];
  /** Cartes choisies par les attaquants qui surprennent (phase « surprise »). */
  choixSurprise: Record<string, number[]>;
  mouvements: Record<string, MouvementRound>;
  /** Chemin de chaque pion pendant le round (identifiant du pion → cases successives). */
  traces: Record<string, Case[]>;
}

export class ErreurCombat extends Error {}

export function combatVide(): Combat {
  return { phase: "preparation", round: 0, combattants: [], cartes: [], choixSurprise: {}, mouvements: {}, traces: {} };
}

export function cartesNecessaires(c: Combat): number {
  return c.combattants.reduce((n, x) => n + x.nbCartes, 0);
}

/** Carte dont c'est le tour : la plus petite carte pas encore retournée (null si le round est fini). */
export function carteCourante(c: Combat): CarteTiree | null {
  if (c.phase !== "round") return null;
  const restantes = c.cartes.filter((x) => !x.jouee).sort((a, b) => a.valeur - b.valeur);
  return restantes[0] ?? null;
}

export function cartesDe(c: Combat, combattantId: string): CarteTiree[] {
  return c.cartes.filter((x) => x.combattantId === combattantId).sort((a, b) => a.valeur - b.valeur);
}

/** Mélange au hasard (Fisher-Yates) ; le tirage est remplaçable dans les tests. */
function melanger<T>(liste: T[], hasard: (n: number) => number): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = hasard(i + 1);
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

const mouvementsVides = (c: Combat): Record<string, MouvementRound> =>
  Object.fromEntries(
    c.combattants.filter((x) => x.type === "pj").map((x) => [x.id, { parcouru: 0, course: false, reaction: false }]),
  );

/**
 * Tire l'initiative pour un nouveau round. Les cartes déjà choisies (surprise) sont gardées ;
 * les autres participants reçoivent des cartes au hasard parmi celles qui restent.
 * `hasard(n)` renvoie un entier entre 0 et n − 1.
 */
export function tirerInitiative(c: Combat, hasard: (n: number) => number, choisies: Record<string, number[]> = {}): Combat {
  if (c.combattants.length === 0) throw new ErreurCombat("Ajoute d'abord des participants au combat.");
  const total = cartesNecessaires(c);
  if (total > NB_CARTES) {
    throw new ErreurCombat(
      `Il faut ${total} cartes, mais le paquet n'en compte que ${NB_CARTES} : regroupe des PNJ (une carte pour un groupe).`,
    );
  }
  const prises = new Set(Object.values(choisies).flat());
  let paquet = melanger(
    Array.from({ length: NB_CARTES }, (_, i) => i + 1).filter((v) => !prises.has(v)),
    hasard,
  );
  const cartes: CarteTiree[] = [];
  for (const x of c.combattants) {
    const deja = choisies[x.id] ?? [];
    for (const valeur of deja) cartes.push({ valeur, combattantId: x.id, jouee: false, attendue: false });
    const manque = x.nbCartes - deja.length;
    for (const valeur of paquet.slice(0, manque)) cartes.push({ valeur, combattantId: x.id, jouee: false, attendue: false });
    paquet = paquet.slice(manque);
  }
  return {
    ...c,
    phase: "round",
    round: c.round + 1,
    cartes: cartes.sort((a, b) => a.valeur - b.valeur),
    choixSurprise: {},
    mouvements: mouvementsVides(c),
    traces: {},
  };
}

/** Attaquants qui surprennent et n'ont pas encore choisi toutes leurs cartes. */
export function surpriseEnAttente(c: Combat): Combattant[] {
  return c.combattants.filter((x) => x.surprise && (c.choixSurprise[x.id]?.length ?? 0) < x.nbCartes);
}

/** Un attaquant qui surprend choisit une carte (phase « surprise »). */
export function choisirCarteSurprise(c: Combat, combattantId: string, valeur: number): Combat {
  if (c.phase !== "surprise") throw new ErreurCombat("Ce n'est pas le moment de choisir une carte.");
  const x = c.combattants.find((y) => y.id === combattantId);
  if (!x?.surprise) throw new ErreurCombat("Seuls les attaquants qui surprennent choisissent leur carte.");
  if (!Number.isInteger(valeur) || valeur < 1 || valeur > NB_CARTES) throw new ErreurCombat("Carte invalide.");
  if (Object.values(c.choixSurprise).flat().includes(valeur)) throw new ErreurCombat(`La carte ${valeur} est déjà prise.`);
  const deja = c.choixSurprise[x.id] ?? [];
  if (deja.length >= x.nbCartes) throw new ErreurCombat("Toutes ses cartes sont déjà choisies.");
  return { ...c, choixSurprise: { ...c.choixSurprise, [x.id]: [...deja, valeur] } };
}

/** Retourne une carte (tour joué) ; ou la remet face visible (correction du MJ). */
export function retournerCarte(c: Combat, valeur: number, jouee = true): Combat {
  if (c.phase !== "round") throw new ErreurCombat("Aucun round en cours.");
  if (!c.cartes.some((x) => x.valeur === valeur)) throw new ErreurCombat("Cette carte n'est pas en jeu.");
  return { ...c, cartes: c.cartes.map((x) => (x.valeur === valeur ? { ...x, jouee } : x)) };
}

/** Cartes avec lesquelles celui dont c'est le tour peut échanger la sienne (attendre). */
export function cartesPourAttendre(c: Combat): CarteTiree[] {
  const courante = carteCourante(c);
  if (!courante) return [];
  return c.cartes.filter(
    (x) => x.valeur > courante.valeur && !x.jouee && !x.attendue && x.combattantId !== courante.combattantId,
  );
}

/**
 * Attendre : celui dont c'est le tour échange sa carte avec une carte plus tardive.
 * L'autre participant prend sa place et agit maintenant.
 */
export function attendre(c: Combat, valeurVisee: number): Combat {
  const courante = carteCourante(c);
  if (!courante) throw new ErreurCombat("Aucun tour en cours.");
  const visee = cartesPourAttendre(c).find((x) => x.valeur === valeurVisee);
  if (!visee) {
    throw new ErreurCombat("Impossible d'échanger avec cette carte (déjà jouée, déjà échangée, ou plus tôt dans l'ordre).");
  }
  return {
    ...c,
    cartes: c.cartes.map((x) => {
      if (x.valeur === courante.valeur) return { ...x, combattantId: visee.combattantId };
      if (x.valeur === visee.valeur) return { ...x, combattantId: courante.combattantId, attendue: true };
      return x;
    }),
  };
}

/**
 * Réaction d'un personnage joueur (parer, esquiver) : sa carte est retournée s'il n'a pas encore
 * joué, et il perd son déplacement pour le round.
 */
export function reagir(c: Combat, combattantId: string): Combat {
  if (c.phase !== "round") throw new ErreurCombat("Aucun round en cours.");
  const carte = cartesDe(c, combattantId).find((x) => !x.jouee);
  if (!carte) throw new ErreurCombat("Action déjà utilisée ce round : pas de réaction possible.");
  const m = c.mouvements[combattantId];
  return {
    ...c,
    cartes: c.cartes.map((x) => (x.valeur === carte.valeur ? { ...x, jouee: true } : x)),
    mouvements: m ? { ...c.mouvements, [combattantId]: { ...m, reaction: true } } : c.mouvements,
  };
}

/** Déplacement restant ce round, en mètres (null si inconnu). */
export function deplacementRestant(m: MouvementRound | undefined, deplacement: number | null): number | null {
  if (!m || deplacement === null) return null;
  if (m.reaction) return 0;
  return Math.max(0, deplacement * (m.course ? 2 : 1) - m.parcouru);
}

/** Déplacement total du round (doublé par la Course), en mètres. */
export function deplacementDuRound(m: MouvementRound | undefined, deplacement: number | null): number | null {
  if (!m || deplacement === null) return null;
  return deplacement * (m.course ? 2 : 1);
}

/** Ajoute un déplacement au chemin d'un pion pendant le round. */
export function ajouterATrace(c: Combat, pionId: string, de: Case, a: Case): Combat {
  const avant = c.traces[pionId] ?? [de];
  return { ...c, traces: { ...c.traces, [pionId]: [...avant, a] } };
}

/**
 * Version pour les joueurs : sans les PS des PNJ ; les PNJ cachés deviennent « ??? »,
 * et le chemin d'un pion caché n'est pas envoyé.
 */
export function vueCombatJoueurs(c: Combat | null, pionsCaches: Set<string>): Combat | null {
  if (!c) return null;
  return {
    ...c,
    traces: Object.fromEntries(Object.entries(c.traces).filter(([pionId]) => !pionsCaches.has(pionId))),
    combattants: c.combattants.map((x) => {
      const cache = !!x.pionId && pionsCaches.has(x.pionId);
      // Un PNJ caché : ni son nom, ni le lien vers son pion.
      return { ...x, ps: null, nom: cache ? "???" : x.nom, pionId: cache ? null : x.pionId };
    }),
  };
}
