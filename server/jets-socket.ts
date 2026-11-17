// Jets de dés et journal : réception des demandes et diffusion des résultats.

import type { Server, Socket } from "socket.io";
import { ETATS, LIBELLE_MAX, peutForcer, peutForcerPar, type EntreeJournal } from "../shared/jets.ts";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import { ErreurJet, jetCompetence, jetLibre } from "./des.ts";
import {
  derniersJets,
  enregistrerJet,
  marquerForce,
  revelerJet,
  trouverJet,
  viderJournal,
  vuePourJoueur,
} from "./journal.ts";
import { listerParticipants, type Participant } from "./partie.ts";

/** Salles Socket.IO : les navigateurs du MJ, et ceux des joueurs. */
export const SALLE_MJ = "mj";
export const SALLE_JOUEURS = "joueurs";

interface DonneesSocket {
  participant: Participant;
}
type Io = Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;
type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

/** Envoie un jet à chacun, dans la version qu'il a le droit de voir. */
function diffuserEntree(io: Io, entree: EntreeJournal): void {
  io.to(SALLE_MJ).emit("journal:entree", entree);
  io.to(SALLE_JOUEURS).emit("journal:entree", vuePourJoueur(entree));
}

/** Envoie le journal à un navigateur qui arrive (ou revient). */
export function envoyerJournal(socket: SocketBrumeland, partieId: number): void {
  const entrees = derniersJets(partieId);
  const pourMj = socket.data.participant.role === "mj";
  socket.emit("journal", pourMj ? entrees : entrees.map(vuePourJoueur));
}

function nettoyerLibelle(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const libelle = brut.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, LIBELLE_MAX);
  return libelle === "" ? null : libelle;
}

/** Exécute une action en transformant les erreurs en message pour l'interface. */
function proteger<D>(action: (demande: D) => Reponse) {
  return (demande: D, reponse: (r: Reponse) => void) => {
    if (typeof reponse !== "function") return;
    try {
      reponse(action(demande));
    } catch (erreur) {
      if (erreur instanceof ErreurJet) {
        reponse({ ok: false, erreur: erreur.message });
      } else {
        console.error(erreur);
        reponse({ ok: false, erreur: "Erreur inattendue sur le serveur." });
      }
    }
  };
}

