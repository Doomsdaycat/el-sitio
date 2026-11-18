// Messages échangés entre le serveur et l'interface.
// Ce fichier est partagé : le serveur et l'interface utilisent les mêmes définitions.

import type { Case, EtatPion, Grille } from "./carte.ts";
import type { Combat } from "./combat.ts";
import type { CibleJetFiche, Fiche, ModificationFiche } from "./fiche.ts";
import type { EntreeJournal, IdEtat } from "./jets.ts";
import type { ImageBibliotheque, Scene, TypeScene } from "./scenes.ts";

export type Role = "mj" | "joueur";

/** Ce que le serveur dit à un navigateur sur lui-même, juste après la connexion. */
export interface Identite {
  version: string;
  partie: { nom: string };
  moi: { id: number; role: Role; nom: string | null };
}

/** Une invitation de joueur, telle que le MJ la voit (lien compris). Réservé au MJ. */
export interface Invitation {
  id: number;
  /** Note privée du MJ, par exemple « pour Julien ». */
  etiquette: string | null;
  /** Nom choisi par le joueur (null tant qu'il n'est pas venu). */
  nom: string | null;
  lien: string;
  dejaVenu: boolean;
}

/** Une personne de la partie, telle que tout le monde la voit (liste des présents). */
export interface Present {
  id: number;
  role: Role;
  /** null : joueur arrivé, qui n'a pas encore choisi son nom. */
  nom: string | null;
  connecte: boolean;
}

/** Réponse du serveur à une demande : soit c'est bon, soit un message d'erreur en français. */
/** Réponse du serveur : c'est bon (avec parfois l'identifiant créé), ou un message d'erreur. */
export type Reponse = { ok: true; id?: string } | { ok: false; erreur: string };

/** Longueur maximale de l'étiquette d'une invitation. */
export const ETIQUETTE_MAX = 40;

/** Longueur maximale du nom choisi par un joueur. */
export const NOM_MAX = 24;

/** Messages envoyés par le serveur vers l'interface. */
export interface MessagesServeur {
  bienvenue: (identite: Identite) => void;
  /** Liste complète des invitations, envoyée au MJ à chaque changement. */
  invitations: (liste: Invitation[]) => void;
  /** Liste des participants et de leur statut, envoyée à tous à chaque changement. */
  presents: (liste: Present[]) => void;
  /** Les derniers jets (du plus ancien au plus récent), envoyés à l'arrivée. */
  journal: (entrees: EntreeJournal[]) => void;
  /** Un jet nouveau ou modifié (révélé, chance forcée) : remplace celui de même id. */
  "journal:entree": (entree: EntreeJournal) => void;
  /** Le MJ a vidé le journal. */
  "journal:vide": () => void;
  /** Toutes les fiches de personnage, envoyées à l'arrivée. */
  fiches: (fiches: Fiche[]) => void;
  /** Une fiche nouvelle ou modifiée : remplace celle du même joueur. */
  fiche: (fiche: Fiche) => void;
  /** La fiche de ce joueur a disparu (invitation supprimée). */
  "fiche:supprimee": (joueurId: number) => void;
  /** Bibliothèque d'images (MJ seulement). */
  images: (images: ImageBibliotheque[]) => void;
  /** Scène montrée à tous (ou aucune). */
  scene: (scene: Scene | null) => void;
  /** Toutes les scènes (MJ seulement). */
  scenes: (scenes: Scene[]) => void;
  /** Règle de mesure tenue par quelqu'un d'autre dans une scène (mesure null : il l'a lâchée). */
  "carte:regle": (r: {
    sceneId: string;
    auteurId: number;
    auteur: string;
    mesure: { de: Case; a: Case } | null;
  }) => void;
  /** Quelqu'un montre un endroit d'une scène (en pixels de l'image). */
  "carte:pointeur": (p: { sceneId: string; auteurId: number; auteur: string; x: number; y: number }) => void;
  /** Combat en cours (null : pas de combat). Les joueurs reçoivent une version sans secrets. */
  combat: (combat: Combat | null) => void;
  /** Le lien de ce navigateur vient d'être supprimé par le MJ. */
  exclu: () => void;
}

