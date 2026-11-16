// Connexion temps réel unique entre le navigateur et le serveur.
// Socket.IO se reconnecte tout seul après une coupure.

import { io, type Socket } from "socket.io-client";
import type { AuthClient, MessagesClient, MessagesServeur } from "../../shared/messages.ts";

const CLE_MEMOIRE = "brumeland.jeton";

/**
 * Jeton d'invitation : il vient du lien (/jeu/<jeton>).
 * On le mémorise dans le navigateur pour qu'une visite sur l'adresse
 * de base ramène la personne à sa partie.
 */
function lireJeton(): string | null {
  const correspondance = window.location.pathname.match(/^\/jeu\/([A-Za-z0-9_-]+)\/?$/);
  if (correspondance) {
    const jeton = correspondance[1];
    try {
      localStorage.setItem(CLE_MEMOIRE, jeton);
    } catch {
      // Navigation privée ou stockage bloqué : sans gravité, le lien suffit.
    }
    return jeton;
  }
  try {
    const memorise = localStorage.getItem(CLE_MEMOIRE);
    if (memorise) {
      window.history.replaceState(null, "", `/jeu/${memorise}`);
      return memorise;
    }
  } catch {
    // idem
  }
  return null;
}

/** Oublie le jeton mémorisé (par exemple quand le lien n'est plus valide). */
export function oublierJeton(): void {
  try {
    localStorage.removeItem(CLE_MEMOIRE);
  } catch {
    // idem
  }
}

export const jeton = lireJeton();

const auth: AuthClient = jeton ? { jeton } : {};

export const socket: Socket<MessagesServeur, MessagesClient> = io({
  auth,
  autoConnect: jeton !== null,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
