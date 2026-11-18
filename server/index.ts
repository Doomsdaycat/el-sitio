// Point d'entrée du serveur Brumeland VTT.
// Il reçoit les connexions temps réel (Socket.IO) des navigateurs.

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { Server, type Socket } from "socket.io";
import {
  ERREUR_LIEN_INCONNU,
  ETIQUETTE_MAX,
  NOM_MAX,
  type AuthClient,
  type Identite,
  type Invitation,
  type Present,
  type MessagesClient,
  type MessagesServeur,
  type Reponse,
} from "../shared/messages.ts";
import { base, CHEMIN_BASE } from "./base.ts";
import { brancherFiches, diffuserFiche, envoyerFiches } from "./fiches-socket.ts";
import { ficheDuJoueur } from "./fiches.ts";
import { brancherCombat, diffuserCombat, envoyerCombat } from "./combat.ts";
import { brancherImages, brancherRoutesImages, envoyerImages } from "./images.ts";
import { apresNouveauJoueur, brancherScenes, diffuserScenes, envoyerScenes } from "./scenes.ts";
import { brancherJets, envoyerJournal, SALLE_JOUEURS, SALLE_MJ } from "./jets-socket.ts";
import { lienInvitation, MODE_PARTIE } from "./liens.ts";
import {
  changerNom,
  creerInvitation,
  jetonMj,
  listerInvitations,
  listerParticipants,
  nomDejaPris,
  noterVisite,
  partieCourante,
  participantParJeton,
  supprimerInvitation,
  type Participant,
} from "./partie.ts";

const PORT = Number(process.env.PORT ?? 3000);
const VERSION = "0.1.0";

/** Salle Socket.IO propre à un participant (il peut avoir plusieurs onglets ouverts). */
const salleParticipant = (id: number) => `participant:${id}`;

interface DonneesSocket {
  participant: Participant;
}

type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

const partie = partieCourante();

const app = express();
const serveurHttp = createServer(app);
const io = new Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>(
  serveurHttp,
);

app.get("/api/sante", (_req, res) => {
  res.json({ ok: true, version: VERSION });
});

// Images : dépôt par le MJ et lecture (avant l'interface, qui prend toutes les autres adresses).
brancherRoutesImages(app, io, partie.id);

// En mode partie, le serveur sert aussi l'interface compilée (un seul port à ouvrir).
const DOSSIER_INTERFACE = resolve(import.meta.dirname, "../dist/client");
if (MODE_PARTIE) {
  if (!existsSync(resolve(DOSSIER_INTERFACE, "index.html"))) {
    console.error("\nL'interface n'est pas compilée. Lance plutôt : npm start\n");
    process.exit(1);
  }
  app.use(express.static(DOSSIER_INTERFACE, { index: false }));
  // Toute autre adresse (par exemple /jeu/<jeton>) affiche la page de l'application.
  app.get("/{*chemin}", (_req, res) => {
    res.sendFile(resolve(DOSSIER_INTERFACE, "index.html"));
  });
}

// ---------------------------------------------------------------------------
// Diffusions

function invitationsPourMj(): Invitation[] {
  return listerInvitations(partie.id).map(({ jeton, ...reste }) => ({
    ...reste,
    lien: lienInvitation(jeton),
  }));
}

function diffuserInvitations(): void {
  io.to(SALLE_MJ).emit("invitations", invitationsPourMj());
}

/** Vrai si au moins un onglet de ce participant est connecté. */
function estConnecte(participantId: number): boolean {
  return (io.sockets.adapter.rooms.get(salleParticipant(participantId))?.size ?? 0) > 0;
}

/**
 * Liste des présents, pour tout le monde. On n'y montre pas les invitations jamais utilisées :
 * un joueur y apparaît dès qu'il a choisi son nom, ou tant qu'il est connecté.
 */
function listePresents(): Present[] {
  return listerParticipants(partie.id)
    .map((p) => ({ ...p, connecte: estConnecte(p.id) }))
    .filter((p) => p.nom !== null || p.connecte);
}

