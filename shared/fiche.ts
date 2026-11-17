// Fiches de personnage : contenu, valeurs calculées et modifications autorisées.
// Partagé entre le serveur (qui valide et enregistre) et l'interface (qui affiche).

import { ETATS, type IdEtat } from "./jets.ts";

export const CARACS = ["FOR", "CON", "AGI", "INT", "VOL", "CHA"] as const;
export type Carac = (typeof CARACS)[number];

export const NOMS_CARACS: Record<Carac, string> = {
  FOR: "Force",
  CON: "Constitution",
  AGI: "Agilité",
  INT: "Intelligence",
  VOL: "Volonté",
  CHA: "Charisme",
};

export const FAMILLES = [
  { id: "humain", nom: "Humain", deplacement: 10 },
  { id: "halfelin", nom: "Halfelin", deplacement: 8 },
  { id: "nain", nom: "Nain", deplacement: 8 },
  { id: "elfe", nom: "Elfe", deplacement: 10 },
  { id: "colvert", nom: "Colvert", deplacement: 8 },
  { id: "lupin", nom: "Lupin", deplacement: 12 },
] as const;

export const PROFESSIONS = [
  "Artisan",
  "Barde",
  "Chasseur",
  "Chevalier",
  "Combattant",
  "Érudit",
  "Mage",
  "Marchand",
  "Marin",
  "Voleur",
] as const;

export const AGES = ["Jeune", "Adulte", "Âgé"] as const;

/** Les 30 compétences de base du livre, avec leur caractéristique. */
export const COMPETENCES = [
  { id: "acrobatie", nom: "Acrobatie", carac: "AGI", arme: false },
  { id: "artisanat", nom: "Artisanat", carac: "FOR", arme: false },
  { id: "bluff", nom: "Bluff", carac: "CHA", arme: false },
  { id: "chasse-peche", nom: "Chasse et pêche", carac: "AGI", arme: false },
  { id: "connaissance-betes", nom: "Connaissance des bêtes", carac: "INT", arme: false },
  { id: "dexterite", nom: "Dextérité", carac: "AGI", arme: false },
  { id: "discretion", nom: "Discrétion", carac: "AGI", arme: false },
  { id: "equitation", nom: "Équitation", carac: "AGI", arme: false },
  { id: "esquive", nom: "Esquive", carac: "AGI", arme: false },
  { id: "intuition", nom: "Intuition", carac: "INT", arme: false },
  { id: "langues", nom: "Langues", carac: "INT", arme: false },
  { id: "marchandage", nom: "Marchandage", carac: "CHA", arme: false },
  { id: "mythes-legendes", nom: "Mythes et légendes", carac: "INT", arme: false },
  { id: "natation", nom: "Natation", carac: "AGI", arme: false },
  { id: "navigation", nom: "Navigation", carac: "INT", arme: false },
  { id: "perception", nom: "Perception", carac: "INT", arme: false },
  { id: "persuasion", nom: "Persuasion", carac: "CHA", arme: false },
  { id: "representation", nom: "Représentation", carac: "CHA", arme: false },
  { id: "soins", nom: "Soins", carac: "INT", arme: false },
  { id: "survie", nom: "Survie", carac: "INT", arme: false },
  { id: "arbaletes", nom: "Arbalètes", carac: "AGI", arme: true },
  { id: "arcs", nom: "Arcs", carac: "AGI", arme: true },
  { id: "bagarre", nom: "Bagarre", carac: "FOR", arme: true },
  { id: "batons", nom: "Bâtons", carac: "AGI", arme: true },
  { id: "couteaux", nom: "Couteaux", carac: "AGI", arme: true },
  { id: "epees", nom: "Épées", carac: "FOR", arme: true },
  { id: "fronde", nom: "Fronde", carac: "AGI", arme: true },
  { id: "haches", nom: "Haches", carac: "FOR", arme: true },
  { id: "lances", nom: "Lances", carac: "FOR", arme: true },
  { id: "marteaux", nom: "Marteaux", carac: "FOR", arme: true },
] as const satisfies readonly { id: string; nom: string; carac: Carac; arme: boolean }[];

export type IdCompetence = (typeof COMPETENCES)[number]["id"];

export const TEXTES = [
  { id: "capacites", nom: "Capacités et sorts" },
  { id: "armes", nom: "Armes et armure" },
  { id: "inventaire", nom: "Inventaire" },
  { id: "notes", nom: "Notes" },
] as const;
export type IdTexte = (typeof TEXTES)[number]["id"];

export const CARAC_MIN = 1;
export const CARAC_MAX = 18;
export const NIVEAU_MIN = 1;
export const NIVEAU_MAX = 18;
export const TEXTE_COURT_MAX = 60;
export const TEXTE_LONG_MAX = 5000;
export const ECOLES_MAX = 6;

/** École de magie : compétence secondaire (INT), sans chance de base. */
export interface Ecole {
  id: string;
  nom: string;
  niveau: number;
}

