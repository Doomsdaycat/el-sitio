// Mémoire de l'interface : dernières données reçues du serveur.
// Elle écoute le serveur dès le chargement de la page, pour ne rien perdre
// même si un message arrive avant que l'écran correspondant soit affiché.

import { useSyncExternalStore } from "react";
import type { EntreeJournal } from "../../shared/jets.ts";
import type { Invitation, Present } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";

interface Etat {
  presents: Present[] | null;
  invitations: Invitation[] | null;
  /** Du plus ancien au plus récent. */
  journal: EntreeJournal[] | null;
}

let etat: Etat = { presents: null, invitations: null, journal: null };
const abonnes = new Set<() => void>();

function modifier(changement: Partial<Etat>): void {
  etat = { ...etat, ...changement };
  abonnes.forEach((f) => f());
}

const TAILLE_MAX_JOURNAL = 200;

socket.on("presents", (presents) => modifier({ presents }));
socket.on("invitations", (invitations) => modifier({ invitations }));
socket.on("journal", (journal) => modifier({ journal }));
socket.on("journal:vide", () => modifier({ journal: [] }));
socket.on("journal:entree", (entree) => {
  const avant = etat.journal ?? [];
  const existe = avant.some((e) => e.id === entree.id);
  const journal = existe
    ? avant.map((e) => (e.id === entree.id ? entree : e))
    : [...avant, entree].slice(-TAILLE_MAX_JOURNAL);
  modifier({ journal });
});

function sAbonner(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Lit une partie de la mémoire et réaffiche le composant quand elle change. */
export function useEtat<K extends keyof Etat>(cle: K): Etat[K] {
  return useSyncExternalStore(sAbonner, () => etat[cle]);
}
