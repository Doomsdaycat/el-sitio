// Commande « npm run lien-mj » : réaffiche le lien MJ sans lancer le serveur.

import { base } from "./base.ts";
import { lienInvitation } from "./liens.ts";
import { jetonMj, partiePrincipale } from "./partie.ts";

const partie = partiePrincipale();
console.log(`\nLien MJ de la partie « ${partie.nom} » :\n\n  ${lienInvitation(jetonMj(partie.id))}\n`);
base.close();
