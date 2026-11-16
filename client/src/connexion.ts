// Connexion temps réel unique entre le navigateur et le serveur.
// Socket.IO se reconnecte tout seul après une coupure.

import { io, type Socket } from "socket.io-client";
import type { MessagesClient, MessagesServeur } from "../../shared/messages.ts";

export const socket: Socket<MessagesServeur, MessagesClient> = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
