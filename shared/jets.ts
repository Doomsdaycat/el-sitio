// Jets de dés : définitions partagées entre le serveur et l'interface.
// Les tirages eux-mêmes sont toujours faits par le serveur.

/** Les six états de Dragonbane, chacun lié à une caractéristique. */
export const ETATS = [
  { id: "epuise", nom: "Épuisé", carac: "FOR" },
  { id: "malade", nom: "Malade", carac: "CON" },
  { id: "etourdi", nom: "Étourdi", carac: "AGI" },
  { id: "furieux", nom: "Furieux", carac: "INT" },
  { id: "effraye", nom: "Effrayé", carac: "VOL" },
  { id: "decourage", nom: "Découragé", carac: "CHA" },
] as const;

export type IdEtat = (typeof ETATS)[number]["id"];

export const VALEUR_MIN = 1;
export const VALEUR_MAX = 20;
/** Nombre maximal de faveurs (ou de fléaux) sur un même jet. */
export const BONUS_MAX = 5;
export const LIBELLE_MAX = 40;
export const FORMULE_MAX = 40;

/** Résultat d'un jet de compétence ou de caractéristique (1D20 sous la valeur). */
export interface ResultatCompetence {
  type: "competence";
  valeur: number;
  faveurs: number;
  fleaux: number;
  /** Tous les D20 lancés. */
  des: number[];
  /** Position, dans `des`, du dé retenu. */
  indexGarde: number;
  garde: number;
  reussi: boolean;
  /** 1 naturel : « tomber sur un dragon ». */
  dragon: boolean;
  /** 20 naturel : « tomber sur un démon ». */
  demon: boolean;
  /** Jet lancé depuis la fiche : état qui a ajouté un fléau (compté dans `fleaux`). */
  fleauEtat?: IdEtat | null;
}

/** Un terme d'une formule libre : « 2D6 », « D3 » ou un nombre fixe. */
export interface TermeFormule {
  signe: 1 | -1;
  /** Nombre de dés (0 pour un nombre fixe). */
  nombre: number;
  /** Faces du dé (0 pour un nombre fixe). */
  faces: number;
  /** Valeur de chaque dé (pour un D3 : déjà divisée par deux). */
  des: number[];
  /** Pour un nombre fixe. */
  fixe: number;
  sousTotal: number;
}

/** Résultat d'un jet libre (dégâts, tables…) : « 2D6+3 », « D8+D4 »… */
export interface ResultatLibre {
  type: "libre";
  formule: string;
  termes: TermeFormule[];
  total: number;
}

export type Resultat = ResultatCompetence | ResultatLibre;

/** Une ligne du journal, telle que le serveur l'envoie. */
export interface EntreeJournal {
  id: number;
  auteurId: number;
  auteurNom: string;
  auteurRole: "mj" | "joueur";
  creeLe: string;
  libelle: string | null;
  /** Jet lancé par le MJ pour le personnage d'un joueur (sinon null). */
  pourId: number | null;
  pourNom: string | null;
  /** Jet secret du MJ. */
  secret: boolean;
  /** Jet secret que le MJ a rendu visible. */
  revele: boolean;
  /** null quand un joueur regarde un jet secret pas encore révélé. */
  resultat: Resultat | null;
  /** Si ce jet est une nouvelle tentative : le jet d'origine et l'état choisi. */
  forceDe: number | null;
  etat: IdEtat | null;
  /** Le joueur a déjà forcé la chance sur ce jet. */
  dejaForce: boolean;
  /** Jet en opposition : id du jet (d'origine) auquel celui-ci s'oppose, sinon null. */
  opposeA: number | null;
  /** Opposition ouverte (personne n'agit : bras de fer, poison…), décidée par le MJ. */
  ouverte: boolean;
}

/**
 * Le joueur dont le personnage a fait ce jet, ou null pour un jet de PNJ ou de monstre.
 * C'est l'auteur s'il est joueur, ou le joueur pour qui le MJ a lancé.
 */
export function joueurConcerne(entree: EntreeJournal): number | null {
  if (entree.pourId !== null) return entree.pourId;
  return entree.auteurRole === "joueur" ? entree.auteurId : null;
}

/**
 * Jets en opposition et forcer la chance (règle du livre) :
 * - celui qui agit ne peut forcer la chance qu'avant le jet de son adversaire ;
 * - l'adversaire (qui ne fait que réagir) ne le peut pas ;
 * - en opposition ouverte, chacun le peut.
 * `opposant` : le jet qui s'oppose à celui-ci, s'il existe.
 */
export function oppositionPermetDeForcer(
  entree: EntreeJournal,
  opposant: EntreeJournal | undefined,
): boolean {
  if (entree.opposeA !== null && !entree.ouverte) return false;
  if (opposant && !opposant.ouverte) return false;
  return true;
}

/** Le jet qui s'oppose au jet d'origine `id`, s'il est dans la liste. */
export function trouverOpposant(id: number, journal: EntreeJournal[]): EntreeJournal | undefined {
  return journal.find((e) => e.opposeA === id);
}

/** Le dernier essai d'un jet : sa nouvelle tentative s'il y en a une, sinon lui-même. */
export function dernierEssai(id: number, journal: EntreeJournal[]): EntreeJournal | undefined {
  return journal.find((e) => e.forceDe === id) ?? journal.find((e) => e.id === id);
}

export type IssueOpposition = "actif" | "opposant" | "egalite";

/**
 * Résultat d'un jet en opposition, à partir des derniers essais de chaque camp.
 * - Normal : si celui qui agit rate, il échoue ; s'il réussit et l'adversaire rate, il l'emporte ;
 *   si les deux réussissent, il l'emporte avec un dé inférieur ou égal.
 * - Ouvert : on relance (« egalite ») si les deux ratent, ou réussissent avec le même dé.
 */
export function resoudreOpposition(
  actif: ResultatCompetence,
  opposant: ResultatCompetence,
  ouverte: boolean,
): IssueOpposition {
  if (ouverte) {
    if (!actif.reussi && !opposant.reussi) return "egalite";
    if (actif.reussi !== opposant.reussi) return actif.reussi ? "actif" : "opposant";
    if (actif.garde === opposant.garde) return "egalite";
    return actif.garde < opposant.garde ? "actif" : "opposant";
  }
  if (!actif.reussi) return "opposant";
  if (!opposant.reussi) return "actif";
  return actif.garde <= opposant.garde ? "actif" : "opposant";
}

/** Nom affiché du camp d'un jet : le joueur concerné, « le MJ » pour un PNJ, ou l'auteur. */
export function nomCamp(entree: EntreeJournal): string {
  if (entree.pourNom) return entree.pourNom;
  return entree.auteurRole === "mj" ? "le MJ" : entree.auteurNom;
}

/** Vrai si on peut encore forcer la chance sur ce jet (règles seulement, sans les droits). */
export function peutForcer(entree: EntreeJournal): boolean {
  const r = entree.resultat;
  return (
    joueurConcerne(entree) !== null &&
    !entree.dejaForce &&
    entree.forceDe === null &&
    r !== null &&
    r.type === "competence" &&
    !r.reussi &&
    !r.demon
  );
}

/** Vrai si cette personne a le droit de forcer la chance sur ce jet : le joueur concerné, ou le MJ. */
export function peutForcerPar(entree: EntreeJournal, moi: { id: number; role: "mj" | "joueur" }): boolean {
  return peutForcer(entree) && (moi.role === "mj" || joueurConcerne(entree) === moi.id);
}