export interface Fiche {
  /** Id du joueur (participant) à qui appartient la fiche. */
  joueurId: number;
  nomPersonnage: string;
  famille: string;
  profession: string;
  age: string;
  caracs: Record<Carac, number>;
  psActuels: number;
  pvActuels: number;
  etats: IdEtat[];
  /** Niveau de chaque compétence ; absente = chance de base. */
  competences: Partial<Record<IdCompetence, number>>;
  ecoles: Ecole[];
  textes: Record<IdTexte, string>;
}

export function ficheVide(joueurId: number): Fiche {
  return {
    joueurId,
    nomPersonnage: "",
    famille: "",
    profession: "",
    age: "",
    caracs: { FOR: 10, CON: 10, AGI: 10, INT: 10, VOL: 10, CHA: 10 },
    psActuels: 10,
    pvActuels: 10,
    etats: [],
    competences: {},
    ecoles: [],
    textes: { capacites: "", armes: "", inventaire: "", notes: "" },
  };
}

// ---------------------------------------------------------------------------
// Valeurs calculées (règles du livre, chapitre 2)

export const psMax = (f: Fiche): number => f.caracs.CON;
export const pvMax = (f: Fiche): number => f.caracs.VOL;

/** Chance de base d'une compétence selon la caractéristique : 3, 4, 5, 6 ou 7. */
export function chanceDeBase(valeurCarac: number): number {
  if (valeurCarac <= 5) return 3;
  if (valeurCarac <= 8) return 4;
  if (valeurCarac <= 12) return 5;
  if (valeurCarac <= 15) return 6;
  return 7;
}

/** Déplacement : base de la famille, modifiée par l'AGI. null si la famille n'est pas choisie. */
export function deplacement(f: Fiche): number | null {
  const famille = FAMILLES.find((x) => x.id === f.famille);
  if (!famille) return null;
  const agi = f.caracs.AGI;
  let modif = 0;
  if (agi <= 6) modif = -4;
  else if (agi <= 9) modif = -2;
  else if (agi >= 16) modif = 4;
  else if (agi >= 13) modif = 2;
  return famille.deplacement + modif;
}

/** Bonus aux dégâts d'une caractéristique (FOR ou AGI) : null, « D4 » ou « D6 ». */
export function bonusDegats(valeur: number): "D4" | "D6" | null {
  if (valeur >= 17) return "D6";
  if (valeur >= 13) return "D4";
  return null;
}

/** Niveau d'une compétence : celui de la fiche, sinon la chance de base. */
export function niveauCompetence(f: Fiche, id: IdCompetence): { niveau: number; base: boolean } {
  const competence = COMPETENCES.find((c) => c.id === id)!;
  const niveau = f.competences[id];
  if (niveau !== undefined) return { niveau, base: false };
  return { niveau: chanceDeBase(f.caracs[competence.carac]), base: true };
}

/** État qui inflige un fléau aux jets de cette caractéristique, s'il est subi. */
export function etatGenant(f: Fiche, carac: Carac): IdEtat | null {
  const etat = ETATS.find((e) => e.carac === carac);
  return etat && f.etats.includes(etat.id) ? etat.id : null;
}

/** Nom affiché d'une fiche : le nom du personnage, ou à défaut celui du joueur. */
export function nomFiche(f: Fiche, nomJoueur: string | null): string {
  return f.nomPersonnage.trim() || `Personnage de ${nomJoueur ?? "?"}`;
}

// ---------------------------------------------------------------------------
// Modifications

export type ModificationFiche =
  | { champ: "nomPersonnage" | "famille" | "profession" | "age"; valeur: string }
  | { champ: "carac"; carac: Carac; valeur: number }
  | { champ: "ps" | "pv"; valeur: number }
  | { champ: "etat"; etat: IdEtat; actif: boolean }
  | { champ: "competence"; id: IdCompetence; valeur: number | null }
  | { champ: "ajouterEcole"; nom: string; niveau: number }
  | { champ: "ecole"; id: string; nom: string; niveau: number }
  | { champ: "retirerEcole"; id: string }
  | { champ: "texte"; id: IdTexte; valeur: string };

export class ErreurFiche extends Error {}

function entier(valeur: unknown, min: number, max: number, quoi: string): number {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErreurFiche(`${quoi} : un nombre entier de ${min} à ${max}.`);
  }
  return n;
}

function texte(valeur: unknown, max: number, quoi: string): string {
  if (typeof valeur !== "string") throw new ErreurFiche(`${quoi} : texte attendu.`);
  const propre = valeur.normalize("NFC");
  if (propre.length > max) throw new ErreurFiche(`${quoi} : ${max} caractères au plus.`);
  return propre;
}

const ligne = (valeur: unknown, quoi: string) =>
  texte(valeur, TEXTE_COURT_MAX, quoi).replace(/\s+/g, " ").trim();

/**
 * Applique une modification à une fiche et renvoie la nouvelle fiche.
 * Lance ErreurFiche si la modification n'est pas valable. La fiche d'origine n'est pas modifiée.
 */
