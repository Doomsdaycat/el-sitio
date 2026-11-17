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
}

/** Vrai si l'auteur de ce jet peut encore forcer la chance dessus. */
export function peutForcer(entree: EntreeJournal): boolean {
  const r = entree.resultat;
  return (
    entree.auteurRole === "joueur" &&
    !entree.dejaForce &&
    entree.forceDe === null &&
    r !== null &&
    r.type === "competence" &&
    !r.reussi &&
    !r.demon
  );
}
