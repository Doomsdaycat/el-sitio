// MJ : panneau « Réglages de la scène », à droite de la scène (il la rétrécit, sans la recouvrir).
// Il réunit tout ce qui règle une scène : nom, type, image et suppression (bloc « Scène »), puis
// les blocs propres au type de scène (brouillard, grille, pions…). Un seul bloc ouvert à la fois.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Reponse } from "../../shared/messages.ts";
import { SCENE_NOM_MAX, TYPES_SCENE, type Scene, type TypeScene } from "../../shared/scenes.ts";
import { socket } from "./connexion.ts";
import { ouvrirReglages, useEtat } from "./etat.ts";

/** Bloc ouvert du panneau (un seul à la fois, pour ne pas s'y perdre). */
const BlocOuvert = createContext<{ ouvert: string | null; basculer: (titre: string) => void }>({
  ouvert: null,
  basculer: () => undefined,
});

/** Un bloc du panneau : l'ouvrir referme les autres. */
export function BlocReglages({ titre, children }: { titre: string; children: ReactNode }) {
  const { ouvert, basculer } = useContext(BlocOuvert);
  const estOuvert = ouvert === titre;
  return (
    <section className={estOuvert ? "bloc-panneau ouvert" : "bloc-panneau"}>
      <button type="button" className="titre-bloc" aria-expanded={estOuvert} onClick={() => basculer(titre)}>
        <span className="fleche-bloc" aria-hidden="true">
          {estOuvert ? "▾" : "▸"}
        </span>
        {titre}
      </button>
      {estOuvert && <div className="bloc-panneau-contenu">{children}</div>}
    </section>
  );
}

/** Nom, type, image de la scène, et sa suppression. */
function BlocScene({ scene }: { scene: Scene }) {
  const images = useEtat("images") ?? [];
  const [nom, setNom] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const repondre = (r: Reponse) => setErreur(r.ok ? null : r.erreur);
  const modifier = (changement: { nom?: string; type?: TypeScene; imageId?: string }) =>
    socket.emit("mj:modifierScene", { id: scene.id, ...changement }, repondre);

  return (
    <BlocReglages titre="Scène">
      <label className="champ-panneau">
        <span>Nom</span>
        <input
          maxLength={SCENE_NOM_MAX}
          value={nom ?? scene.nom}
          onFocus={() => setNom(scene.nom)}
          onChange={(e) => setNom(e.target.value)}
          onBlur={() => {
            if (nom !== null && nom.trim() !== "" && nom !== scene.nom) modifier({ nom });
            setNom(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      <label className="champ-panneau">
        <span>Type</span>
        <select value={scene.type} onChange={(e) => modifier({ type: e.target.value as TypeScene })}>
          {TYPES_SCENE.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>
      </label>
      <p className="discret petit">{TYPES_SCENE.find((t) => t.id === scene.type)?.aide}</p>
      <label className="champ-panneau">
        <span>Image</span>
        <select value={scene.image.id} onChange={(e) => modifier({ imageId: e.target.value })}>
          {images.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nom}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={confirmer ? "danger supprimer-scene" : "lien supprimer-scene"}
        onClick={() => {
          if (!confirmer) {
            setConfirmer(true);
            window.setTimeout(() => setConfirmer(false), 4000);
            return;
          }
          setConfirmer(false);
          socket.emit("mj:supprimerScene", { id: scene.id }, repondre);
        }}
      >
        {confirmer ? "Confirmer : supprimer la scène" : "Supprimer la scène"}
      </button>
      {erreur && <p className="erreur">{erreur}</p>}
    </BlocReglages>
  );
}

export function PanneauReglages({ scene, children }: { scene: Scene; children?: ReactNode }) {
  const [ouvert, setOuvert] = useState<string | null>("Scène");
  // Autre scène : on repart du bloc « Scène ».
  useEffect(() => setOuvert("Scène"), [scene.id]);
  return (
    <BlocOuvert.Provider value={{ ouvert, basculer: (titre) => setOuvert((o) => (o === titre ? null : titre)) }}>
      <aside className="panneau-reglages" aria-label="Réglages de la scène">
        <div className="panneau-reglages-entete">
          <h3>Réglages de la scène</h3>
          <button type="button" className="secondaire fermer-reglages" aria-label="Fermer les réglages" onClick={() => ouvrirReglages(false)}>
            ✕
          </button>
        </div>
        <p className="discret petit">Toi seul vois ces réglages.</p>
        <BlocScene scene={scene} />
        {children}
      </aside>
    </BlocOuvert.Provider>
  );
}

/** Bouton « Réglages » de la barre de la scène (MJ). */
export function BoutonReglages() {
  const ouverts = useEtat("reglagesOuverts");
  return (
    <button
      type="button"
      className={ouverts ? "secondaire actif" : "secondaire"}
      aria-expanded={ouverts}
      aria-label="Réglages de la scène"
      title="Réglages de la scène : nom, type, image, brouillard, grille, pions"
      onClick={() => ouvrirReglages(!ouverts)}
    >
      ⚙️
    </button>
  );
}
