// Onglet Scène : la scène montrée (illustration ou immersive) ; pour le MJ, la préparation
// d'une scène, la liste « Mes scènes » et la bibliothèque d'images.

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Reponse } from "../../shared/messages.ts";
import {
  FORMATS_IMAGE,
  IMAGE_NOM_MAX,
  IMAGE_TAILLE_MAX,
  SCENE_NOM_MAX,
  TYPES_SCENE,
  urlImage,
  type ImageBibliotheque,
  type Scene as SceneDonnees,
  type TypeScene,
} from "../../shared/scenes.ts";
import { Carte } from "./Carte.tsx";
import { jeton, socket } from "./connexion.ts";
import { preparerScene, useEtat } from "./etat.ts";

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

/** Nouvelle scène à préremplir (depuis la bibliothèque : « Créer une scène » avec cette image). */
interface Brouillon {
  imageId: string;
  nom: string;
}

function CarteImage(props: {
  image: ImageBibliotheque;
  surNouvelleScene: () => void;
  surErreur: (e: string | null) => void;
}) {
  const { image, surNouvelleScene, surErreur } = props;
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
    setConfirmer(false);
    socket.emit("mj:supprimerImage", { id: image.id }, repondre);
  }

  return (
    <li className="carte-image">
      <button type="button" className="vignette" onClick={surNouvelleScene} title="Créer une scène avec cette image">
        <img src={urlImage(image.id)} alt="" loading="lazy" />
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
      <p className="discret petit utilisation">
        {image.scenes.length === 0
          ? "Aucune scène"
          : `${image.scenes.length > 1 ? "Scènes" : "Scène"} : ${image.scenes.join(", ")}`}
      </p>
      <div className="carte-image-actions">
        <span className="discret petit">{mega(image.taille)}</span>
        <button type="button" className="secondaire" onClick={surNouvelleScene}>
          Nouvelle scène
        </button>
        <button type="button" className={confirmer ? "danger" : "lien"} onClick={supprimer}>
          {confirmer ? "Confirmer" : "Supprimer"}
        </button>
      </div>
    </li>
  );
}

function Bibliotheque(props: { surNouvelleScene: (b: Brouillon) => void }) {
  const images = useEtat("images");
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
        Les joueurs ne voient jamais la bibliothèque. Une image peut servir à plusieurs scènes.
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
              surNouvelleScene={() => props.surNouvelleScene({ imageId: image.id, nom: image.nom })}
              surErreur={setErreur}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mes scènes (MJ)

function LigneScene(props: {
  scene: SceneDonnees;
  montree: boolean;
  preparee: boolean;
  images: ImageBibliotheque[];
  surErreur: (e: string | null) => void;
}) {
  const { scene, montree, preparee, images, surErreur } = props;
  const [nom, setNom] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const repondre = (r: Reponse) => surErreur(r.ok ? null : r.erreur);
  const modifier = (changement: { nom?: string; type?: TypeScene; imageId?: string }) =>
    socket.emit("mj:modifierScene", { id: scene.id, ...changement }, repondre);

  function supprimer() {
    if (!confirmer) {
      setConfirmer(true);
      window.setTimeout(() => setConfirmer(false), 4000);
      return;
    }
    setConfirmer(false);
    socket.emit("mj:supprimerScene", { id: scene.id }, repondre);
  }

  const classes = ["ligne-scene"];
  if (montree) classes.push("montree");
  if (preparee) classes.push("preparee");

  return (
    <li className={classes.join(" ")}>
      <img className="ligne-scene-vignette" src={urlImage(scene.image.id)} alt="" loading="lazy" />
      <div className="ligne-scene-infos">
        <input
          className="nom-image"
          aria-label="Nom de la scène"
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
        <div className="ligne-scene-reglages">
          <select
            aria-label="Type de scène"
            value={scene.type}
            onChange={(e) => modifier({ type: e.target.value as TypeScene })}
          >
            {TYPES_SCENE.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
          <select
            aria-label="Image de la scène"
            value={scene.image.id}
            onChange={(e) => modifier({ imageId: e.target.value })}
          >
            {images.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nom}
              </option>
            ))}
          </select>
          {montree && <span className="badge-montree-texte">montrée</span>}
        </div>
      </div>
      <div className="ligne-scene-actions">
        {montree ? (
          <button type="button" className="secondaire" onClick={() => socket.emit("mj:montrerScene", { id: null }, repondre)}>
            Ne plus montrer
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              socket.emit("mj:montrerScene", { id: scene.id }, (r: Reponse) => {
                repondre(r);
                if (r.ok) preparerScene(null);
              })
            }
          >
            Montrer
          </button>
        )}
        {!montree && (
          <button
            type="button"
            className={preparee ? "secondaire actif" : "secondaire"}
            onClick={() => preparerScene(preparee ? null : scene.id)}
          >
            {preparee ? "Fermer" : "Préparer"}
          </button>
        )}
        <button type="button" className={confirmer ? "danger" : "lien"} onClick={supprimer}>
          {confirmer ? "Confirmer" : "Supprimer"}
        </button>
      </div>
    </li>
  );
}

