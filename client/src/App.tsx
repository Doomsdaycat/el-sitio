import { useEffect, useState } from "react";
import { socket } from "./connexion.ts";

type EtatConnexion = "connexion" | "connecte" | "deconnecte";

const LIBELLES: Record<EtatConnexion, string> = {
  connexion: "connexion au serveur…",
  connecte: "serveur connecté",
  deconnecte: "serveur injoignable, nouvelle tentative…",
};

export function App() {
  const [etat, setEtat] = useState<EtatConnexion>(socket.connected ? "connecte" : "connexion");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const surConnexion = () => setEtat("connecte");
    const surDeconnexion = () => setEtat("deconnecte");
    const surBienvenue = (infos: { version: string }) => setVersion(infos.version);

    socket.on("connect", surConnexion);
    socket.on("disconnect", surDeconnexion);
    socket.on("connect_error", surDeconnexion);
    socket.on("bienvenue", surBienvenue);
    return () => {
      socket.off("connect", surConnexion);
      socket.off("disconnect", surDeconnexion);
      socket.off("connect_error", surDeconnexion);
      socket.off("bienvenue", surBienvenue);
    };
  }, []);

  return (
    <main className="accueil">
      <h1>Brumeland VTT</h1>
      <p className={`statut statut-${etat}`}>
        <span className="pastille" aria-hidden="true" />
        {LIBELLES[etat]}
      </p>
      {version && <p className="version">version {version}</p>}
    </main>
  );
}
