// Fiches de personnage : réception des modifications et diffusion à tous.
// Tout le monde voit toutes les fiches ; seuls le joueur concerné et le MJ les modifient.

import type { Server, Socket } from "socket.io";
import { appliquerModification, ErreurFiche, type Fiche, type ModificationFiche } from "../shared/fiche.ts";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import { enregistrerFiche, lireFiche, toutesLesFiches } from "./fiches.ts";
import type { Participant } from "./partie.ts";

interface DonneesSocket {
  participant: Participant;
}
type Io = Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;
type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

export function diffuserFiche(io: Io, fiche: Fiche): void {
  io.emit("fiche", fiche);
}

export function envoyerFiches(socket: SocketBrumeland, partieId: number): void {
  socket.emit("fiches", toutesLesFiches(partieId));
}

/** Vrai si cette personne peut modifier (et lancer depuis) la fiche de ce joueur. */
export function peutGererFiche(moi: Participant, joueurId: number): boolean {
  return moi.role === "mj" || moi.id === joueurId;
}

export function brancherFiches(io: Io, socket: SocketBrumeland, partieId: number): void {
  socket.on("fiche:modifier", (demande, reponse) => {
    if (typeof reponse !== "function") return;
    const repondre = (r: Reponse) => reponse(r);
    try {
      const joueurId = Number(demande?.joueurId);
      const fiche = Number.isInteger(joueurId) ? lireFiche(partieId, joueurId) : undefined;
      if (!fiche) return repondre({ ok: false, erreur: "Cette fiche n'existe plus." });
      if (!peutGererFiche(socket.data.participant, joueurId)) {
        return repondre({ ok: false, erreur: "Tu ne peux modifier que la fiche de ton personnage." });
      }
      const nouvelle = appliquerModification(fiche, demande.modification as ModificationFiche);
      enregistrerFiche(partieId, nouvelle);
      diffuserFiche(io, nouvelle);
      repondre({ ok: true });
    } catch (erreur) {
      if (erreur instanceof ErreurFiche) {
        repondre({ ok: false, erreur: erreur.message });
      } else {
        console.error(erreur);
        repondre({ ok: false, erreur: "Erreur inattendue sur le serveur." });
      }
    }
  });
}
