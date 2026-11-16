// Point d'entrée du serveur Brumeland VTT.
// Il reçoit les connexions temps réel (Socket.IO) des navigateurs.

import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import {
  ERREUR_LIEN_INCONNU,
  type AuthClient,
  type MessagesClient,
  type MessagesServeur,
} from "../shared/messages.ts";
import { CHEMIN_BASE } from "./base.ts";
import { lienInvitation } from "./liens.ts";
import {
  jetonMj,
  noterVisite,
  partieCourante,
  participantParJeton,
  type Participant,
} from "./partie.ts";

const PORT = Number(process.env.PORT ?? 3000);
const VERSION = "0.1.0";

interface DonneesSocket {
  participant: Participant;
}

const partie = partieCourante();

const app = express();
const serveurHttp = createServer(app);
const io = new Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>(
  serveurHttp,
);

app.get("/api/sante", (_req, res) => {
  res.json({ ok: true, version: VERSION });
});

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

io.on("connection", (socket) => {
  const { participant } = socket.data;
  const qui = `${participant.nom ?? "(sans nom)"} [${participant.role}]`;
  console.log(`Connexion : ${qui}`);
  noterVisite(participant.id);

  socket.emit("bienvenue", {
    version: VERSION,
    partie: { nom: partie.nom },
    moi: { role: participant.role, nom: participant.nom },
  });

  socket.on("ping", (reponse) => reponse(new Date().toISOString()));

  socket.on("disconnect", (raison) => {
    console.log(`Déconnexion : ${qui} (${raison})`);
  });
});

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
});
