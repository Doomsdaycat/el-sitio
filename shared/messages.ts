// Messages échangés entre le serveur et l'interface.
// Ce fichier est partagé : le serveur et l'interface utilisent les mêmes définitions.

export type Role = "mj" | "joueur";

/** Ce que le serveur dit à un navigateur sur lui-même, juste après la connexion. */
export interface Identite {
  version: string;
  partie: { nom: string };
  moi: { role: Role; nom: string | null };
}

/** Messages envoyés par le serveur vers l'interface. */
export interface MessagesServeur {
  bienvenue: (identite: Identite) => void;
}

/** Messages envoyés par l'interface vers le serveur. */
export interface MessagesClient {
  ping: (reponse: (heureServeur: string) => void) => void;
}

/** Données jointes par l'interface à chaque connexion. */
export interface AuthClient {
  jeton?: string;
}

/** Message d'erreur renvoyé quand le lien n'est pas reconnu. */
export const ERREUR_LIEN_INCONNU = "lien-inconnu";
