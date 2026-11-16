// Messages échangés entre le serveur et l'interface.
// Ce fichier est partagé : le serveur et l'interface utilisent les mêmes définitions.

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

/** Réponse du serveur à une demande : soit c'est bon, soit un message d'erreur en français. */
export type Reponse = { ok: true } | { ok: false; erreur: string };

/** Longueur maximale de l'étiquette d'une invitation. */
export const ETIQUETTE_MAX = 40;

/** Messages envoyés par le serveur vers l'interface. */
export interface MessagesServeur {
  bienvenue: (identite: Identite) => void;
  /** Liste complète des invitations, envoyée au MJ à chaque changement. */
  invitations: (liste: Invitation[]) => void;
  /** Le lien de ce navigateur vient d'être supprimé par le MJ. */
  exclu: () => void;
}

/** Messages envoyés par l'interface vers le serveur. */
export interface MessagesClient {
  ping: (reponse: (heureServeur: string) => void) => void;
  "mj:creerInvitation": (demande: { etiquette: string }, reponse: (r: Reponse) => void) => void;
  "mj:supprimerInvitation": (demande: { id: number }, reponse: (r: Reponse) => void) => void;
}

/** Données jointes par l'interface à chaque connexion. */
export interface AuthClient {
  jeton?: string;
}

/** Message d'erreur renvoyé quand le lien n'est pas reconnu. */
export const ERREUR_LIEN_INCONNU = "lien-inconnu";
