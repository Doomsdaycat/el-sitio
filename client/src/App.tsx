import { useEffect, useState } from "react";
import { ERREUR_LIEN_INCONNU, type Identite } from "../../shared/messages.ts";
import { jeton, oublierJeton, socket } from "./connexion.ts";

type EtatConnexion = "connexion" | "connecte" | "deconnecte" | "lien-inconnu" | "sans-lien";

const LIBELLES: Record<EtatConnexion, string> = {
  connexion: "connexion au serveur…",
  connecte: "serveur connecté",
  deconnecte: "serveur injoignable, nouvelle tentative…",
  "lien-inconnu": "ce lien n'est pas reconnu",
  "sans-lien": "aucun lien d'invitation",
};

const ROLES = { mj: "meneur de jeu", joueur: "joueur" } as const;

export function App() {
  const [etat, setEtat] = useState<EtatConnexion>(() => {
    if (jeton === null) return "sans-lien";
    return socket.connected ? "connecte" : "connexion";
  });
  const [identite, setIdentite] = useState<Identite | null>(null);

  useEffect(() => {
    const surConnexion = () => setEtat("connecte");
    const surDeconnexion = () => setEtat("deconnecte");
    const surErreur = (erreur: Error) => {
      if (erreur.message === ERREUR_LIEN_INCONNU) {
        // Inutile de réessayer : le lien ne deviendra pas valide tout seul.
        socket.disconnect();
        oublierJeton();
        setEtat("lien-inconnu");
      } else {
        setEtat("deconnecte");
      }
    };

    socket.on("connect", surConnexion);
    socket.on("disconnect", surDeconnexion);
    socket.on("connect_error", surErreur);
    socket.on("bienvenue", setIdentite);
    return () => {
      socket.off("connect", surConnexion);
      socket.off("disconnect", surDeconnexion);
      socket.off("connect_error", surErreur);
      socket.off("bienvenue", setIdentite);
    };
  }, []);

  return (
    <main className="accueil">
      <h1>Brumeland VTT</h1>
      <p className={`statut statut-${etat}`}>
        <span className="pastille" aria-hidden="true" />
        {LIBELLES[etat]}
      </p>

      {(etat === "sans-lien" || etat === "lien-inconnu") && (
        <p className="explication">
          Pour rejoindre une partie, ouvre le lien d'invitation que t'a envoyé le meneur de jeu.
        </p>
      )}

      {identite && etat !== "lien-inconnu" && (
        <section className="identite">
          <p>
            Partie : <strong>{identite.partie.nom}</strong>
          </p>
          <p>
            Tu es connecté en tant que <strong>{ROLES[identite.moi.role]}</strong>
            {identite.moi.nom && identite.moi.role !== "mj" && <> ({identite.moi.nom})</>}.
          </p>
          <p className="version">version {identite.version}</p>
        </section>
      )}
    </main>
  );
}
