// Point d'entrée du serveur Brumeland VTT.
// Il reçoit les connexions temps réel (Socket.IO) des navigateurs.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { FICHIER_PID } from "./chemins.ts";
import { brancherRoutesExport, brancherRoutesImport } from "./export.ts";
import { demarrerSauvegardesAuto } from "./sauvegardes.ts";
import { brancherFiches, diffuserFiche, envoyerFiches } from "./fiches-socket.ts";
import { ficheDuJoueur } from "./fiches.ts";
import { brancherCombat, diffuserCombat, envoyerCombat } from "./combat.ts";
import { brancherImages, brancherRoutesImages, envoyerImages } from "./images.ts";
import { apresNouveauJoueur, brancherScenes, diffuserScenes, envoyerScenes } from "./scenes.ts";
import { brancherJets, envoyerJournal } from "./jets-socket.ts";
import { salleJoueurs, salleMj, salleParticipant, sallePartie } from "./salles.ts";
import { lienInvitation, MODE_PARTIE } from "./liens.ts";
import {
  changerNom,
  creerInvitation,
  jetonMj,
  listerInvitations,
  listerParticipants,
  nomDejaPris,
  noterVisite,
  ordonnerInvitations,
  partieParId,
  partiePrincipale,
  participantParJeton,
  supprimerInvitation,
  type Participant,
} from "./partie.ts";

const PORT = Number(process.env.PORT ?? 3000);
const VERSION = (JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")) as { version: string }).version;

interface DonneesSocket {
  participant: Participant;
}

type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

/** Partie principale : créée au premier lancement, c'est elle qu'on installe sur un serveur neuf. */
const partie = partiePrincipale();

const app = express();
const serveurHttp = createServer(app);
const io = new Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>(
  serveurHttp,
);

app.get("/api/sante", (_req, res) => {
  res.json({ ok: true, version: VERSION });
});

// Images : dépôt par le MJ et lecture (avant l'interface, qui prend toutes les autres adresses).
brancherRoutesImages(app, io);
// Export de la partie en .zip (MJ seulement).
brancherRoutesExport(app);
// Import d'un export .zip : le serveur redémarre pour l'appliquer (code de sortie 75).
brancherRoutesImport(app, partie.id, () => arreter(CODE_REDEMARRAGE));

// En mode partie, le serveur sert aussi l'interface compilée (un seul port à ouvrir).
const DOSSIER_INTERFACE = resolve(import.meta.dirname, "../dist/client");
if (MODE_PARTIE) {
  if (!existsSync(resolve(DOSSIER_INTERFACE, "index.html"))) {
    console.error("\nL'interface n'est pas compilée. Lance plutôt : npm start\n");
    process.exit(1);
  }
  app.use(express.static(DOSSIER_INTERFACE, { index: false }));
  // Lien d'invitation tapé autrement (majuscules, sans tirets) ou ancien lien long :
  // redirection vers le lien exact, que le navigateur mémorise ensuite.
  app.get("/jeu/:jeton", (req, res, suite) => {
    const participant = participantParJeton(req.params.jeton);
    if (participant && participant.jeton !== req.params.jeton) res.redirect(302, `/jeu/${participant.jeton}`);
    else suite();
  });
  // Toute autre adresse (par exemple /jeu/<jeton>) affiche la page de l'application.
  app.get("/{*chemin}", (_req, res) => {
    res.sendFile(resolve(DOSSIER_INTERFACE, "index.html"));
  });
}

// ---------------------------------------------------------------------------
// Diffusions

// Chaque partie a ses propres salles : rien ne passe d'une partie à l'autre.

function invitationsPourMj(partieId: number): Invitation[] {
  return listerInvitations(partieId).map(({ jeton, ...reste }) => ({
    ...reste,
    lien: lienInvitation(jeton),
  }));
}

function diffuserInvitations(partieId: number): void {
  io.to(salleMj(partieId)).emit("invitations", invitationsPourMj(partieId));
}

/** Vrai si au moins un onglet de ce participant est connecté. */
function estConnecte(participantId: number): boolean {
  return (io.sockets.adapter.rooms.get(salleParticipant(participantId))?.size ?? 0) > 0;
}

/**
 * Liste des présents, pour tout le monde. On n'y montre pas les invitations jamais utilisées :
 * un joueur y apparaît dès qu'il a choisi son nom, ou tant qu'il est connecté.
 */
function listePresents(partieId: number): Present[] {
  return listerParticipants(partieId)
    .map((p) => ({ ...p, connecte: estConnecte(p.id) }))
    .filter((p) => p.nom !== null || p.connecte);
}

function diffuserPresents(partieId: number): void {
  io.to(sallePartie(partieId)).emit("presents", listePresents(partieId));
}

function identite(participant: Participant): Identite {
  return {
    version: VERSION,
    partie: { nom: partieParId(participant.partieId)?.nom ?? "" },
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
  if (!participant) {
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
      reponse({ ok: false, erreur: "Action réservée au Meneur de jeu." });
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
  const partieId = participant.partieId;
  const qui = () =>
    `${participant.nom ?? participant.etiquette ?? "(sans nom)"} [${participant.role}]`;
  console.log(`Connexion : ${qui()}`);
  noterVisite(participant.id);

  socket.join([sallePartie(partieId), salleParticipant(participant.id)]);
  socket.emit("bienvenue", identite(participant));

  if (participant.role === "mj") {
    socket.join(salleMj(partieId));
    socket.emit("invitations", invitationsPourMj(partieId));
  } else {
    socket.join(salleJoueurs(partieId));
    // Un joueur vient d'arriver : le MJ voit qu'il est « déjà venu ».
    diffuserInvitations(partieId);
  }
  // Tout le monde voit arriver cette personne, et elle reçoit la liste complète.
  diffuserPresents(partieId);
  envoyerJournal(socket, partieId);
  envoyerFiches(socket, partieId);
  envoyerImages(socket, partieId);
  envoyerScenes(socket, partieId);
  envoyerCombat(socket, partieId);
  brancherJets(io, socket, partieId);
  brancherFiches(io, socket, partieId);
  brancherImages(io, socket, partieId);
  brancherScenes(io, socket, partieId);
  brancherCombat(io, socket, partieId);

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
      creerInvitation(partieId, brute === "" ? null : brute);
      diffuserInvitations(partieId);
      return { ok: true };
    }),
  );

  socket.on(
    "mj:ordonnerInvitations",
    reserveMj(socket, (demande: { ids: number[] }) => {
      const ids = Array.isArray(demande?.ids) ? demande.ids.map(Number) : [];
      if (!ordonnerInvitations(partieId, ids)) {
        return { ok: false, erreur: "La liste des invitations a changé entre-temps : réessaie." };
      }
      diffuserInvitations(partieId);
      return { ok: true };
    }),
  );

  socket.on(
    "mj:supprimerInvitation",
    reserveMj(socket, async (demande: { id: number }) => {
      const id = Number(demande?.id);
      if (!Number.isInteger(id) || !supprimerInvitation(partieId, id)) {
        return { ok: false, erreur: "Cette invitation n'existe plus." };
      }
      // Le joueur concerné est déconnecté tout de suite, sur tous ses onglets.
      const salle = salleParticipant(id);
      io.to(salle).emit("exclu");
      io.in(salle).disconnectSockets(true);
      diffuserInvitations(partieId);
      diffuserPresents(partieId);
      io.to(sallePartie(partieId)).emit("fiche:supprimee", id);
      diffuserScenes(io, partieId);
      diffuserCombat(io, partieId);
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
    if (nomDejaPris(partieId, nom, participant.id)) {
      reponse({ ok: false, erreur: `« ${nom} » est déjà pris par quelqu'un d'autre.` });
      return;
    }
    changerNom(participant.id, nom);
    console.log(`Nom choisi : ${nom} [joueur]`);

    // Tous les onglets de ce joueur reçoivent sa nouvelle identité.
    const sockets = await io.in(salleParticipant(participant.id)).fetchSockets();
    for (const s of sockets) s.data.participant.nom = nom;
    io.to(salleParticipant(participant.id)).emit("bienvenue", identite({ ...participant, nom }));
    diffuserInvitations(partieId);
    diffuserPresents(partieId);
    // Première fois que le joueur choisit son nom : sa fiche (vide) apparaît chez tout le monde.
    diffuserFiche(io, partieId, ficheDuJoueur(partieId, participant.id));
    apresNouveauJoueur(io, partieId);
    reponse({ ok: true });
  });

  socket.on("disconnect", (raison) => {
    console.log(`Déconnexion : ${qui()} (${raison})`);
    // À ce moment, l'onglet a déjà quitté ses salles : le statut calculé est à jour.
    diffuserPresents(partieId);
  });
});