/** Messages envoyés par l'interface vers le serveur. */
export interface MessagesClient {
  ping: (reponse: (heureServeur: string) => void) => void;
  "mj:creerInvitation": (demande: { etiquette: string }, reponse: (r: Reponse) => void) => void;
  "mj:supprimerInvitation": (demande: { id: number }, reponse: (r: Reponse) => void) => void;
  "jet:competence": (
    demande: {
      libelle: string;
      valeur: number;
      faveurs: number;
      fleaux: number;
      secret: boolean;
      /** MJ seulement : id du joueur pour qui il lance (null ou absent : PNJ ou monstre). */
      pourId?: number | null;
      /** Jet en opposition : id du jet auquel on s'oppose. */
      opposeA?: number | null;
      /** MJ seulement : opposition ouverte (personne n'agit). */
      ouverte?: boolean;
    },
    reponse: (r: Reponse) => void,
  ) => void;
  "jet:libre": (
    demande: { libelle: string; formule: string; secret: boolean; pourId?: number | null },
    reponse: (r: Reponse) => void,
  ) => void;
  /** Forcer la chance sur un de ses jets ratés, en choisissant un état. */
  "jet:forcer": (demande: { id: number; etat: IdEtat }, reponse: (r: Reponse) => void) => void;
  "fiche:modifier": (
    demande: { joueurId: number; modification: ModificationFiche },
    reponse: (r: Reponse) => void,
  ) => void;
  /** Jet en un clic depuis une fiche : le serveur lit la valeur et les états sur la fiche. */
  "jet:fiche": (
    demande: {
      joueurId: number;
      cible: CibleJetFiche;
      faveurs: number;
      fleaux: number;
      secret: boolean;
      opposeA?: number | null;
      ouverte?: boolean;
    },
    reponse: (r: Reponse) => void,
  ) => void;
  "mj:creerScene": (
    demande: { nom: string; type: TypeScene; imageId: string },
    reponse: (r: Reponse) => void,
  ) => void;
  "mj:modifierScene": (
    demande: { id: string; nom?: string; type?: TypeScene; imageId?: string },
    reponse: (r: Reponse) => void,
  ) => void;
  "mj:supprimerScene": (demande: { id: string }, reponse: (r: Reponse) => void) => void;
  /** Nouvel ordre de « Mes scènes » : tous les identifiants, du haut vers le bas. */
  "mj:ordonnerScenes": (demande: { ids: string[] }, reponse: (r: Reponse) => void) => void;
  /** Montrer une scène à tous (id), ou ne plus rien montrer (null). */
  "mj:montrerScene": (demande: { id: string | null }, reponse: (r: Reponse) => void) => void;
  "mj:renommerImage": (demande: { id: string; nom: string }, reponse: (r: Reponse) => void) => void;
  "mj:supprimerImage": (demande: { id: string }, reponse: (r: Reponse) => void) => void;
  /** Grille d'une image (partagée par toutes les scènes qui l'utilisent). */
  "mj:grille": (demande: { imageId: string; grille: Grille }, reponse: (r: Reponse) => void) => void;
  "mj:ajouterPion": (
    demande: {
      sceneId: string;
      nom: string;
      couleur: string;
      taille: number;
      col: number;
      lig: number;
      /** Ajouter le pion caché aux joueurs. */
      cache?: boolean;
    },
    reponse: (r: Reponse) => void,
  ) => void;
  /** État d'un pion (mort, à terre) ou pion caché aux joueurs. */
  "mj:modifierPion": (
    demande: { id: string; etat?: EtatPion; cache?: boolean },
    reponse: (r: Reponse) => void,
  ) => void;
  "mj:retirerPion": (demande: { id: string }, reponse: (r: Reponse) => void) => void;
  "carte:deplacerPion": (demande: { id: string; col: number; lig: number }, reponse: (r: Reponse) => void) => void;
  /** Règle de mesure en cours dans une scène (null quand on la lâche). Pas de réponse : envoi fréquent. */
  "carte:regle": (d: { sceneId: string; mesure: { de: Case; a: Case } | null }) => void;
  "carte:pointeur": (point: { sceneId: string; x: number; y: number }) => void;
  // --- Combat (MJ)
  "mj:combat:commencer": (d: Record<string, never>, reponse: (r: Reponse) => void) => void;
  "mj:combat:finir": (d: Record<string, never>, reponse: (r: Reponse) => void) => void;
  "mj:combat:ajouterJoueurs": (d: Record<string, never>, reponse: (r: Reponse) => void) => void;
  "mj:combat:ajouterPnj": (
    d: { nom: string; nbCartes: number; psMax: number | null },
    reponse: (r: Reponse) => void,
  ) => void;
  "mj:combat:ajouterPionsScene": (d: Record<string, never>, reponse: (r: Reponse) => void) => void;
  "mj:combat:retirer": (d: { id: string }, reponse: (r: Reponse) => void) => void;
  "mj:combat:modifier": (
    d: { id: string; nbCartes?: number; surprise?: boolean; ps?: { actuels: number; max: number } | null },
    reponse: (r: Reponse) => void,
  ) => void;
  /** Tirer l'initiative (premier round, ou round suivant). */
  "mj:combat:tirer": (d: Record<string, never>, reponse: (r: Reponse) => void) => void;
  "mj:combat:retourner": (d: { valeur: number; jouee: boolean }, reponse: (r: Reponse) => void) => void;
  // --- Combat (joueur pour son personnage, ou MJ)
  "combat:choisirCarte": (d: { combattantId: string; valeur: number }, reponse: (r: Reponse) => void) => void;
  "combat:terminerTour": (d: Record<string, never>, reponse: (r: Reponse) => void) => void;
  "combat:attendre": (d: { valeur: number }, reponse: (r: Reponse) => void) => void;
  "combat:reaction": (d: { combattantId: string }, reponse: (r: Reponse) => void) => void;
  "combat:course": (d: { combattantId: string; course: boolean }, reponse: (r: Reponse) => void) => void;
  "mj:revelerJet": (demande: { id: number }, reponse: (r: Reponse) => void) => void;
  "mj:viderJournal": (demande: Record<string, never>, reponse: (r: Reponse) => void) => void;
  /** Le joueur choisit (ou change) son nom. */
  "joueur:choisirNom": (demande: { nom: string }, reponse: (r: Reponse) => void) => void;
}

/** Données jointes par l'interface à chaque connexion. */
export interface AuthClient {
  jeton?: string;
}

/** Message d'erreur renvoyé quand le lien n'est pas reconnu. */
export const ERREUR_LIEN_INCONNU = "lien-inconnu";