export function appliquerModification(
  avant: Fiche,
  m: ModificationFiche,
  nouvelId: () => string = () => Math.random().toString(36).slice(2, 10),
): Fiche {
  const f: Fiche = structuredClone(avant);
  switch (m?.champ) {
    case "nomPersonnage":
      f.nomPersonnage = ligne(m.valeur, "Nom du personnage");
      break;
    case "famille": {
      const v = String(m.valeur ?? "");
      if (v !== "" && !FAMILLES.some((x) => x.id === v)) throw new ErreurFiche("Famille inconnue.");
      f.famille = v;
      break;
    }
    case "profession":
      f.profession = ligne(m.valeur, "Profession");
      break;
    case "age": {
      const v = String(m.valeur ?? "");
      if (v !== "" && !(AGES as readonly string[]).includes(v)) throw new ErreurFiche("Âge inconnu.");
      f.age = v;
      break;
    }
    case "carac": {
      if (!CARACS.includes(m.carac)) throw new ErreurFiche("Caractéristique inconnue.");
      f.caracs[m.carac] = entier(m.valeur, CARAC_MIN, CARAC_MAX, m.carac);
      // Les PS et PV actuels ne peuvent pas dépasser leur maximum.
      f.psActuels = Math.min(f.psActuels, psMax(f));
      f.pvActuels = Math.min(f.pvActuels, pvMax(f));
      break;
    }
    case "ps":
      f.psActuels = entier(m.valeur, 0, psMax(f), "Points de santé");
      break;
    case "pv":
      f.pvActuels = entier(m.valeur, 0, pvMax(f), "Points de volonté");
      break;
    case "etat": {
      if (!ETATS.some((e) => e.id === m.etat)) throw new ErreurFiche("État inconnu.");
      const sans = f.etats.filter((e) => e !== m.etat);
      f.etats = m.actif === true ? [...sans, m.etat] : sans;
      // Ordre du livre, pour un affichage stable.
      f.etats = ETATS.map((e) => e.id).filter((id) => f.etats.includes(id));
      break;
    }
    case "competence": {
      if (!COMPETENCES.some((c) => c.id === m.id)) throw new ErreurFiche("Compétence inconnue.");
      if (m.valeur === null) delete f.competences[m.id];
      else f.competences[m.id] = entier(m.valeur, NIVEAU_MIN, NIVEAU_MAX, "Niveau");
      break;
    }
    case "ajouterEcole": {
      if (f.ecoles.length >= ECOLES_MAX) throw new ErreurFiche(`${ECOLES_MAX} écoles au plus.`);
      const nom = ligne(m.nom, "École de magie");
      if (nom === "") throw new ErreurFiche("Donne un nom à l'école de magie.");
      f.ecoles.push({ id: nouvelId(), nom, niveau: entier(m.niveau, NIVEAU_MIN, NIVEAU_MAX, "Niveau") });
      break;
    }
    case "ecole": {
      const ecole = f.ecoles.find((e) => e.id === m.id);
      if (!ecole) throw new ErreurFiche("Cette école n'existe plus.");
      const nom = ligne(m.nom, "École de magie");
      if (nom === "") throw new ErreurFiche("Donne un nom à l'école de magie.");
      ecole.nom = nom;
      ecole.niveau = entier(m.niveau, NIVEAU_MIN, NIVEAU_MAX, "Niveau");
      break;
    }
    case "retirerEcole":
      f.ecoles = f.ecoles.filter((e) => e.id !== m.id);
      break;
    case "texte": {
      if (!TEXTES.some((t) => t.id === m.id)) throw new ErreurFiche("Zone de texte inconnue.");
      f.textes[m.id] = texte(m.valeur, TEXTE_LONG_MAX, "Texte");
      break;
    }
    default:
      throw new ErreurFiche("Modification inconnue.");
  }
  return f;
}

// ---------------------------------------------------------------------------
// Jets depuis la fiche

export type CibleJetFiche =
  | { type: "competence"; id: IdCompetence }
  | { type: "carac"; carac: Carac }
  | { type: "ecole"; id: string };

/**
 * Ce qu'on lance en cliquant sur la fiche : libellé, valeur, et l'état qui ajoute un fléau.
 * Les écoles de magie dépendent de l'INT.
 */
export function preparerJetFiche(
  f: Fiche,
  cible: CibleJetFiche,
): { libelle: string; valeur: number; etat: IdEtat | null } {
  if (cible?.type === "carac") {
    if (!CARACS.includes(cible.carac)) throw new ErreurFiche("Caractéristique inconnue.");
    return {
      libelle: `${NOMS_CARACS[cible.carac]} (${cible.carac})`,
      valeur: f.caracs[cible.carac],
      etat: etatGenant(f, cible.carac),
    };
  }
  if (cible?.type === "competence") {
    const c = COMPETENCES.find((x) => x.id === cible.id);
    if (!c) throw new ErreurFiche("Compétence inconnue.");
    return { libelle: c.nom, valeur: niveauCompetence(f, c.id).niveau, etat: etatGenant(f, c.carac) };
  }
  if (cible?.type === "ecole") {
    const e = f.ecoles.find((x) => x.id === cible.id);
    if (!e) throw new ErreurFiche("Cette école n'existe plus.");
    return { libelle: e.nom, valeur: e.niveau, etat: etatGenant(f, "INT") };
  }
  throw new ErreurFiche("Jet inconnu.");
}