function diffuserPresents(): void {
  io.emit("presents", listePresents());
}

function identite(participant: Participant): Identite {
  return {
    version: VERSION,
    partie: { nom: partie.nom },
    moi: { id: participant.id, role: participant.role, nom: participant.nom },
  };
}

/** Nettoie un nom saisi : espaces superflus retirés, caractères invisibles refusés. */
function nettoyerNom(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const nom = brut.normalize("NFC").replace(/\s+/g, " ").trim();
  if (/[\p{Cc}\p{Cf}]/u.test(nom)) return null;
  return nom;
}

// ---------------------------------------------------------------------------
// Connexions

// Chaque connexion doit présenter un jeton d'invitation valide.
io.use((socket, suivant) => {
  const { jeton } = socket.handshake.auth as AuthClient;
  const participant = typeof jeton === "string" ? participantParJeton(jeton) : undefined;
  if (!participant || participant.partieId !== partie.id) {
    suivant(new Error(ERREUR_LIEN_INCONNU));
    return;
  }
  socket.data.participant = participant;
  suivant();
});

/** Enveloppe une action réservée au MJ : refuse si l'appelant n'est pas MJ. */
function reserveMj<D>(
  socket: SocketBrumeland,
  action: (demande: D) => Reponse | Promise<Reponse>,
) {
  return async (demande: D, reponse: (r: Reponse) => void) => {
    if (typeof reponse !== "function") return;
    if (socket.data.participant.role !== "mj") {
      reponse({ ok: false, erreur: "Action réservée au meneur de jeu." });
      return;
    }
    try {
      reponse(await action(demande));
    } catch (erreur) {
      console.error(erreur);
      reponse({ ok: false, erreur: "Erreur inattendue sur le serveur." });
    }
  };
}

