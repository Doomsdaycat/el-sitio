// Scène : l'image que le MJ montre à tous, et (pour le MJ) la bibliothèque d'images.

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Reponse } from "../../shared/messages.ts";
import {
  FORMATS_IMAGE,
  IMAGE_NOM_MAX,
  IMAGE_TAILLE_MAX,
  urlImage,
  type ImageBibliotheque,
} from "../../shared/scenes.ts";
import { jeton, socket } from "./connexion.ts";
import { useEtat } from "./etat.ts";

function mega(octets: number): string {
  return `${(octets / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

interface Vue {
  /** Facteur de zoom (1 = image entière). */
  zoom: number;
  /** Décalage de l'image, en pixels. */
  x: number;
  y: number;
}

const VUE_ENTIERE: Vue = { zoom: 1, x: 0, y: 0 };

/**
 * Zoome vers un point du cadre (px, py) en gardant ce point sous la souris,
 * puis empêche l'image de sortir du cadre.
 */
function zoomerVers(vue: Vue, zoom: number, px: number, py: number, l: number, h: number): Vue {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const x = px - ((px - vue.x) * z) / vue.zoom;
  const y = py - ((py - vue.y) * z) / vue.zoom;
  return borner({ zoom: z, x, y }, l, h);
}

function borner(vue: Vue, l: number, h: number): Vue {
  return {
    zoom: vue.zoom,
    x: Math.min(0, Math.max(l - l * vue.zoom, vue.x)),
    y: Math.min(0, Math.max(h - h * vue.zoom, vue.y)),
  };
}

/**
 * Grande image, avec zoom et déplacement personnels (chacun regarde où il veut)
 * et un bouton plein écran.
 */
function Affichage(props: { id: string; titre: string; bandeau?: React.ReactNode }) {
  const cadre = useRef<HTMLElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [vue, setVue] = useState<Vue>(VUE_ENTIERE);
  const glisse = useRef<{ x: number; y: number } | null>(null);

  // Suit l'entrée et la sortie du plein écran (bouton, ou touche Échap).
  useEffect(() => {
    const suivre = () => {
      setPleinEcran(document.fullscreenElement === cadre.current);
      setVue(VUE_ENTIERE); // la taille du cadre change : on repart de l'image entière
    };
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);

  // Nouvelle image : on revient à l'image entière.
  useEffect(() => setVue(VUE_ENTIERE), [props.id]);

  // Molette : en plein écran, elle zoome ; en affichage normal, il faut Ctrl + molette,
  // pour que la molette seule continue de faire défiler la page (comme les cartes des sites web).
  // Écouteur manuel pour pouvoir bloquer le défilement quand on zoome.
  const [astuce, setAstuce] = useState(false);
  const minuterieAstuce = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      const enPleinEcran = document.fullscreenElement === cadre.current;
      if (!enPleinEcran && !e.ctrlKey) {
        // La page défile normalement ; on rappelle juste comment zoomer.
        setAstuce(true);
        window.clearTimeout(minuterieAstuce.current);
        minuterieAstuce.current = window.setTimeout(() => setAstuce(false), 1200);
        return;
      }
      e.preventDefault();
      setAstuce(false);
      const r = el.getBoundingClientRect();
      const facteur = Math.exp(-e.deltaY * 0.0015);
      setVue((v) => zoomerVers(v, v.zoom * facteur, e.clientX - r.left, e.clientY - r.top, r.width, r.height));
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => {
      el.removeEventListener("wheel", surMolette);
      window.clearTimeout(minuterieAstuce.current);
    };
  }, []);

  /** Zoom par les boutons : vers le centre du cadre. */
  function zoomerAuCentre(facteur: number) {
    const r = zone.current?.getBoundingClientRect();
    if (!r) return;
    setVue((v) => zoomerVers(v, v.zoom * facteur, r.width / 2, r.height / 2, r.width, r.height));
  }

  const zoome = vue.zoom > 1.001;

  return (
    <figure className={pleinEcran ? "scene-affichage plein" : "scene-affichage"} ref={cadre}>
      <figcaption>
        <span className="scene-titre">{props.titre}</span>
        {props.bandeau}
        <span className="zoom">
          <button
            type="button"
            className="secondaire"
            aria-label="Dézoomer"
            disabled={!zoome}
            onClick={() => zoomerAuCentre(1 / 1.5)}
          >
            −
          </button>
          <span className="zoom-valeur" title={
              pleinEcran
                ? "Molette : zoomer · glisser : se déplacer · double-clic : zoomer ici"
                : "Ctrl + molette : zoomer · glisser : se déplacer · double-clic : zoomer ici"
            }>
            {Math.round(vue.zoom * 100)} %
          </span>
          <button
            type="button"
            className="secondaire"
            aria-label="Zoomer"
            disabled={vue.zoom >= ZOOM_MAX}
            onClick={() => zoomerAuCentre(1.5)}
          >
            +
          </button>
          <button type="button" className="secondaire" disabled={!zoome} onClick={() => setVue(VUE_ENTIERE)}>
            Ajuster
          </button>
        </span>
        <button
          type="button"
          className="secondaire"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void cadre.current?.requestFullscreen();
          }}
        >
          {pleinEcran ? "Quitter le plein écran" : "Plein écran"}
        </button>
      </figcaption>
      <div
        ref={zone}
        className={zoome ? "scene-zone zoomee" : "scene-zone"}
        onPointerDown={(e) => {
          if (!zoome || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          glisse.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const depart = glisse.current;
          if (!depart) return;
          const r = e.currentTarget.getBoundingClientRect();
          const dx = e.clientX - depart.x;
          const dy = e.clientY - depart.y;
          glisse.current = { x: e.clientX, y: e.clientY };
          setVue((v) => borner({ zoom: v.zoom, x: v.x + dx, y: v.y + dy }, r.width, r.height));
        }}
        onPointerUp={() => (glisse.current = null)}
        onPointerCancel={() => (glisse.current = null)}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setVue((v) => zoomerVers(v, v.zoom * 2, e.clientX - r.left, e.clientY - r.top, r.width, r.height));
        }}
      >
        <img
          src={urlImage(props.id)}
          alt={props.titre}
          draggable={false}
          style={{ transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.zoom})` }}
        />
        {astuce && (
          <div className="astuce-zoom" aria-hidden="true">
            <kbd>Ctrl</kbd> + molette pour zoomer
          </div>
        )}
      </div>
    </figure>
  );
}

