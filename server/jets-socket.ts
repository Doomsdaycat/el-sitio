// Jets de dés et journal : réception des demandes et diffusion des résultats.

import type { Server, Socket } from "socket.io";
import { appliquerModification, ErreurFiche, preparerJetFiche, type CibleJetFiche } from "../shared/fiche.ts";
import {
  BONUS_MAX,
  ETATS,
  joueurConcerne,
  LIBELLE_MAX,
  oppositionPermetDeForcer,
  peutForcer,
  peutForcerPar,
  type EntreeJournal,
} from "../shared/jets.ts";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import { ErreurJet, jetCompetence, jetLibre } from "./des.ts";
import {
  derniersJets,
  enregistrerJet,
  marquerForce,
  opposantDe,
  revelerJet,
  trouverJet,
  viderJournal,
  vuePourJoueur,
} from "./journal.ts";
import { diffuserFiche, peutGererFiche } from "./fiches-socket.ts";
import { enregistrerFiche, lireFiche } from "./fiches.ts";
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
      if (erreur instanceof ErreurJet || erreur instanceof ErreurFiche) {
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
    if (secret === true && !estMj()) return "Seul le Meneur de jeu peut lancer en secret.";
    return null;
  }

  /**
   * Joueur pour qui le MJ lance. Renvoie null pour un jet de PNJ ou de monstre,
   * ou un message d'erreur si la demande n'est pas valable.
   */
  function lirePour(pourId: unknown): { id: number; nom: string } | null | string {
    if (pourId === null || pourId === undefined) return null;
    if (!estMj()) return "Seul le Meneur de jeu peut lancer pour quelqu'un d'autre.";
    const joueur = listerParticipants(partieId).find(
      (p) => p.id === Number(pourId) && p.role === "joueur" && p.nom !== null,
    );
    if (!joueur || joueur.nom === null) return "Ce joueur n'existe plus.";
    return { id: joueur.id, nom: joueur.nom };
  }

  /**
   * Jet en opposition : vérifie le jet visé et renvoie son id d'origine,
   * null pour un jet ordinaire, ou un message d'erreur.
   */
  function lireOpposition(
    opposeA: unknown,
    ouverte: unknown,
  ): { id: number; ouverte: boolean } | null | string {
    if (opposeA === null || opposeA === undefined) return null;
    const vise = trouverJet(partieId, Number(opposeA));
    // On s'oppose toujours au jet d'origine, même si on a cliqué sur sa nouvelle tentative.
    const cible = vise && vise.forceDe !== null ? trouverJet(partieId, vise.forceDe) : vise;
    if (!cible) return "Ce jet n'existe plus.";
    if (cible.resultat?.type !== "competence") {
      return "On ne peut s'opposer qu'à un jet de compétence ou de caractéristique.";
    }
    if (cible.opposeA !== null) return "Ce jet est déjà une réponse à un autre jet.";
    if (opposantDe(partieId, cible.id)) return "Quelqu'un s'oppose déjà à ce jet.";
    if (cible.secret && !cible.revele && !estMj()) return "Ce jet est secret.";
    if (!estMj() && joueurConcerne(cible) === moi().id) {
      return "Tu ne peux pas t'opposer à ton propre jet.";
    }
    if (ouverte === true && !estMj()) return "Seul le Meneur de jeu décide d'une opposition ouverte.";
    return { id: cible.id, ouverte: ouverte === true };
  }

  function enregistrerEtDiffuser(
    libelle: unknown,
    secret: boolean,
    resultat: Parameters<typeof enregistrerJet>[0]["resultat"],
    pour: { id: number; nom: string } | null,
    opposition: { id: number; ouverte: boolean } | null = null,
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
      opposeA: opposition?.id ?? null,
      ouverte: opposition?.ouverte ?? false,
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
      const opposition = lireOpposition(d?.opposeA, d?.ouverte);
      if (typeof opposition === "string") return { ok: false, erreur: opposition };
      const resultat = jetCompetence({
        valeur: Number(d?.valeur),
        faveurs: Number(d?.faveurs ?? 0),
        fleaux: Number(d?.fleaux ?? 0),
      });
      try {
        enregistrerEtDiffuser(d?.libelle, d?.secret === true, resultat, pour, opposition);
      } catch (erreur) {
        // Deux réponses au même jet presque en même temps : la base n'en garde qu'une.
        if (opposition && String(erreur).includes("UNIQUE")) {
          return { ok: false, erreur: "Quelqu'un s'oppose déjà à ce jet." };
        }
        throw erreur;
      }
      return { ok: true };
    }),
  );

  socket.on(
    "jet:fiche",
    proteger((d: Parameters<MessagesClient["jet:fiche"]>[0]) => {
      const refus = refusJet(d?.secret);
      if (refus) return { ok: false, erreur: refus };
      const joueurId = Number(d?.joueurId);
      const fiche = Number.isInteger(joueurId) ? lireFiche(partieId, joueurId) : undefined;
      if (!fiche) return { ok: false, erreur: "Cette fiche n'existe plus." };
      if (!peutGererFiche(moi(), joueurId)) {
        return { ok: false, erreur: "Tu ne peux lancer que depuis la fiche de ton personnage." };
      }
      const opposition = lireOpposition(d?.opposeA, d?.ouverte);
      if (typeof opposition === "string") return { ok: false, erreur: opposition };

      // Valeur et états lus sur la fiche, côté serveur : un état ajoute un fléau.
      const { libelle, valeur, etat } = preparerJetFiche(fiche, d?.cible as CibleJetFiche);
      const fleauxDemandes = Number(d?.fleaux ?? 0);
      const resultat = jetCompetence({
        valeur,
        faveurs: Number(d?.faveurs ?? 0),
        fleaux: etat ? Math.min(BONUS_MAX, fleauxDemandes + 1) : fleauxDemandes,
      });
      resultat.fleauEtat = etat;

      // Le MJ qui lance depuis la fiche d'un joueur lance « pour » ce joueur.
      const pour = estMj() ? lirePour(joueurId) : null;
      if (typeof pour === "string") return { ok: false, erreur: pour };
      try {
        enregistrerEtDiffuser(libelle, d?.secret === true, resultat, pour, opposition);
      } catch (erreur) {
        if (opposition && String(erreur).includes("UNIQUE")) {
          return { ok: false, erreur: "Quelqu'un s'oppose déjà à ce jet." };
        }
        throw erreur;
      }
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
      if (!oppositionPermetDeForcer(origine, opposantDe(partieId, id))) {
        return {
          ok: false,
          erreur:
            origine.opposeA !== null
              ? "Dans un jet en opposition, seul celui qui agit peut forcer la chance."
              : "Ton adversaire a déjà lancé : il est trop tard pour forcer la chance.",
        };
      }
      const etat = ETATS.find((e) => e.id === d?.etat);
      if (!etat) return { ok: false, erreur: "Choisis un état dans la liste." };

      // L'état est noté sur la fiche du personnage : il ne doit pas déjà le subir.
      const concerne = joueurConcerne(origine);
      const fiche = concerne !== null ? lireFiche(partieId, concerne) : undefined;
      if (fiche && fiche.etats.length >= ETATS.length) {
        return { ok: false, erreur: "Les six états sont déjà subis : impossible de forcer la chance." };
      }
      if (fiche?.etats.includes(etat.id)) {
        return { ok: false, erreur: `${etat.nom} est déjà subi : choisis un autre état.` };
      }
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
      if (fiche) {
        const avecEtat = appliquerModification(fiche, { champ: "etat", etat: etat.id, actif: true });
        enregistrerFiche(partieId, avecEtat);
        diffuserFiche(io, avecEtat);
      }
      return { ok: true };
    }),
  );

  socket.on(
    "mj:revelerJet",
    proteger((d: { id: number }) => {
      if (!estMj()) return { ok: false, erreur: "Action réservée au Meneur de jeu." };
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
      if (!estMj()) return { ok: false, erreur: "Action réservée au Meneur de jeu." };
      viderJournal(partieId);
      io.emit("journal:vide");
      return { ok: true };
    }),
  );
}