io.on("connection", (socket) => {
  const { participant } = socket.data;
  const qui = () =>
    `${participant.nom ?? participant.etiquette ?? "(sans nom)"} [${participant.role}]`;
  console.log(`Connexion : ${qui()}`);
  noterVisite(participant.id);

  socket.join(salleParticipant(participant.id));
  socket.emit("bienvenue", identite(participant));

  if (participant.role === "mj") {
    socket.join(SALLE_MJ);
    socket.emit("invitations", invitationsPourMj());
  } else {
    socket.join(SALLE_JOUEURS);
    // Un joueur vient d'arriver : le MJ voit qu'il est « déjà venu ».
    diffuserInvitations();
  }
  // Tout le monde voit arriver cette personne, et elle reçoit la liste complète.
  diffuserPresents();
  envoyerJournal(socket, partie.id);
  envoyerFiches(socket, partie.id);
  envoyerImages(socket, partie.id);
  envoyerScenes(socket, partie.id);
  envoyerCombat(socket, partie.id);
  brancherJets(io, socket, partie.id);
  brancherFiches(io, socket, partie.id);
  brancherImages(io, socket, partie.id);
  brancherScenes(io, socket, partie.id);
  brancherCombat(io, socket, partie.id);

  socket.on("ping", (reponse) => {
    if (typeof reponse === "function") reponse(new Date().toISOString());
  });

  socket.on(
    "mj:creerInvitation",
    reserveMj(socket, (demande: { etiquette: string }) => {
      const brute = typeof demande?.etiquette === "string" ? demande.etiquette.trim() : "";
      if (brute.length > ETIQUETTE_MAX) {
        return { ok: false, erreur: `Étiquette trop longue (${ETIQUETTE_MAX} caractères au plus).` };
      }
      creerInvitation(partie.id, brute === "" ? null : brute);
      diffuserInvitations();
      return { ok: true };
    }),
  );

  socket.on(
    "mj:supprimerInvitation",
    reserveMj(socket, async (demande: { id: number }) => {
      const id = Number(demande?.id);
      if (!Number.isInteger(id) || !supprimerInvitation(partie.id, id)) {
        return { ok: false, erreur: "Cette invitation n'existe plus." };
      }
      // Le joueur concerné est déconnecté tout de suite, sur tous ses onglets.
      const salle = salleParticipant(id);
      io.to(salle).emit("exclu");
      io.in(salle).disconnectSockets(true);
      diffuserInvitations();
      diffuserPresents();
      io.emit("fiche:supprimee", id);
      diffuserScenes(io, partie.id);
      diffuserCombat(io, partie.id);
      return { ok: true };
    }),
  );

  socket.on("joueur:choisirNom", async (demande, reponse) => {
    if (typeof reponse !== "function") return;
    if (participant.role !== "joueur") {
      reponse({ ok: false, erreur: "Seuls les joueurs choisissent leur nom." });
      return;
    }
    const nom = nettoyerNom(demande?.nom);
    if (nom === null || nom === "") {
      reponse({ ok: false, erreur: "Écris un nom (lettres, chiffres, espaces…)." });
      return;
    }
    if (nom.length > NOM_MAX) {
      reponse({ ok: false, erreur: `Nom trop long (${NOM_MAX} caractères au plus).` });
      return;
    }
    if (nomDejaPris(partie.id, nom, participant.id)) {
      reponse({ ok: false, erreur: `« ${nom} » est déjà pris par quelqu'un d'autre.` });
      return;
    }
    changerNom(participant.id, nom);
    console.log(`Nom choisi : ${nom} [joueur]`);

    // Tous les onglets de ce joueur reçoivent sa nouvelle identité.
    const sockets = await io.in(salleParticipant(participant.id)).fetchSockets();
    for (const s of sockets) s.data.participant.nom = nom;
    io.to(salleParticipant(participant.id)).emit("bienvenue", identite({ ...participant, nom }));
    diffuserInvitations();
    diffuserPresents();
    // Première fois que le joueur choisit son nom : sa fiche (vide) apparaît chez tout le monde.
    diffuserFiche(io, ficheDuJoueur(partie.id, participant.id));
    apresNouveauJoueur(io, partie.id);
    reponse({ ok: true });
  });

  socket.on("disconnect", (raison) => {
    console.log(`Déconnexion : ${qui()} (${raison})`);
    // À ce moment, l'onglet a déjà quitté ses salles : le statut calculé est à jour.
    diffuserPresents();
  });
});

// ---------------------------------------------------------------------------
// Démarrage

// Arrêt propre (Ctrl + C) : la base est refermée, ce qui range toutes les dernières écritures
// dans data/brumeland.db. Une simple copie de ce fichier suffit alors comme sauvegarde.
let arretEnCours = false;
function arreter(): void {
  if (arretEnCours) return;
  arretEnCours = true;
  io.close();
  try {
    base.close();
  } catch (erreur) {
    console.error(erreur);
  }
  process.exit(0);
}
process.on("SIGINT", arreter);
process.on("SIGTERM", arreter);

serveurHttp.on("error", (erreur: NodeJS.ErrnoException) => {
  if (erreur.code === "EADDRINUSE") {
    console.error(
      `\nLe port ${PORT} est déjà utilisé : Brumeland tourne sans doute déjà dans un autre terminal.\n` +
        `Ferme-le (Ctrl + C dans ce terminal), puis relance la commande.\n`,
    );
    process.exit(1);
  }
  throw erreur;
});

serveurHttp.listen(PORT, () => {
  console.log(`Serveur Brumeland VTT démarré sur le port ${PORT}`);
  console.log(`Base de données : ${CHEMIN_BASE}`);
  console.log(`\nLien MJ de la partie « ${partie.nom} » :\n\n  ${lienInvitation(jetonMj(partie.id))}\n`);
  if (MODE_PARTIE) {
    console.log("La partie est lancée. Ouvre le lien MJ ci-dessus dans ton navigateur.");
    console.log("Pour arrêter : Ctrl + C dans ce terminal.\n");
  }
});
