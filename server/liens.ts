// Construction des liens d'invitation.

/**
 * Adresse de base des liens. En développement, c'est l'interface Vite (port 5173).
 * Elle sera remplacée par l'adresse du tunnel à l'étape 1.7.
 */
export function adresseDeBase(): string {
  return (process.env.BRUMELAND_ADRESSE ?? "http://localhost:5173").replace(/\/+$/, "");
}

export function lienInvitation(jeton: string): string {
  return `${adresseDeBase()}/jeu/${jeton}`;
}