function MesScenes(props: { brouillon: Brouillon | null; surBrouillonUtilise: () => void }) {
  const scenes = useEtat("scenes");
  const images = useEtat("images");
  const active = useEtat("scene");
  const preparee = useEtat("scenePreparee");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeScene>("illustration");
  const [imageId, setImageId] = useState("");
  const formulaire = useRef<HTMLFormElement>(null);

  // « Nouvelle scène » depuis la bibliothèque : on préremplit le formulaire.
  useEffect(() => {
    if (!props.brouillon) return;
    setImageId(props.brouillon.imageId);
    setNom(props.brouillon.nom);
    formulaire.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    props.surBrouillonUtilise();
  }, [props.brouillon]); // eslint-disable-line react-hooks/exhaustive-deps

  const imageChoisie = images?.some((i) => i.id === imageId) ? imageId : "";

  return (
    <section className="mes-scenes">
      <h3>Mes scènes</h3>
      {scenes && scenes.length > 0 ? (
        <ul className="liste-scenes">
          {[...scenes].reverse().map((s) => (
            <LigneScene
              key={s.id}
              scene={s}
              montree={active?.id === s.id}
              preparee={preparee === s.id}
              images={images ?? []}
              surErreur={setErreur}
            />
          ))}
        </ul>
      ) : (
        <p className="discret petit">Aucune scène pour l'instant.</p>
      )}
      {erreur && <p className="erreur">{erreur}</p>}

      <form
        ref={formulaire}
        className="nouvelle-scene"
        onSubmit={(e) => {
          e.preventDefault();
          socket.emit("mj:creerScene", { nom, type, imageId: imageChoisie }, (r: Reponse) => {
            if (!r.ok) {
              setErreur(r.erreur);
              return;
            }
            setErreur(null);
            setNom("");
            // On ouvre la nouvelle scène pour la préparer.
            if (r.id) preparerScene(r.id);
          });
        }}
      >
        <h4>Nouvelle scène</h4>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={SCENE_NOM_MAX}
          placeholder="ex. : Embuscade sur la route"
          aria-label="Nom de la scène"
        />
        <select value={type} onChange={(e) => setType(e.target.value as TypeScene)} aria-label="Type">
          {TYPES_SCENE.map((t) => (
            <option key={t.id} value={t.id} title={t.aide}>
              {t.nom}
            </option>
          ))}
        </select>
        <select value={imageChoisie} onChange={(e) => setImageId(e.target.value)} aria-label="Image">
          <option value="">— image —</option>
          {(images ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.nom}
            </option>
          ))}
        </select>
        <button type="submit" disabled={nom.trim() === "" || imageChoisie === ""}>
          Créer
        </button>
        <p className="discret petit aide-type">{TYPES_SCENE.find((t) => t.id === type)?.aide}</p>
        {(images ?? []).length === 0 && (
          <p className="discret petit">Dépose d'abord une image dans la bibliothèque, ci-dessous.</p>
        )}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Onglet Scène

export function Scene({ estMj, moiId }: { estMj: boolean; moiId: number }) {
  const active = useEtat("scene");
  const scenes = useEtat("scenes");
  const prepareeId = useEtat("scenePreparee");
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);

  // Le MJ peut ouvrir une autre scène pour la préparer ; les joueurs voient la scène montrée.
  const preparee =
    estMj && prepareeId && prepareeId !== active?.id ? scenes?.find((s) => s.id === prepareeId) ?? null : null;
  const affichee = preparee ?? active;

  const bandeau = !estMj ? undefined : preparee ? (
    <>
      <span className="badge-secret">préparation : les joueurs ne voient pas cette scène</span>
      <button
        type="button"
        onClick={() =>
          socket.emit("mj:montrerScene", { id: preparee.id }, (r: Reponse) => {
            if (r.ok) preparerScene(null);
          })
        }
      >
        Montrer à tous
      </button>
      <button type="button" className="lien" onClick={() => preparerScene(null)}>
        Fermer
      </button>
    </>
  ) : (
    active && (
      <button
        type="button"
        className="secondaire"
        onClick={() => socket.emit("mj:montrerScene", { id: null }, () => undefined)}
      >
        Ne plus montrer
      </button>
    )
  );

  return (
    <div className="scene">
      {affichee === null ? (
        <p className="discret scene-vide">
          {estMj
            ? "Aucune scène montrée. Crée une scène ci-dessous, puis clique sur « Montrer »."
            : "Le MJ n'a pas encore montré de scène."}
        </p>
      ) : affichee.type === "immersive" ? (
        <Carte key={affichee.id} scene={affichee} moiId={moiId} estMj={estMj} bandeau={bandeau} />
      ) : (
        <Affichage id={affichee.image.id} titre={affichee.nom} bandeau={bandeau} />
      )}
      {estMj && <MesScenes brouillon={brouillon} surBrouillonUtilise={() => setBrouillon(null)} />}
      {estMj && <Bibliotheque surNouvelleScene={setBrouillon} />}
    </div>
  );
}
