// Salles Socket.IO : chaque partie a les siennes, pour que les nouvelles d'une partie
// n'arrivent jamais dans une autre.

/** Tous les navigateurs d'une partie (MJ et joueurs). */
export const sallePartie = (partieId: number) => `partie:${partieId}`;
/** Les navigateurs du MJ d'une partie. */
export const salleMj = (partieId: number) => `partie:${partieId}:mj`;
/** Les navigateurs des joueurs d'une partie. */
export const salleJoueurs = (partieId: number) => `partie:${partieId}:joueurs`;
/** Les onglets d'un même participant (les numéros de participant sont uniques, toutes parties confondues). */
export const salleParticipant = (participantId: number) => `participant:${participantId}`;
