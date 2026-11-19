// Zone centrale : deux onglets, « Scène » et « Personnages ».
// Quand le MJ montre une nouvelle scène, tout le monde passe sur l'onglet Scène.

import { useEffect, useRef, useState } from "react";
import { useEtat } from "./etat.ts";
import { Fiches } from "./Fiches.tsx";
import { Scene } from "./Scene.tsx";

type Onglet = "scene" | "personnages";

export function Centre({ moiId, estMj }: { moiId: number; estMj: boolean }) {
  const scene = useEtat("scene");
  const sceneMontree = scene?.id ?? null;
  const [onglet, setOnglet] = useState<Onglet>("personnages");
  const precedente = useRef<string | null | undefined>(undefined);
  // MJ : une scène ouverte pour la préparer (menu des scènes, onglet Scènes de Gestion) s'affiche.
  const preparee = useEtat("scenePreparee");
  useEffect(() => {
    if (preparee) setOnglet("scene");
  }, [preparee]);

  useEffect(() => {
    // Nouvelle scène montrée (ou scène déjà montrée à l'arrivée) : on l'affiche.
    if (sceneMontree !== null && sceneMontree !== precedente.current) setOnglet("scene");
    precedente.current = sceneMontree;
  }, [sceneMontree]);

  const bouton = (id: Onglet, nom: string, signal: boolean) => (
    <button
      type="button"
      role="tab"
      aria-selected={onglet === id}
      className={onglet === id ? "onglet actif" : "onglet"}
      onClick={() => setOnglet(id)}
    >
      {nom}
      {signal && onglet !== id && <span className="point-nouveau" aria-hidden="true" />}
    </button>
  );

  return (
    <section className="carte centre">
      <div className="onglets onglets-centre" role="tablist">
        {bouton("scene", "Scène", sceneMontree !== null)}
        {bouton("personnages", "Personnages", false)}
      </div>
      {onglet === "scene" ? <Scene estMj={estMj} moiId={moiId} /> : <Fiches moiId={moiId} estMj={estMj} />}
    </section>
  );
}
