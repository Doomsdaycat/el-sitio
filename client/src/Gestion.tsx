// Panneau Gestion du MJ : glisse par-dessus la droite de l'écran, la table reste visible.
// Onglets : invitations des joueurs, scènes de la partie, images (bibliothèque commune),
// mes parties, export et import. Son ouverture et son onglet sont dans etat.ts (on peut l'ouvrir
// depuis ailleurs, par exemple le menu des scènes).

import { useEffect } from "react";
import { choisirOngletGestion, fermerGestion, ouvrirGestion, proposerScene, useEtat, type OngletGestion } from "./etat.ts";
import { Export } from "./Export.tsx";
import { Invitations } from "./Invitations.tsx";
import { Parties } from "./Parties.tsx";
import { Bibliotheque, GestionScenes } from "./Scene.tsx";

const ONGLETS: { id: OngletGestion; libelle: string }[] = [
  { id: "invitations", libelle: "Invitations" },
  { id: "scenes", libelle: "Scènes" },
  { id: "images", libelle: "Images" },
  { id: "parties", libelle: "Mes parties" },
  { id: "export", libelle: "Export et import" },
];

export function Gestion() {
  const onglet = useEtat("ongletGestion");

  // Échap ferme le panneau.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermerGestion();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  return (
    <aside className="gestion" aria-label="Gestion">
      <div className="gestion-entete">
        <h2>Gestion</h2>
        <button type="button" className="secondaire fermer-gestion" aria-label="Fermer la gestion" onClick={fermerGestion}>
          ✕
        </button>
      </div>
      <div className="onglets onglets-gestion" role="tablist">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={onglet === o.id}
            className={onglet === o.id ? "onglet actif" : "onglet"}
            onClick={() => choisirOngletGestion(o.id)}
          >
            {o.libelle}
          </button>
        ))}
      </div>
      <div className="gestion-contenu">
        {onglet === "invitations" && <Invitations />}
        {onglet === "scenes" && <GestionScenes />}
        {onglet === "images" && (
          <Bibliotheque
            surNouvelleScene={(b) => {
              // Le formulaire « Nouvelle scène » est dans l'onglet Scènes : on y passe, prérempli.
              proposerScene(b);
              ouvrirGestion("scenes");
            }}
          />
        )}
        {onglet === "parties" && <Parties />}
        {onglet === "export" && <Export />}
      </div>
    </aside>
  );
}
