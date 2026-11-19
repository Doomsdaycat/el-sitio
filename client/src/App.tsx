import { useEffect, useState } from "react";
import { ERREUR_LIEN_INCONNU, type Identite } from "../../shared/messages.ts";
import { jeton, oublierJeton, socket } from "./connexion.ts";
import { ChoixNom } from "./ChoixNom.tsx";
import { Centre } from "./Centre.tsx";
import { Combat } from "./Combat.tsx";
import { Export } from "./Export.tsx";
import { Installation } from "./Import.tsx";
import { Invitations } from "./Invitations.tsx";
import { Journal } from "./Journal.tsx";
import { ChoixPartie, Parties } from "./Parties.tsx";
import { PanneauJet } from "./PanneauJet.tsx";
import { Presents } from "./Presents.tsx";

type EtatConnexion =
  | "connexion"
  | "connecte"
  | "deconnecte"
  | "lien-inconnu"
  | "sans-lien"
  | "exclu";

const LIBELLES: Record<EtatConnexion, string> = {
  connexion: "connexion au serveur…",
  connecte: "serveur connecté",
  deconnecte: "serveur injoignable, nouvelle tentative…",
  "lien-inconnu": "ce lien n'est pas reconnu",
  "sans-lien": "aucun lien d'invitation",
  exclu: "ce lien vient d'être supprimé par le Meneur de jeu",
};

const ROLES = { mj: "Meneur de jeu", joueur: "joueur" } as const;

export function App() {
  const [etat, setEtat] = useState<EtatConnexion>(() => {
    if (jeton === null) return "sans-lien";
    return socket.connected ? "connecte" : "connexion";
  });
  const [identite, setIdentite] = useState<Identite | null>(null);
  const [changementNom, setChangementNom] = useState(false);

  useEffect(() => {
    const surConnexion = () => setEtat("connecte");
    const surDeconnexion = () => setEtat((avant) => (avant === "exclu" ? avant : "deconnecte"));
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
    const surExclu = () => {
      socket.disconnect();
      oublierJeton();
      setIdentite(null);
      setEtat("exclu");
    };

    socket.on("connect", surConnexion);
    socket.on("disconnect", surDeconnexion);
    socket.on("connect_error", surErreur);
    const surNomPartie = (nom: string) => setIdentite((avant) => avant && { ...avant, partie: { nom } });
    socket.on("bienvenue", setIdentite);
    socket.on("exclu", surExclu);
    socket.on("partie:nom", surNomPartie);
    return () => {
      socket.off("connect", surConnexion);
      socket.off("disconnect", surDeconnexion);
      socket.off("connect_error", surErreur);
      socket.off("bienvenue", setIdentite);
      socket.off("exclu", surExclu);
      socket.off("partie:nom", surNomPartie);
    };
  }, []);

  const sansAcces = etat === "sans-lien" || etat === "lien-inconnu" || etat === "exclu";
  // Coupure après avoir été dans la partie : on garde l'écran, avec un bandeau.
  const coupure = etat === "deconnecte" && identite !== null;

  return (
    <main className={coupure ? "page en-coupure" : "page"}>
      {coupure && (
        <div className="bandeau-coupure" role="status">
          Connexion perdue. Reconnexion automatique en cours… Tu n'as rien à faire.
        </div>
      )}
      <header className="entete">
        <h1>Brumeland VTT</h1>
        <p className={`statut statut-${etat}`}>
          <span className="pastille" aria-hidden="true" />
          {LIBELLES[etat]}
        </p>
      </header>

      {sansAcces && (
        <p className="explication">
          Pour rejoindre une partie, ouvre le lien d'invitation que t'a envoyé le Meneur de jeu.
        </p>
      )}
      {etat === "sans-lien" && <Installation />}

      {identite && !sansAcces && identite.moi.role === "joueur" && identite.moi.nom === null && (
        <ChoixNom nomActuel={null} />
      )}

      {identite && !sansAcces && (identite.moi.role === "mj" || identite.moi.nom !== null) && (
        <>
          <section className="identite">
            <p>
              Partie :{" "}
              {identite.moi.role === "mj" ? <ChoixPartie nom={identite.partie.nom} /> : <strong>{identite.partie.nom}</strong>}{" "}
              ·{" "}
              {identite.moi.role === "mj" ? (
                <>
                  tu es connecté en tant que <strong>{ROLES.mj}</strong>.
                </>
              ) : (
                <>
                  bienvenue, <strong>{identite.moi.nom}</strong> !{" "}
                  {!changementNom && (
                    <button type="button" className="lien" onClick={() => setChangementNom(true)}>
                      Changer de nom
                    </button>
                  )}
                </>
              )}
            </p>
          </section>

          {changementNom && identite.moi.role === "joueur" && (
            <ChoixNom nomActuel={identite.moi.nom} surTermine={() => setChangementNom(false)} />
          )}

          <div className="table-de-jeu">
            <div className="colonne-gauche">
              <Combat moiId={identite.moi.id} estMj={identite.moi.role === "mj"} />
              <Presents moiId={identite.moi.id} />
              <PanneauJet estMj={identite.moi.role === "mj"} />
            </div>
            <Centre moiId={identite.moi.id} estMj={identite.moi.role === "mj"} />
            <Journal moiId={identite.moi.id} estMj={identite.moi.role === "mj"} />
          </div>

          {identite.moi.role === "mj" && (
            <div className="zone-mj">
              <Parties />
              <Invitations />
              <Export />
            </div>
          )}

          <p className="version">version {identite.version}</p>
        </>
      )}
    </main>
  );
}
