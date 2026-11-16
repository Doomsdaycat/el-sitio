// Construction des liens d'invitation.

/** Vrai en mode « partie » (npm start) : le serveur sert lui-même l'interface compilée. */
export const MODE_PARTIE = process.env.NODE_ENV === "production";

/**
 * Adresse de base des liens :
 * - BRUMELAND_ADRESSE si elle est fournie (adresse publique du tunnel, étape 1.7) ;
 * - sinon, en mode partie, le serveur lui-même (port 3000) ;
 * - sinon, en développement, l'interface Vite (port 5173).
 */
export function adresseDeBase(): string {
  const parDefaut = MODE_PARTIE
    ? `http://localhost:${process.env.PORT ?? 3000}`
    : "http://localhost:5173";
  return (process.env.BRUMELAND_ADRESSE ?? parDefaut).replace(/\/+$/, "");
}

export function lienInvitation(jeton: string): string {
  return `${adresseDeBase()}/jeu/${jeton}`;
}
