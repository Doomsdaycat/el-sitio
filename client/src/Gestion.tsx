// Panneau Gestion du MJ : glisse par-dessus la droite de l'écran, la table reste visible.
// Trois onglets : invitations des joueurs, mes parties, export et import.

import { useEffect, useState } from "react";
import { Export } from "./Export.tsx";
import { Invitations } from "./Invitations.tsx";
import { Parties } from "./Parties.tsx";

type Onglet = "invitations" | "parties" | "export";

const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: "invitations", libelle: "Invitations" },
  { id: "parties", libelle: "Mes parties" },
  { id: "export", libelle: "Export et import" },
];

const CLE_ONGLET = "brumeland.gestion.onglet";

function ongletMemorise(): Onglet {
  try {
    const o = localStorage.getItem(CLE_ONGLET);
    if (o === "invitations" || o === "parties" || o === "export") return o;
  } catch {
    // Stockage indisponible : onglet par défaut.
  }
  return "invitations";
}

export function Gestion({ surFermer }: { surFermer: () => void }) {
  const [onglet, setOnglet] = useState<Onglet>(ongletMemorise);

  // Échap ferme le panneau.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") surFermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [surFermer]);

  function choisir(o: Onglet) {
    setOnglet(o);
    try {
      localStorage.setItem(CLE_ONGLET, o);
    } catch {
      // Sans gravité.
    }
  }

  return (
    <aside className="gestion" aria-label="Gestion">
      <div className="gestion-entete">
        <h2>Gestion</h2>
        <button type="button" className="secondaire fermer-gestion" aria-label="Fermer la gestion" onClick={surFermer}>
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
            onClick={() => choisir(o.id)}
          >
            {o.libelle}
          </button>
        ))}
      </div>
      <div className="gestion-contenu">
        {onglet === "invitations" && <Invitations />}
        {onglet === "parties" && <Parties />}
        {onglet === "export" && <Export />}
      </div>
    </aside>
  );
}
