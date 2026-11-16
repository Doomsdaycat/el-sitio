// Messages échangés entre le serveur et l'interface.
// Ce fichier est partagé : le serveur et l'interface utilisent les mêmes définitions.

/** Messages envoyés par le serveur vers l'interface. */
export interface MessagesServeur {
  bienvenue: (infos: { version: string; heureServeur: string }) => void;
}

/** Messages envoyés par l'interface vers le serveur. */
export interface MessagesClient {
  ping: (reponse: (heureServeur: string) => void) => void;
}