export function brancherJets(io: Io, socket: SocketBrumeland, partieId: number): void {
  const moi = () => socket.data.participant;
  const estMj = () => moi().role === "mj";

  /** Vérifications communes à tous les jets. Renvoie un message d'erreur, ou null. */
  function refusJet(secret: unknown): string | null {
    if (moi().role === "joueur" && moi().nom === null) return "Choisis d'abord ton nom.";
    if (secret === true && !estMj()) return "Seul le meneur de jeu peut lancer en secret.";
    return null;
  }

  /**
   * Joueur pour qui le MJ lance. Renvoie null pour un jet de PNJ ou de monstre,
   * ou un message d'erreur si la demande n'est pas valable.
   */
  function lirePour(pourId: unknown): { id: number; nom: string } | null | string {
    if (pourId === null || pourId === undefined) return null;
    if (!estMj()) return "Seul le meneur de jeu peut lancer pour quelqu'un d'autre.";
    const joueur = listerParticipants(partieId).find(
      (p) => p.id === Number(pourId) && p.role === "joueur" && p.nom !== null,
    );
    if (!joueur || joueur.nom === null) return "Ce joueur n'existe plus.";
    return { id: joueur.id, nom: joueur.nom };
  }

  function enregistrerEtDiffuser(
    libelle: unknown,
    secret: boolean,
    resultat: Parameters<typeof enregistrerJet>[0]["resultat"],
    pour: { id: number; nom: string } | null,
  ): void {
    const entree = enregistrerJet({
      partieId,
      auteurId: moi().id,
      auteurNom: moi().nom ?? "Meneur de jeu",
      auteurRole: moi().role,
      libelle: nettoyerLibelle(libelle),
      secret,
      resultat,
      pourId: pour?.id ?? null,
      pourNom: pour?.nom ?? null,
    });
    diffuserEntree(io, entree);
  }

  socket.on(
    "jet:competence",
    proteger((d: Parameters<MessagesClient["jet:competence"]>[0]) => {
      const refus = refusJet(d?.secret);
      if (refus) return { ok: false, erreur: refus };
      const pour = lirePour(d?.pourId);
      if (typeof pour === "string") return { ok: false, erreur: pour };
      const resultat = jetCompetence({
        valeur: Number(d?.valeur),
        faveurs: Number(d?.faveurs ?? 0),
        fleaux: Number(d?.fleaux ?? 0),
      });
      enregistrerEtDiffuser(d?.libelle, d?.secret === true, resultat, pour);
      return { ok: true };
    }),
  );

  socket.on(
    "jet:libre",
    proteger((d: Parameters<MessagesClient["jet:libre"]>[0]) => {
      const refus = refusJet(d?.secret);
      if (refus) return { ok: false, erreur: refus };
      const pour = lirePour(d?.pourId);
      if (typeof pour === "string") return { ok: false, erreur: pour };
      const resultat = jetLibre(d?.formule);
      enregistrerEtDiffuser(d?.libelle, d?.secret === true, resultat, pour);
      return { ok: true };
    }),
  );

  socket.on(
    "jet:forcer",
    proteger((d: Parameters<MessagesClient["jet:forcer"]>[0]) => {
      const id = Number(d?.id);
      const origine = Number.isInteger(id) ? trouverJet(partieId, id) : undefined;
      if (!origine) return { ok: false, erreur: "Ce jet n'existe plus." };
      if (origine.dejaForce) return { ok: false, erreur: "La chance a déjà été forcée sur ce jet." };
      if (origine.resultat?.type !== "competence" || !peutForcer(origine)) {
        return { ok: false, erreur: "On ne peut pas forcer la chance sur ce jet." };
      }
      if (!peutForcerPar(origine, moi())) {
        return { ok: false, erreur: "Tu ne peux forcer la chance que sur les jets de ton personnage." };
      }
      if (origine.secret && !origine.revele && !estMj()) {
        return { ok: false, erreur: "Ce jet est secret." };
      }
      const etat = ETATS.find((e) => e.id === d?.etat);
      if (!etat) return { ok: false, erreur: "Choisis un état dans la liste." };
      if (!marquerForce(partieId, id)) {
        return { ok: false, erreur: "La chance a déjà été forcée sur ce jet." };
      }

      // Nouvelle tentative : on relance tous les dés, avec les mêmes faveurs et fléaux.
      const { valeur, faveurs, fleaux } = origine.resultat;
      const resultat = jetCompetence({ valeur, faveurs, fleaux });
      diffuserEntree(io, { ...origine, dejaForce: true });
      // La nouvelle tentative appartient au même personnage que le jet d'origine,
      // quelle que soit la personne qui a cliqué (le joueur ou le MJ).
      const tentative = enregistrerJet({
        partieId,
        auteurId: origine.auteurId,
        auteurNom: origine.auteurNom,
        auteurRole: origine.auteurRole,
        libelle: origine.libelle,
        secret: origine.secret && !origine.revele,
        resultat,
        forceDe: id,
        etat: etat.id,
        pourId: origine.pourId,
        pourNom: origine.pourNom,
      });
      diffuserEntree(io, tentative);
      return { ok: true };
    }),
  );

  socket.on(
    "mj:revelerJet",
    proteger((d: { id: number }) => {
      if (!estMj()) return { ok: false, erreur: "Action réservée au meneur de jeu." };
      const id = Number(d?.id);
      if (!Number.isInteger(id) || !revelerJet(partieId, id)) {
        return { ok: false, erreur: "Ce jet n'est plus à révéler." };
      }
      const entree = trouverJet(partieId, id);
      if (entree) diffuserEntree(io, entree);
      return { ok: true };
    }),
  );

  socket.on(
    "mj:viderJournal",
    proteger(() => {
      if (!estMj()) return { ok: false, erreur: "Action réservée au meneur de jeu." };
      viderJournal(partieId);
      io.emit("journal:vide");
      return { ok: true };
    }),
  );
}
