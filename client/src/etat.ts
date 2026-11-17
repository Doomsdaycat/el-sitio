// Mémoire de l'interface : dernières données reçues du serveur.
// Elle écoute le serveur dès le chargement de la page, pour ne rien perdre
// même si un message arrive avant que l'écran correspondant soit affiché.

import { useSyncExternalStore } from "react";
import type { Case } from "../../shared/carte.ts";
import type { Fiche } from "../../shared/fiche.ts";
import type { EntreeJournal } from "../../shared/jets.ts";
import type { Invitation, Present } from "../../shared/messages.ts";
import type { ImageBibliotheque, Scene } from "../../shared/scenes.ts";
import { socket } from "./connexion.ts";

/** Réglages du prochain jet, partagés entre le panneau de jet et la fiche. */
export interface ReglagesJet {
  faveurs: number;
  fleaux: number;
  /** MJ seulement. */
  secret: boolean;
  /** MJ seulement : la réponse en cours est une opposition ouverte. */
  ouverte: boolean;
}

/** Règle de mesure tenue par quelqu'un d'autre. */
export interface RegleDistante {
  sceneId: string;
  auteurId: number;
  auteur: string;
  de: Case;
  a: Case;
}

/** Signal « regardez ici » sur la carte. */
export interface Pointeur {
  cle: number;
  sceneId: string;
  auteur: string;
  x: number;
  y: number;
}

interface Etat {
  /** Toutes les scènes (MJ seulement). */
  scenes: Scene[] | null;
  /** MJ : scène ouverte pour la préparer sans la montrer (sinon null). */
  scenePreparee: string | null;
  reglesDistantes: RegleDistante[];
  pointeurs: Pointeur[];
  /** Scène montrée à tous par le MJ. */
  scene: Scene | null;
  /** Bibliothèque d'images (MJ seulement). */
  images: ImageBibliotheque[] | null;
  reglages: ReglagesJet;
  /** Une fiche par joueur, dans l'ordre des invitations. */
  fiches: Fiche[] | null;
  /** Jet auquel on s'apprête à s'opposer (choisi dans le journal), sinon null. */
  cibleOpposition: EntreeJournal | null;
  presents: Present[] | null;
  invitations: Invitation[] | null;
  /** Du plus ancien au plus récent. */
  journal: EntreeJournal[] | null;
}

let etat: Etat = {
  scenes: null,
  scenePreparee: null,
  reglesDistantes: [],
  pointeurs: [],
  scene: null,
  images: null,
  reglages: { faveurs: 0, fleaux: 0, secret: false, ouverte: false },
  fiches: null,
  cibleOpposition: null,
  presents: null,
  invitations: null,
  journal: null,
};
const abonnes = new Set<() => void>();

function modifier(changement: Partial<Etat>): void {
  etat = { ...etat, ...changement };
  abonnes.forEach((f) => f());
}

const TAILLE_MAX_JOURNAL = 200;

socket.on("presents", (presents) => modifier({ presents }));
socket.on("invitations", (invitations) => modifier({ invitations }));
socket.on("journal", (journal) => modifier({ journal }));
socket.on("fiches", (fiches) => modifier({ fiches }));
socket.on("scene", (scene) => modifier({ scene }));
socket.on("images", (images) => modifier({ images }));
socket.on("scenes", (scenes) => {
  // Si la scène en préparation a été supprimée, on la ferme.
  const preparee = etat.scenePreparee && scenes.some((s) => s.id === etat.scenePreparee) ? etat.scenePreparee : null;
  modifier({ scenes, scenePreparee: preparee });
});
socket.on("carte:regle", ({ sceneId, auteurId, auteur, mesure }) => {
  const autres = etat.reglesDistantes.filter((r) => r.auteurId !== auteurId);
  modifier({ reglesDistantes: mesure ? [...autres, { sceneId, auteurId, auteur, ...mesure }] : autres });
});
socket.on("carte:pointeur", ({ sceneId, auteur, x, y }) => ajouterPointeur(sceneId, auteur, x, y));

/** MJ : ouvre une scène pour la préparer (ou null pour revenir à la scène montrée). */
export function preparerScene(id: string | null): void {
  modifier({ scenePreparee: id });
}

let prochaineCle = 1;
/** Affiche un pointeur pendant quelques secondes (le sien ou celui de quelqu'un d'autre). */
export function ajouterPointeur(sceneId: string, auteur: string, x: number, y: number): void {
  const cle = prochaineCle++;
  modifier({ pointeurs: [...etat.pointeurs, { cle, sceneId, auteur, x, y }] });
  window.setTimeout(() => modifier({ pointeurs: etat.pointeurs.filter((p) => p.cle !== cle) }), 3000);
}
socket.on("fiche", (fiche) => {
  const avant = etat.fiches ?? [];
  const existe = avant.some((f) => f.joueurId === fiche.joueurId);
  const fiches = existe
    ? avant.map((f) => (f.joueurId === fiche.joueurId ? fiche : f))
    : [...avant, fiche].sort((a, b) => a.joueurId - b.joueurId);
  modifier({ fiches });
});
socket.on("fiche:supprimee", (joueurId) =>
  modifier({ fiches: (etat.fiches ?? []).filter((f) => f.joueurId !== joueurId) }),
);
socket.on("journal:vide", () => modifier({ journal: [], cibleOpposition: null }));
socket.on("journal:entree", (entree) => {
  const avant = etat.journal ?? [];
  const existe = avant.some((e) => e.id === entree.id);
  const journal = existe
    ? avant.map((e) => (e.id === entree.id ? entree : e))
    : [...avant, entree].slice(-TAILLE_MAX_JOURNAL);
  modifier({ journal });
});

/** Choisit le jet auquel s'opposer (ou null pour annuler). */
export function choisirCibleOpposition(cible: EntreeJournal | null): void {
  modifier({ cibleOpposition: cible, reglages: { ...etat.reglages, ouverte: false } });
}

export function changerReglages(changement: Partial<ReglagesJet>): void {
  modifier({ reglages: { ...etat.reglages, ...changement } });
}

/** Après un jet réussi : faveurs et fléaux valent pour un seul jet, l'opposition est faite. */
export function apresJet(): void {
  modifier({
    reglages: { ...etat.reglages, faveurs: 0, fleaux: 0, ouverte: false },
    cibleOpposition: null,
  });
}

function sAbonner(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Lit une partie de la mémoire et réaffiche le composant quand elle change. */
export function useEtat<K extends keyof Etat>(cle: K): Etat[K] {
  return useSyncExternalStore(sAbonner, () => etat[cle]);
}
