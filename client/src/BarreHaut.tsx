// Barre fine en haut de l'écran : la partie (menu des parties pour le MJ), le rôle, le bouton
// Gestion (MJ), et la pastille de connexion qui se déplie au survol (présents, serveur, version).

import type { Identite } from "../../shared/messages.ts";
import { useEtat } from "./etat.ts";
import { ChoixPartie } from "./Parties.tsx";
import { ListePresents } from "./Presents.tsx";

interface Props {
  identite: Identite | null;
  /** Connexion au serveur : « connecte », ou un état à signaler. */
  connecte: boolean;
  /** Texte de l'état de la connexion (« serveur connecté », « serveur injoignable… »). */
  libelle: string;
  /** Classe de couleur de la pastille (statut-connecte, statut-deconnecte…). */
  classeStatut: string;
  gestionOuverte: boolean;
  surGestion: () => void;
  surChangerNom: () => void;
}

export function BarreHaut({ identite, connecte, libelle, classeStatut, gestionOuverte, surGestion, surChangerNom }: Props) {
  const presents = useEtat("presents");
  const estMj = identite?.moi.role === "mj";
  const nbConnectes = presents?.filter((p) => p.connecte).length ?? 0;

  return (
    <header className="barre-haut">
      {identite && (
        <div className="barre-partie">
          {estMj ? <ChoixPartie nom={identite.partie.nom} /> : <strong>{identite.partie.nom}</strong>}
          <span className="discret">· {estMj ? "Meneur de jeu" : identite.moi.nom}</span>
        </div>
      )}
      <div className="barre-droite">
        <div className="connexion">
          <button type="button" className={`pastille-connexion ${classeStatut}`} aria-haspopup="true">
            <span className="pastille" aria-hidden="true" />
            {connecte && presents ? `${nbConnectes} / ${presents.length} à la table` : libelle}
          </button>
          <div className="connexion-detail" role="group" aria-label="Qui est à la table">
            {presents && identite && <ListePresents liste={presents} moiId={identite.moi.id} />}
            {identite?.moi.role === "joueur" && (
              <button type="button" className="lien" onClick={surChangerNom}>
                Changer de nom
              </button>
            )}
            <p className={`connexion-serveur ${classeStatut}`}>
              <span className="pastille" aria-hidden="true" />
              <span>{libelle}</span>
              {identite && <span className="discret version-barre">version {identite.version}</span>}
            </p>
          </div>
        </div>
        {estMj && (
          <button
            type="button"
            className={gestionOuverte ? "bouton-gestion actif" : "bouton-gestion secondaire"}
            aria-expanded={gestionOuverte}
            onClick={surGestion}
          >
            ⚙️ Gestion
          </button>
        )}
      </div>
    </header>
  );
}
