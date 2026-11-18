// Onglet Scène : la scène montrée (illustration ou immersive) ; pour le MJ, la préparation
// d'une scène, la liste « Mes scènes » et la bibliothèque d'images.

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Reponse } from "../../shared/messages.ts";
import { PINCEAU_MAX, PINCEAU_MIN, TRAITS_PAR_ENVOI_MAX, type Brouillard, type TraitBrouillard } from "../../shared/brouillard.ts";
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
/** Dessin du brouillard d'une illustration : limite de résolution du calque (plus léger). */
const BROUILLARD_RESOLUTION_MAX = 1600;
const COULEUR_BROUILLARD = "#0b0a0e";

/** Dessine les coups de pinceau sur le calque du brouillard (en pixels de l'image × échelle). */
function dessinerBrouillard(ctx: CanvasRenderingContext2D, traits: TraitBrouillard[], echelle: number) {
  const { width, height } = ctx.canvas;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COULEUR_BROUILLARD;
  ctx.fillRect(0, 0, width, height);
  for (const t of traits) {
    if ("tout" in t) {
      ctx.globalCompositeOperation = "source-over";
      if (t.reveler) ctx.clearRect(0, 0, width, height);
      else ctx.fillRect(0, 0, width, height);
      continue;
    }
    const x = t.x * echelle;
    const y = t.y * echelle;
    const r = t.r * echelle;
    // Pinceau rond aux bords doux, façon jeu de stratégie.
    const degrade = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
    degrade.addColorStop(0, "rgba(11, 10, 14, 1)");
    degrade.addColorStop(1, "rgba(11, 10, 14, 0)");
    ctx.globalCompositeOperation = t.reveler ? "destination-out" : "source-over";
    ctx.fillStyle = degrade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = COULEUR_BROUILLARD;
}

/**
 * Grande image, avec zoom et déplacement personnels (chacun regarde où il veut), plein écran,
 * et brouillard de guerre au pinceau rond si le MJ l'a activé.
 */
function Affichage(props: {
  id: string;
  titre: string;
  bandeau?: React.ReactNode;
  /** Brouillard de l'illustration (avec la scène, pour que le MJ puisse peindre). */
  brouillard?: Brouillard;
  sceneId?: string;
  estMj?: boolean;
}) {
  const { brouillard, sceneId, estMj = false } = props;
  const cadre = useRef<HTMLElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const calque = useRef<HTMLCanvasElement>(null);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [vue, setVue] = useState<Vue>(VUE_ENTIERE);
  const glisse = useRef<{ x: number; y: number } | null>(null);
  const [tailleImage, setTailleImage] = useState<{ l: number; h: number } | null>(null);
  // L'image ne s'affiche qu'une fois chargée et, s'il y a du brouillard, une fois celui-ci dessiné.
  const [pret, setPret] = useState(false);
  const [tailleZone, setTailleZone] = useState<{ l: number; h: number }>({ l: 0, h: 0 });
  // Outil brouillard (MJ) : peindre pour révéler ou recouvrir, avec un pinceau rond.
  const brouillardActif = !!brouillard?.actif;
  const [outil, setOutil] = useState<"deplacer" | "brouillard">("deplacer");
  const [reveler, setReveler] = useState(true);
  const [taillePinceau, setTaillePinceau] = useState(0.05);
  const [enCours, setEnCours] = useState<TraitBrouillard[]>([]);
  const peint = useRef(false);
  const [curseur, setCurseur] = useState<{ x: number; y: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const outilBrouillard = estMj && brouillardActif && outil === "brouillard";

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
  useEffect(() => {
    setVue(VUE_ENTIERE);
    setTailleImage(null);
    setPret(false);
  }, [props.id]);

  // Brouillard désactivé : on revient à l'outil Déplacer.
  useEffect(() => {
    if (!brouillardActif) setOutil("deplacer");
  }, [brouillardActif]);

  // Taille du cadre, pour placer le calque du brouillard exactement sur l'image.
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesurer = () => setTailleZone({ l: el.clientWidth, h: el.clientHeight });
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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

  // Rectangle où l'image est affichée dans le cadre (elle y tient entière, centrée).
  const ajuste = tailleImage && tailleZone.l > 0 ? Math.min(tailleZone.l / tailleImage.l, tailleZone.h / tailleImage.h) : 0;
  const rectImage = tailleImage
    ? {
        left: (tailleZone.l - tailleImage.l * ajuste) / 2,
        top: (tailleZone.h - tailleImage.h * ajuste) / 2,
        width: tailleImage.l * ajuste,
        height: tailleImage.h * ajuste,
      }
    : null;
  const echelleCalque = tailleImage ? Math.min(1, BROUILLARD_RESOLUTION_MAX / Math.max(tailleImage.l, tailleImage.h)) : 1;
  const rayonPinceau = tailleImage ? taillePinceau * Math.max(tailleImage.l, tailleImage.h) : 0;

  // Dessin du brouillard : coups enregistrés + coups en cours (aperçu immédiat pour le MJ).
  useEffect(() => {
    const c = calque.current;
    if (!c || !tailleImage || !brouillardActif) return;
    c.width = Math.round(tailleImage.l * echelleCalque);
    c.height = Math.round(tailleImage.h * echelleCalque);
    const ctx = c.getContext("2d");
    if (ctx) dessinerBrouillard(ctx, [...(brouillard?.traits ?? []), ...enCours], echelleCalque);
    setPret(true);
  }, [brouillard?.traits, enCours, tailleImage, brouillardActif, echelleCalque, rectImage !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sans brouillard, l'image est prête dès qu'elle est chargée.
  useEffect(() => {
    if (tailleImage && !brouillardActif) setPret(true);
  }, [tailleImage, brouillardActif]);

  /** Position de la souris en pixels de l'image. */
  function pointImage(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = zone.current?.getBoundingClientRect();
    if (!r || !rectImage || !ajuste) return null;
    const px = (clientX - r.left - vue.x) / vue.zoom;
    const py = (clientY - r.top - vue.y) / vue.zoom;
    return { x: (px - rectImage.left) / ajuste, y: (py - rectImage.top) / ajuste };
  }

  function ajouterCoup(clientX: number, clientY: number) {
    const p = pointImage(clientX, clientY);
    if (!p) return;
    setEnCours((l) => {
      const dernier = l.at(-1);
      // On ne garde qu'un coup tous les tiers de rayon : trait continu, sans surcharge.
      if (dernier && !("tout" in dernier) && Math.hypot(dernier.x - p.x, dernier.y - p.y) < rayonPinceau / 3) return l;
      return [...l, { x: p.x, y: p.y, r: rayonPinceau, reveler }];
    });
  }

  function terminerCoup() {
    if (!peint.current) return;
    peint.current = false;
    const coups = enCours;
    if (coups.length === 0 || !sceneId) return;
    for (let i = 0; i < coups.length; i += TRAITS_PAR_ENVOI_MAX) {
      const dernierLot = i + TRAITS_PAR_ENVOI_MAX >= coups.length;
      socket.emit("mj:brouillard:peindre", { sceneId, traits: coups.slice(i, i + TRAITS_PAR_ENVOI_MAX) }, (r: Reponse) => {
        setErreur(r.ok ? null : r.erreur);
        // La scène mise à jour arrive avant la réponse : on peut retirer l'aperçu.
        if (dernierLot) setEnCours([]);
      });
    }
  }

  const zoome = vue.zoom > 1.001;
  const classesZone = ["scene-zone"];
  if (zoome && !outilBrouillard) classesZone.push("zoomee");
  if (outilBrouillard) classesZone.push("pinceau");

  return (
    <figure className={pleinEcran ? "scene-affichage plein" : "scene-affichage"} ref={cadre}>
      <div className="barres-scene">
        {/* Ligne 1 : la scène (nom, la montrer ou non) et le plein écran. */}
        <div className="barre barre-scene">
          <span className="scene-titre">{props.titre}</span>
          <span className="actions-scene">{props.bandeau}</span>
        </div>
        {/* Ligne 2 : les outils (MJ, si le brouillard est actif) ; la navigation (zoom, plein écran) à droite. */}
        <div className="barre barre-outils">
          {estMj && brouillardActif && (
            <span className="groupe-outils" role="group" aria-label="Outil">
              <button type="button" className={outil === "deplacer" ? "outil actif" : "outil secondaire"} onClick={() => setOutil("deplacer")}>
                ✋ Déplacer
              </button>
              <button type="button" className={outil === "brouillard" ? "outil actif" : "outil secondaire"} onClick={() => setOutil("brouillard")}>
                ☁️ Brouillard
              </button>
            </span>
          )}
          <span className="navigation" role="group" aria-label="Navigation">
            <button type="button" className="secondaire" aria-label="Dézoomer" disabled={!zoome} onClick={() => zoomerAuCentre(1 / 1.5)}>
              −
            </button>
            <span
              className="zoom-valeur"
              title={
                pleinEcran
                  ? "Molette : zoomer · glisser : se déplacer · double-clic : zoomer ici"
                  : "Ctrl + molette : zoomer · glisser : se déplacer · double-clic : zoomer ici"
              }
            >
              {Math.round(vue.zoom * 100)} %
            </span>
            <button type="button" className="secondaire" aria-label="Zoomer" disabled={vue.zoom >= ZOOM_MAX} onClick={() => zoomerAuCentre(1.5)}>
              +
            </button>
            <button type="button" className="secondaire" disabled={!zoome} onClick={() => setVue(VUE_ENTIERE)}>
              Ajuster
            </button>
            <button
              type="button"
              className="secondaire"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void cadre.current?.requestFullscreen();
              }}
            >
              {pleinEcran ? "⛶ Quitter le plein écran" : "⛶ Plein écran"}
            </button>
          </span>
        </div>
        {/* Ligne 3 : réglages de l'outil Brouillard. */}
        {outilBrouillard && (
          <div className="barre barre-options">
            <span className="nom-options">Brouillard :</span>
            <span className="groupe-outils" role="group" aria-label="Révéler ou recouvrir">
              <button type="button" className={reveler ? "outil actif" : "outil secondaire"} onClick={() => setReveler(true)}>
                Révéler
              </button>
              <button type="button" className={!reveler ? "outil actif" : "outil secondaire"} onClick={() => setReveler(false)}>
                Recouvrir
              </button>
            </span>
            <label className="taille-pinceau">
              <span>🖌 Taille</span>
              <input
                type="range"
                min={PINCEAU_MIN}
                max={PINCEAU_MAX}
                step={0.005}
                value={taillePinceau}
                onChange={(e) => setTaillePinceau(Number(e.target.value))}
              />
            </label>
          </div>
        )}
      </div>
      <div
        ref={zone}
        className={classesZone.join(" ")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (outilBrouillard) {
            e.currentTarget.setPointerCapture(e.pointerId);
            peint.current = true;
            ajouterCoup(e.clientX, e.clientY);
            return;
          }
          if (!zoome) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          glisse.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (outilBrouillard) {
            const r = e.currentTarget.getBoundingClientRect();
            setCurseur({ x: e.clientX - r.left, y: e.clientY - r.top });
            if (peint.current) ajouterCoup(e.clientX, e.clientY);
            return;
          }
          const depart = glisse.current;
          if (!depart) return;
          const r = e.currentTarget.getBoundingClientRect();
          const dx = e.clientX - depart.x;
          const dy = e.clientY - depart.y;
          glisse.current = { x: e.clientX, y: e.clientY };
          setVue((v) => borner({ zoom: v.zoom, x: v.x + dx, y: v.y + dy }, r.width, r.height));
        }}
        onPointerUp={() => {
          glisse.current = null;
          terminerCoup();
        }}
        onPointerCancel={() => {
          glisse.current = null;
          terminerCoup();
        }}
        onPointerLeave={() => setCurseur(null)}
        onDoubleClick={(e) => {
          if (outilBrouillard) return;
          const r = e.currentTarget.getBoundingClientRect();
          setVue((v) => zoomerVers(v, v.zoom * 2, e.clientX - r.left, e.clientY - r.top, r.width, r.height));
        }}
      >
        <div
          className="scene-contenu"
          style={{
            transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.zoom})`,
            visibility: pret ? "visible" : "hidden",
          }}
        >
          <img
            src={urlImage(props.id)}
            alt={props.titre}
            draggable={false}
            onLoad={(e) => setTailleImage({ l: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {brouillardActif && rectImage && (
            <canvas
              ref={calque}
              className={estMj ? "calque-brouillard voile" : "calque-brouillard"}
              style={{ left: rectImage.left, top: rectImage.top, width: rectImage.width, height: rectImage.height }}
            />
          )}
        </div>
        {!pret && <p className="chargement-scene discret">Chargement…</p>}
        {outilBrouillard && curseur && (
          // Aperçu du pinceau sous la souris.
          <div
            className={reveler ? "curseur-pinceau" : "curseur-pinceau recouvrir"}
            style={{
              left: curseur.x,
              top: curseur.y,
              width: rayonPinceau * ajuste * vue.zoom * 2,
              height: rayonPinceau * ajuste * vue.zoom * 2,
            }}
          />
        )}
        {astuce && (
          <div className="astuce-zoom" aria-hidden="true">
            <kbd>Ctrl</kbd> + molette pour zoomer
          </div>
        )}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
    </figure>
  );
}

/** MJ : préparer une illustration (brouillard de guerre au pinceau). */
function PreparerIllustration(props: { scene: SceneDonnees }) {
  const { scene } = props;
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const repondre = (r: Reponse) => setErreur(r.ok ? null : r.erreur);
  return (
    <section className="reglages-carte">
      <h3>Préparer la scène (toi seul vois ces réglages)</h3>
      <div className="bloc-reglages premier">
        <h4>Brouillard de guerre</h4>
        <label className="case">
          <input
            type="checkbox"
            checked={scene.brouillard.actif}
            onChange={(e) => socket.emit("mj:brouillard:activer", { sceneId: scene.id, actif: e.target.checked }, repondre)}
          />
          <span>Activer le brouillard sur cette illustration</span>
        </label>
        {scene.brouillard.actif && (
          <>
            <p className="discret petit">
              Les joueurs ne voient que ce que tu dévoiles (toi, tu vois l'image à travers un voile). Choisis
              l'outil <strong>Brouillard</strong> au-dessus de l'image, puis peins pour <strong>Révéler</strong> ou{" "}
              <strong>Recouvrir</strong> ; règle la taille du pinceau avec le curseur.
            </p>
            <div className="boutons-participants">
              <button
                type="button"
                className="secondaire"
                onClick={() => socket.emit("mj:brouillard:peindre", { sceneId: scene.id, traits: [{ tout: true, reveler: true }] }, repondre)}
              >
                Tout révéler
              </button>
              <button
                type="button"
                className={confirmer ? "danger" : "secondaire"}
                onClick={() => {
                  if (!confirmer) {
                    setConfirmer(true);
                    window.setTimeout(() => setConfirmer(false), 4000);
                    return;
                  }
                  setConfirmer(false);
                  socket.emit("mj:brouillard:toutCacher", { sceneId: scene.id }, repondre);
                }}
              >
                {confirmer ? "Confirmer : tout recouvrir" : "Tout recouvrir"}
              </button>
            </div>
          </>
        )}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
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

/** Glisser-déposer et flèches pour réordonner « Mes scènes ». */
interface Ordre {
  rang: number;
  total: number;
  deplacer: (versRang: number) => void;
  glisseeId: string | null;
  /** Survolée pendant un glisser : la scène glissée viendra au-dessus, ou en dessous si elle descend. */
  survolee: "dessus" | "dessous" | null;
  surDebutGlisse: () => void;
  surSurvol: () => void;
  surFinGlisse: () => void;
  surDepot: () => void;
}

function LigneScene(props: {
  scene: SceneDonnees;
  montree: boolean;
  preparee: boolean;
  images: ImageBibliotheque[];
  surErreur: (e: string | null) => void;
  ordre: Ordre;
}) {
  const { scene, montree, preparee, images, surErreur, ordre } = props;
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
  if (ordre.glisseeId === scene.id) classes.push("glissee");
  if (ordre.survolee && ordre.glisseeId !== scene.id) classes.push(`survolee-${ordre.survolee}`);

  return (
    <li
      className={classes.join(" ")}
      onDragOver={(e) => {
        if (!ordre.glisseeId) return;
        e.preventDefault();
        ordre.surSurvol();
      }}
      onDrop={(e) => {
        e.preventDefault();
        ordre.surDepot();
      }}
    >
      <div className="ordre-scene">
        <span
          className="poignee"
          draggable
          title="Glisser pour déplacer la scène"
          aria-hidden="true"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", scene.id);
            ordre.surDebutGlisse();
          }}
          onDragEnd={ordre.surFinGlisse}
        >
          ⋮⋮
        </span>
        <button
          type="button"
          className="fleche"
          aria-label={`Monter « ${scene.nom} »`}
          disabled={ordre.rang === 0}
          onClick={() => ordre.deplacer(ordre.rang - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="fleche"
          aria-label={`Descendre « ${scene.nom} »`}
          disabled={ordre.rang === ordre.total - 1}
          onClick={() => ordre.deplacer(ordre.rang + 1)}
        >
          ↓
        </button>
      </div>
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
            Ne plus montrer la scène
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
            Montrer la scène
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
  const [glisseeId, setGlisseeId] = useState<string | null>(null);
  const [survoleeId, setSurvoleeId] = useState<string | null>(null);

  /** Déplace une scène à un rang donné ; la liste ne change qu'une fois le serveur d'accord. */
  function deplacer(id: string, versRang: number) {
    if (!scenes) return;
    const ids = scenes.map((x) => x.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(versRang, ids.length)), 0, id);
    socket.emit("mj:ordonnerScenes", { ids }, (r: Reponse) => setErreur(r.ok ? null : r.erreur));
  }

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
          {scenes.map((s, rang) => (
            <LigneScene
              key={s.id}
              scene={s}
              montree={active?.id === s.id}
              preparee={preparee === s.id}
              images={images ?? []}
              surErreur={setErreur}
              ordre={{
                rang,
                total: scenes.length,
                deplacer: (versRang) => deplacer(s.id, versRang),
                glisseeId,
                survolee:
                  survoleeId !== s.id
                    ? null
                    : scenes.findIndex((x) => x.id === glisseeId) < rang
                      ? "dessous"
                      : "dessus",
                surDebutGlisse: () => setGlisseeId(s.id),
                surSurvol: () => setSurvoleeId(s.id),
                surFinGlisse: () => {
                  setGlisseeId(null);
                  setSurvoleeId(null);
                },
                surDepot: () => {
                  // Déposée sur une autre scène : elle prend sa place.
                  if (glisseeId && glisseeId !== s.id) deplacer(glisseeId, rang);
                  setGlisseeId(null);
                  setSurvoleeId(null);
                },
              }}
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
        Montrer la scène à tous
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
        Ne plus montrer la scène
      </button>
    )
  );

  return (
    <div className="scene">
      {affichee === null ? (
        <p className="discret scene-vide">
          {estMj
            ? "Aucune scène montrée. Crée une scène ci-dessous, puis clique sur « Montrer la scène »."
            : "Le MJ n'a pas encore montré de scène."}
        </p>
      ) : affichee.type === "immersive" ? (
        <Carte key={affichee.id} scene={affichee} moiId={moiId} estMj={estMj} bandeau={bandeau} />
      ) : (
        <>
          <Affichage
            id={affichee.image.id}
            titre={affichee.nom}
            bandeau={bandeau}
            brouillard={affichee.brouillard}
            sceneId={affichee.id}
            estMj={estMj}
          />
          {estMj && <PreparerIllustration scene={affichee} />}
        </>
      )}
      {estMj && <MesScenes brouillon={brouillon} surBrouillonUtilise={() => setBrouillon(null)} />}
      {estMj && <Bibliotheque surNouvelleScene={setBrouillon} />}
    </div>
  );
}
