// Zone centrale : trois onglets, « Scène », « Carte » et « Personnages ».
// Quand le MJ montre une nouvelle scène ou choisit une nouvelle carte, tout le monde y passe.

import { useEffect, useRef, useState } from "react";
import { Carte } from "./Carte.tsx";
import { useEtat } from "./etat.ts";
import { Fiches } from "./Fiches.tsx";
import { Scene } from "./Scene.tsx";

type Onglet = "scene" | "carte" | "personnages";

/** Passe sur un onglet quand l'élément suivi change (et n'est pas vide). */
function useBascule(valeur: string | null, ouvrir: () => void) {
  const precedente = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (valeur !== null && valeur !== precedente.current) ouvrir();
    precedente.current = valeur;
  }, [valeur]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Centre({ moiId, estMj }: { moiId: number; estMj: boolean }) {
  const scene = useEtat("scene");
  const carte = useEtat("carte");
  const imageMontree = scene?.image?.id ?? null;
  const carteChoisie = carte?.image?.id ?? null;
  const [onglet, setOnglet] = useState<Onglet>("personnages");

  useBascule(imageMontree, () => setOnglet("scene"));
  useBascule(carteChoisie, () => setOnglet("carte"));

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
        {bouton("scene", "Scène", imageMontree !== null)}
        {bouton("carte", "Carte", carteChoisie !== null)}
        {bouton("personnages", "Personnages", false)}
      </div>
      {onglet === "scene" && <Scene estMj={estMj} />}
      {onglet === "carte" && <Carte moiId={moiId} estMj={estMj} />}
      {onglet === "personnages" && <Fiches moiId={moiId} estMj={estMj} />}
    </section>
  );
}
