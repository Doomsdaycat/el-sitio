// MJ : menu des scènes, à la place du nom de la scène dans sa barre.
// Il liste les scènes (vignette, type, « montrée ») ; en choisir une l'ouvre en préparation
// (les joueurs ne la voient pas tant qu'elle n'est pas montrée) ; choisir la scène montrée y revient.

import { useEffect, useRef, useState } from "react";
import { urlImage } from "../../shared/scenes.ts";
import { preparerScene, useEtat } from "./etat.ts";

/** Fait défiler jusqu'au formulaire « Nouvelle scène » de « Mes scènes » et y place le curseur. */
function allerANouvelleScene(): void {
  const formulaire = document.querySelector<HTMLFormElement>(".nouvelle-scene");
  formulaire?.scrollIntoView({ behavior: "smooth", block: "center" });
  formulaire?.querySelector("input")?.focus({ preventScroll: true });
}

export function MenuScenes({ afficheeId }: { afficheeId: string | null }) {
  const scenes = useEtat("scenes") ?? [];
  const active = useEtat("scene");
  const [ouvert, setOuvert] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);
  const affichee = scenes.find((s) => s.id === afficheeId) ?? null;
  const montree = !!affichee && affichee.id === active?.id;

  // Clic ailleurs ou Échap : le menu se referme.
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!cadre.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  function choisir(id: string) {
    setOuvert(false);
    // La scène montrée : on y revient (fin de la préparation) ; une autre : on la prépare.
    preparerScene(id === active?.id ? null : id);
  }

  return (
    <div className="menu-scenes" ref={cadre}>
      <button
        type="button"
        className="bouton-menu-scenes"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        title="Changer de scène"
        onClick={() => setOuvert((o) => !o)}
      >
        <span className="scene-titre">{affichee ? affichee.nom : "Choisir une scène"}</span>
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {affichee && (
        <span className={montree ? "statut-scene montree" : "statut-scene"}>
          {montree ? "montrée à tous" : "en préparation · les joueurs ne la voient pas"}
        </span>
      )}
      {ouvert && (
        <div className="liste-menu-scenes" role="listbox" aria-label="Scènes">
          {scenes.length === 0 && <p className="discret petit">Aucune scène pour l'instant.</p>}
          {scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === afficheeId}
              className={s.id === afficheeId ? "choix-scene actuelle" : "choix-scene"}
              onClick={() => choisir(s.id)}
            >
              <img src={urlImage(s.image.id)} alt="" loading="lazy" />
              <span className="choix-scene-nom">
                {s.nom}
                <span className="discret petit">{s.type === "immersive" ? "Immersive" : "Illustration"}</span>
              </span>
              {s.id === active?.id && <span className="badge-montree-texte">montrée</span>}
            </button>
          ))}
          <button
            type="button"
            className="lien nouvelle-scene-menu"
            onClick={() => {
              setOuvert(false);
              allerANouvelleScene();
            }}
          >
            ＋ Nouvelle scène
          </button>
        </div>
      )}
    </div>
  );
}
