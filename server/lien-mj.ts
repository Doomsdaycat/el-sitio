// Commande « npm run lien-mj » : réaffiche le lien MJ sans lancer le serveur.

import { lienInvitation } from "./liens.ts";
import { jetonMj, partieCourante } from "./partie.ts";

const partie = partieCourante();
console.log(`\nLien MJ de la partie « ${partie.nom} » :\n\n  ${lienInvitation(jetonMj(partie.id))}\n`);
