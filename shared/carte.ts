// Carte de combat : grille, pions et distances. Partagé entre le serveur et l'interface.
//
// Règles du livre (chapitre 4) : une case = 2 m × 2 m ; on peut se déplacer en diagonale.
// Choix validé avec Antoine : une diagonale compte 2 m, comme un pas tout droit
// (le livre compte une case diagonale comme « à moins de deux mètres » pour le corps à corps).

export const METRES_PAR_CASE = 2;

/** Grille posée sur l'image, en pixels de l'image d'origine. */
export interface Grille {
  /** Côté d'une case. */
  taille: number;
  /** Décalage du coin d'une case par rapport au coin haut-gauche de l'image (0 ≤ décalage < taille). */
  decalageX: number;
  decalageY: number;
  visible: boolean;
}

export const GRILLE_PAR_DEFAUT: Grille = { taille: 70, decalageX: 0, decalageY: 0, visible: true };
export const TAILLE_CASE_MIN = 10;
export const TAILLE_CASE_MAX = 1000;

export type TypePion = "pj" | "pnj";

/**
 * État d'un pion : « mort » pour un PNJ ou un monstre, « à terre » pour un personnage joueur
 * (à zéro PS, il peut encore être sauvé).
 */
export type EtatPion = "normal" | "mort" | "a-terre";

/** États possibles selon le type de pion. */
export const ETATS_PION: Record<TypePion, EtatPion[]> = {
  pnj: ["normal", "mort"],
  pj: ["normal", "a-terre"],
};

export interface Pion {
  id: string;
  type: TypePion;
  /** Pion de personnage joueur : son joueur (son nom vient de la fiche). */
  joueurId: number | null;
  /** Nom d'un pion de PNJ ou de monstre (vide pour un personnage joueur). */
  nom: string;
  couleur: string;
  /** Côté en cases : 1 (humanoïde), 2 ou 3 (grands monstres). */
  taille: 1 | 2 | 3;
  /** Case du coin haut-gauche. */
  col: number;
  lig: number;
  etat: EtatPion;
  /** PNJ caché aux joueurs (le MJ le voit en transparence ; les joueurs ne le reçoivent pas). */
  cache: boolean;
}

export interface EtatCarte {
  image: { id: string; nom: string } | null;
  grille: Grille;
  pions: Pion[];
}

export interface Case {
  col: number;
  lig: number;
}

export const COULEURS_PIONS = [
  { id: "#c9a25b", nom: "Or" },
  { id: "#4f8fd9", nom: "Bleu" },
  { id: "#6fbf73", nom: "Vert" },
  { id: "#b07cd8", nom: "Violet" },
  { id: "#e08a4f", nom: "Orange" },
  { id: "#4fc1c1", nom: "Turquoise" },
  { id: "#d9645a", nom: "Rouge" },
  { id: "#8a8a8a", nom: "Gris" },
  { id: "#3a3a3a", nom: "Noir" },
  { id: "#f0f0f0", nom: "Blanc" },
] as const;

/** Couleur des pions de personnages joueurs, attribuée dans l'ordre des joueurs. */
export const COULEURS_PJ = COULEURS_PIONS.slice(0, 6).map((c) => c.id);
export const COULEUR_PNJ = "#d9645a";

export const CASE_MAX = 999;
export const NOM_PION_MAX = 30;

/** Distance en cases entre deux cases : une diagonale compte comme un pas. */
export function distanceCases(a: Case, b: Case): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.lig - b.lig));
}

export function distanceMetres(a: Case, b: Case): number {
  return distanceCases(a, b) * METRES_PAR_CASE;
}

/** Case qui contient un point de l'image (en pixels de l'image). */
export function caseSous(x: number, y: number, g: Grille): Case {
  return {
    col: Math.floor((x - g.decalageX) / g.taille),
    lig: Math.floor((y - g.decalageY) / g.taille),
  };
}

/** Coin haut-gauche d'une case, en pixels de l'image. */
export function coinCase(c: Case, g: Grille): { x: number; y: number } {
  return { x: g.decalageX + c.col * g.taille, y: g.decalageY + c.lig * g.taille };
}

/** Ramène un décalage entre 0 et la taille d'une case (la grille se répète). */
export function normaliserDecalage(decalage: number, taille: number): number {
  return ((decalage % taille) + taille) % taille;
}