// ---------------------------------------------------------------------------
// Démarrage

// Sauvegardes automatiques : au démarrage, toutes les 30 minutes si la partie a changé,
// et à l'arrêt. Elles sont rangées dans data/sauvegardes/.
const sauvegardeFinale = demarrerSauvegardesAuto(base);

// Arrêt propre (Ctrl + C) : dernière sauvegarde, puis la base est refermée, ce qui range
// toutes les dernières écritures dans data/brumeland.db.
/** Code de sortie qui demande à être relancé (après un import de partie). */
const CODE_REDEMARRAGE = 75;

let arretEnCours = false;
function arreter(code = 0): void {
  if (arretEnCours) return;
  arretEnCours = true;
  io.close();
  try {
    sauvegardeFinale();
    if (readFileSync(FICHIER_PID, "utf8").trim() === String(process.pid)) rmSync(FICHIER_PID);
  } catch {
    // Fichier déjà absent : rien à faire.
  }
  try {
    base.close();
  } catch (erreur) {
    console.error(erreur);
  }
  if (code === CODE_REDEMARRAGE) console.log("\nPartie importée : redémarrage du serveur…\n");
  process.exit(code);
}
process.on("SIGINT", () => arreter());
process.on("SIGTERM", () => arreter());

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
  // Signale que le serveur tourne : la commande de restauration refuse alors d'agir.
  writeFileSync(FICHIER_PID, String(process.pid));
  console.log(`Serveur Brumeland VTT démarré sur le port ${PORT}`);
  console.log(`Base de données : ${CHEMIN_BASE}`);
  console.log(`\nLien MJ de la partie « ${partie.nom} » :\n\n  ${lienInvitation(jetonMj(partie.id))}\n`);
  if (MODE_PARTIE) {
    console.log("La partie est lancée. Ouvre le lien MJ ci-dessus dans ton navigateur.");
    console.log("Pour arrêter : Ctrl + C dans ce terminal.\n");
  }
});
