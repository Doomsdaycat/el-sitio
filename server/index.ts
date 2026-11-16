// Point d'entrée du serveur Brumeland VTT.
// Il reçoit les connexions temps réel (Socket.IO) des navigateurs.

import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import type { MessagesClient, MessagesServeur } from "../shared/messages.ts";

const PORT = Number(process.env.PORT ?? 3000);
const VERSION = "0.1.0";

const app = express();
const serveurHttp = createServer(app);
const io = new Server<MessagesClient, MessagesServeur>(serveurHttp);

app.get("/api/sante", (_req, res) => {
  res.json({ ok: true, version: VERSION });
});

io.on("connection", (socket) => {
  console.log(`Connexion d'un navigateur (${socket.id})`);
  socket.emit("bienvenue", { version: VERSION, heureServeur: new Date().toISOString() });

  socket.on("ping", (reponse) => reponse(new Date().toISOString()));

  socket.on("disconnect", (raison) => {
    console.log(`Déconnexion d'un navigateur (${socket.id}) : ${raison}`);
  });
});

serveurHttp.listen(PORT, () => {
  console.log(`Serveur Brumeland VTT démarré sur le port ${PORT}`);
});
