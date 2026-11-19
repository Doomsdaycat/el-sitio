import { useEffect, useState } from "react";
import { ERREUR_LIEN_INCONNU, type Identite } from "../../shared/messages.ts";
import { jeton, oublierJeton, socket } from "./connexion.ts";
import { ChoixNom } from "./ChoixNom.tsx";
import { Centre } from "./Centre.tsx";
import { BarreHaut } from "./BarreHaut.tsx";
import { Combat } from "./Combat.tsx";
import { fermerGestion, ouvrirGestion, useEtat } from "./etat.ts";
import { Gestion } from "./Gestion.tsx";
import { Installation } from "./Import.tsx";
import { Journal } from "./Journal.tsx";
import { PanneauJet } from "./PanneauJet.tsx";

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

export function App() {
  const [etat, setEtat] = useState<EtatConnexion>(() => {
    if (jeton === null) return "sans-lien";
    return socket.connected ? "connecte" : "connexion";
  });
  const [identite, setIdentite] = useState<Identite | null>(null);
  const [changementNom, setChangementNom] = useState(false);
  const gestion = useEtat("gestionOuverte");

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

  const estMj = identite?.moi.role === "mj";
  // À la table, la barre du haut ne couvre que la colonne de la scène : la colonne de droite
  // monte jusqu'en haut de l'écran. Ailleurs (lien inconnu, choix du nom), elle est seule en haut.
  const aLaTable = identite !== null && !sansAcces && (estMj || identite.moi.nom !== null);
  const barre = (
    <BarreHaut
      identite={sansAcces ? null : identite}
      connecte={etat === "connecte"}
      libelle={LIBELLES[etat]}
      classeStatut={`statut-${etat}`}
      gestionOuverte={gestion}
      surGestion={() => (gestion ? fermerGestion() : ouvrirGestion())}
      surChangerNom={() => setChangementNom(true)}
    />
  );

  return (
    <main className={coupure ? "page en-coupure" : "page"}>
      {coupure && (
        <div className="bandeau-coupure" role="status">
          Connexion perdue. Reconnexion automatique en cours… Tu n'as rien à faire.
        </div>
      )}
      {!aLaTable && barre}

      {sansAcces && (
        <p className="explication">
          Pour rejoindre une partie, ouvre le lien d'invitation que t'a envoyé le Meneur de jeu.
        </p>
      )}
      {etat === "sans-lien" && <Installation />}

      {identite && !sansAcces && identite.moi.role === "joueur" && identite.moi.nom === null && (
        <ChoixNom nomActuel={null} />
      )}

      {aLaTable && (
        <>
          {/* Deux colonnes : la scène prend la place ; à droite, empilés, ce qui sert souvent ensemble. */}
          <div className="table-de-jeu">
            <div className="colonne-gauche">
              {barre}
              {changementNom && identite.moi.role === "joueur" && (
                <ChoixNom nomActuel={identite.moi.nom} surTermine={() => setChangementNom(false)} />
              )}
              <Centre moiId={identite.moi.id} estMj={estMj} />
            </div>
            <div className="colonne-droite">
              <Combat moiId={identite.moi.id} estMj={estMj} />
              <PanneauJet estMj={estMj} />
              <Journal moiId={identite.moi.id} estMj={estMj} />
            </div>
          </div>

          {estMj && gestion && <Gestion />}
        </>
      )}
    </main>
  );
}