/** Envoie un fichier au serveur, avec la progression. */
function deposer(fichier: File, progression: (pourcent: number) => void): Promise<Reponse> {
  return new Promise((resoudre) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images");
    xhr.setRequestHeader("X-Brumeland-Jeton", jeton ?? "");
    xhr.setRequestHeader("X-Nom-Fichier", encodeURIComponent(fichier.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progression(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        resoudre(JSON.parse(xhr.responseText) as Reponse);
      } catch {
        resoudre({ ok: false, erreur: `Envoi refusé (code ${xhr.status}).` });
      }
    };
    xhr.onerror = () => resoudre({ ok: false, erreur: "Envoi interrompu : vérifie la connexion." });
    xhr.send(fichier);
  });
}

function CarteImage(props: {
  image: ImageBibliotheque;
  montree: boolean;
  enApercu: boolean;
  surApercu: () => void;
  surErreur: (e: string | null) => void;
}) {
  const { image, montree, enApercu, surApercu, surErreur } = props;
  const [nom, setNom] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const repondre = (r: Reponse) => surErreur(r.ok ? null : r.erreur);

  function renommer() {
    if (nom !== null && nom.trim() !== "" && nom !== image.nom) {
      socket.emit("mj:renommerImage", { id: image.id, nom }, repondre);
    }
    setNom(null);
  }

  function supprimer() {
    if (!confirmer) {
      setConfirmer(true);
      window.setTimeout(() => setConfirmer(false), 4000);
      return;
    }
    socket.emit("mj:supprimerImage", { id: image.id }, repondre);
  }

  const classes = ["carte-image"];
  if (montree) classes.push("montree");
  if (enApercu) classes.push("apercu");

  return (
    <li className={classes.join(" ")}>
      <button type="button" className="vignette" onClick={surApercu} title="Aperçu (pour toi seul)">
        <img src={urlImage(image.id)} alt="" loading="lazy" />
        {montree && <span className="badge-montree">Montrée</span>}
      </button>
      <input
        className="nom-image"
        aria-label="Nom de l'image"
        maxLength={IMAGE_NOM_MAX}
        value={nom ?? image.nom}
        onFocus={() => setNom(image.nom)}
        onChange={(e) => setNom(e.target.value)}
        onBlur={renommer}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setNom(null);
            e.currentTarget.blur();
          }
        }}
      />
      <div className="carte-image-actions">
        <span className="discret petit">{mega(image.taille)}</span>
        {montree ? (
          <button
            type="button"
            className="secondaire"
            onClick={() => socket.emit("mj:montrerScene", { id: null }, repondre)}
          >
            Retirer
          </button>
        ) : (
          <button type="button" onClick={() => socket.emit("mj:montrerScene", { id: image.id }, repondre)}>
            Montrer
          </button>
        )}
        <button type="button" className={confirmer ? "danger" : "lien"} onClick={supprimer}>
          {confirmer ? "Confirmer" : "Supprimer"}
        </button>
      </div>
    </li>
  );
}

