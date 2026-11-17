// Zone centrale : deux onglets, « Scène » et « Personnages ».
// Quand le MJ montre une nouvelle scène, tout le monde passe sur l'onglet Scène.

import { useEffect, useRef, useState } from "react";
import { useEtat } from "./etat.ts";
import { Fiches } from "./Fiches.tsx";
import { Scene } from "./Scene.tsx";

type Onglet = "scene" | "personnages";

export function Centre({ moiId, estMj }: { moiId: number; estMj: boolean }) {
  const scene = useEtat("scene");
  const imageMontree = scene?.image?.id ?? null;
  const [onglet, setOnglet] = useState<Onglet>("personnages");
  const precedente = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Nouvelle scène montrée (ou scène déjà montrée à l'arrivée) : on l'affiche.
    if (imageMontree !== null && imageMontree !== precedente.current) setOnglet("scene");
    precedente.current = imageMontree;
  }, [imageMontree]);

  return (
    <section className="carte centre">
      <div className="onglets onglets-centre" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "scene"}
          className={onglet === "scene" ? "onglet actif" : "onglet"}
          onClick={() => setOnglet("scene")}
        >
          Scène
          {imageMontree && onglet !== "scene" && <span className="point-nouveau" aria-hidden="true" />}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "personnages"}
          className={onglet === "personnages" ? "onglet actif" : "onglet"}
          onClick={() => setOnglet("personnages")}
        >
          Personnages
        </button>
      </div>
      {onglet === "scene" ? <Scene estMj={estMj} /> : <Fiches moiId={moiId} estMj={estMj} />}
    </section>
  );
}