function Bibliotheque(props: { apercu: string | null; surApercu: (id: string | null) => void }) {
  const images = useEtat("images");
  const scene = useEtat("scene");
  const [envois, setEnvois] = useState<{ nom: string; pourcent: number }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const choix = useRef<HTMLInputElement>(null);

  async function envoyer(fichiers: FileList | File[]) {
    setErreur(null);
    for (const fichier of Array.from(fichiers)) {
      if (fichier.size > IMAGE_TAILLE_MAX) {
        setErreur(`« ${fichier.name} » est trop lourde (${mega(fichier.size)}) : ${mega(IMAGE_TAILLE_MAX)} au plus.`);
        continue;
      }
      setEnvois((l) => [...l, { nom: fichier.name, pourcent: 0 }]);
      const r = await deposer(fichier, (pourcent) =>
        setEnvois((l) => l.map((e) => (e.nom === fichier.name ? { ...e, pourcent } : e))),
      );
      setEnvois((l) => l.filter((e) => e.nom !== fichier.name));
      if (!r.ok) setErreur(`« ${fichier.name} » : ${r.erreur}`);
    }
  }

  function surDepot(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    if (e.dataTransfer.files.length > 0) void envoyer(e.dataTransfer.files);
  }

  return (
    <section className="bibliotheque">
      <h3>Bibliothèque d'images</h3>
      <p className="discret petit">
        Les joueurs ne voient que l'image que tu montres. Clique sur une vignette pour un aperçu
        rien que pour toi.
      </p>
      <div
        className={survol ? "zone-depot survol" : "zone-depot"}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={surDepot}
      >
        <p>
          Dépose tes images ici, ou{" "}
          <button type="button" className="lien" onClick={() => choix.current?.click()}>
            choisis des fichiers
          </button>
        </p>
        <p className="discret petit">
          {FORMATS_IMAGE}, {mega(IMAGE_TAILLE_MAX)} au plus par image.
        </p>
        <input
          ref={choix}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void envoyer(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {envois.map((e) => (
        <div key={e.nom} className="envoi">
          <span>{e.nom}</span>
          <progress max={100} value={e.pourcent} />
          <span className="discret petit">{e.pourcent} %</span>
        </div>
      ))}
      {erreur && <p className="erreur">{erreur}</p>}
      {images && images.length > 0 && (
        <ul className="grille-images">
          {[...images].reverse().map((image) => (
            <CarteImage
              key={image.id}
              image={image}
              montree={scene?.image?.id === image.id}
              enApercu={props.apercu === image.id}
              surApercu={() => props.surApercu(props.apercu === image.id ? null : image.id)}
              surErreur={setErreur}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Scene({ estMj }: { estMj: boolean }) {
  const scene = useEtat("scene");
  const images = useEtat("images");
  const [apercu, setApercu] = useState<string | null>(null);
  const imageApercu = apercu ? images?.find((i) => i.id === apercu) : undefined;
  const montree = scene?.image ?? null;

  return (
    <div className="scene">
      {estMj && imageApercu && imageApercu.id !== montree?.id ? (
        <Affichage
          id={imageApercu.id}
          titre={imageApercu.nom}
          bandeau={
            <>
              <span className="badge-secret">aperçu : les joueurs ne le voient pas</span>
              <button
                type="button"
                onClick={() =>
                  socket.emit("mj:montrerScene", { id: imageApercu.id }, (r: Reponse) => {
                    if (r.ok) setApercu(null);
                  })
                }
              >
                Montrer à tous
              </button>
              <button type="button" className="lien" onClick={() => setApercu(null)}>
                Fermer l'aperçu
              </button>
            </>
          }
        />
      ) : montree ? (
        <Affichage
          id={montree.id}
          titre={montree.nom}
          bandeau={
            estMj && (
              <button
                type="button"
                className="secondaire"
                onClick={() => socket.emit("mj:montrerScene", { id: null }, () => undefined)}
              >
                Retirer la scène
              </button>
            )
          }
        />
      ) : (
        <p className="discret scene-vide">
          {estMj
            ? "Aucune scène montrée. Dépose une image ci-dessous, puis clique sur « Montrer »."
            : "Le MJ n'a pas encore montré de scène."}
        </p>
      )}
      {estMj && <Bibliotheque apercu={apercu} surApercu={setApercu} />}
    </div>
  );
}
