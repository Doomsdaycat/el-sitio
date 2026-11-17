// Scène immersive : image, grille, pions ; zoom, règle de mesure et pointeur.
// Dessinée avec Konva (canvas). Le serveur décide : un pion déplacé ne bouge vraiment
// que lorsque le serveur a accepté et renvoyé la nouvelle position.

import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as ImageKonva, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import {
  caseSous,
  coinCase,
  COULEURS_PIONS,
  distanceCases,
  METRES_PAR_CASE,
  NOM_PION_MAX,
  TAILLE_CASE_MAX,
  TAILLE_CASE_MIN,
  type Case,
  type EtatPion,
  type Grille,
  type Pion,
} from "../../shared/carte.ts";
import { deplacement } from "../../shared/fiche.ts";
import type { Reponse } from "../../shared/messages.ts";
import { urlImage, type Scene } from "../../shared/scenes.ts";
import { socket } from "./connexion.ts";
import { ajouterPointeur, useEtat } from "./etat.ts";
import { nomPersonnage } from "./noms.ts";

type Outil = "deplacer" | "regle" | "pointeur";

const ZOOM_MAX = 8;
const ZOOM_MIN = 0.5;

/** Charge une image pour Konva. */
function useImageChargee(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!url) return;
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);
  return image;
}

/**
 * Taille d'un élément HTML, mise à jour quand elle change.
 * L'élément peut apparaître plus tard (quand une carte est choisie) : on le suit dès qu'il existe.
 */
function useTaille(el: HTMLDivElement | null): { l: number; h: number } {
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const mesurer = () => setTaille({ l: el.clientWidth, h: el.clientHeight });
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);
  return taille;
}

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

/** Texte clair ou sombre selon la couleur du pion. */
function texteSur(couleur: string): string {
  const n = parseInt(couleur.slice(1), 16);
  const clarte = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return clarte > 150 ? "#1d1b22" : "#ffffff";
}

function libelleDistance(cases: number): string {
  return `${cases * METRES_PAR_CASE} m`;
}

/** Lignes de la grille, dessinées d'un coup sur toute l'image. */
function LignesGrille(props: { grille: Grille; l: number; h: number; echelle: number }) {
  const { grille, l, h, echelle } = props;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        ctx.beginPath();
        for (let x = grille.decalageX; x <= l; x += grille.taille) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = grille.decalageY; y <= h; y += grille.taille) {
          ctx.moveTo(0, y);
          ctx.lineTo(l, y);
        }
        // Trait fin et constant quel que soit le zoom : sombre dessous, clair dessus.
        ctx.lineWidth = 2.5 / echelle;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.stroke();
        ctx.lineWidth = 1 / echelle;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.stroke();
      }}
    />
  );
}

/** Étiquette lisible (fond sombre) posée sur la carte, à taille constante à l'écran. */
function Etiquette(props: { x: number; y: number; texte: string; echelle: number; couleur?: string }) {
  const taillePolice = 13 / props.echelle;
  const largeur = (props.texte.length * 7.2 + 12) / props.echelle;
  const hauteur = 20 / props.echelle;
  return (
    <Group x={props.x - largeur / 2} y={props.y} listening={false}>
      <Rect width={largeur} height={hauteur} fill="rgba(0,0,0,0.7)" cornerRadius={4 / props.echelle} />
      <Text
        width={largeur}
        height={hauteur}
        text={props.texte}
        fontSize={taillePolice}
        fill={props.couleur ?? "#ffffff"}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
}

/** Mesure entre deux cases : trait de centre à centre et distance. */
function Mesure(props: { de: Case; a: Case; grille: Grille; echelle: number; auteur?: string }) {
  const { de, a, grille, echelle } = props;
  const demi = grille.taille / 2;
  const p1 = coinCase(de, grille);
  const p2 = coinCase(a, grille);
  const cases = distanceCases(de, a);
  const texte = `${props.auteur ? props.auteur + " : " : ""}${cases} case${cases > 1 ? "s" : ""} · ${libelleDistance(cases)}`;
  return (
    <Group listening={false}>
      <Rect
        x={p2.x}
        y={p2.y}
        width={grille.taille}
        height={grille.taille}
        stroke="#c9a25b"
        strokeWidth={2 / echelle}
        fill="rgba(201,162,91,0.18)"
      />
      <Line
        points={[p1.x + demi, p1.y + demi, p2.x + demi, p2.y + demi]}
        stroke="#c9a25b"
        strokeWidth={3 / echelle}
        dash={[10 / echelle, 6 / echelle]}
      />
      <Etiquette x={p2.x + demi} y={p2.y + grille.taille + 4 / echelle} texte={texte} echelle={echelle} couleur="#f3d58f" />
    </Group>
  );
}

/** Signal animé qui s'agrandit et s'efface. */
function Signal(props: { x: number; y: number; auteur: string; echelle: number }) {
  const cercle = useRef<Konva.Circle>(null);
  useEffect(() => {
    cercle.current?.to({ radius: 60 / props.echelle, opacity: 0, duration: 1.6 });
  }, [props.echelle]);
  return (
    <Group listening={false}>
      <Circle x={props.x} y={props.y} radius={8 / props.echelle} fill="#c9a25b" />
      <Circle
        ref={cercle}
        x={props.x}
        y={props.y}
        radius={10 / props.echelle}
        stroke="#c9a25b"
        strokeWidth={4 / props.echelle}
        opacity={1}
      />
      <Etiquette x={props.x} y={props.y + 12 / props.echelle} texte={props.auteur} echelle={props.echelle} />
    </Group>
  );
}

function PionCarte(props: {
  pion: Pion;
  nom: string;
  grille: Grille;
  echelle: number;
  deplacable: boolean;
  /** Déplacement maximal du personnage (en mètres), si connu. */
  deplacementMax: number | null;
  surErreur: (e: string | null) => void;
}) {
  const { pion, nom, grille, echelle, deplacable, deplacementMax, surErreur } = props;
  const [glisse, setGlisse] = useState<Case | null>(null);
  const cote = pion.taille * grille.taille;
  const coin = coinCase(pion, grille);
  const depart: Case = { col: pion.col, lig: pion.lig };

  /** Case visée : celle du coin haut-gauche, d'après la position actuelle du pion. */
  function caseVisee(node: Konva.Node): Case {
    const c = caseSous(node.x() + grille.taille / 2, node.y() + grille.taille / 2, grille);
    return { col: Math.max(0, c.col), lig: Math.max(0, c.lig) };
  }

  const distance = glisse ? distanceCases(depart, glisse) : 0;
  const metres = distance * METRES_PAR_CASE;
  const trop = deplacementMax !== null && metres > deplacementMax;
  const visee = glisse ? coinCase(glisse, grille) : null;
  const mort = pion.etat === "mort";
  const aTerre = pion.etat === "a-terre";
  // Mention ajoutée au nom : (caché), mort, à terre.
  const mentions = [pion.cache ? "caché" : null, mort ? "mort" : null, aTerre ? "à terre" : null].filter(Boolean);
  const nomAffiche = mentions.length > 0 ? `${nom} (${mentions.join(", ")})` : nom;
  const r = cote * 0.42;

  return (
    <>
      {visee && (
        <Rect
          x={visee.x}
          y={visee.y}
          width={cote}
          height={cote}
          stroke={trop ? "#d9645a" : "#c9a25b"}
          strokeWidth={2 / echelle}
          dash={[8 / echelle, 5 / echelle]}
          listening={false}
        />
      )}
      <Group
        x={coin.x}
        y={coin.y}
        // Pion caché : le MJ le voit en transparence (les joueurs ne le reçoivent pas du tout).
        opacity={pion.cache ? 0.45 : 1}
        draggable={deplacable}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage && deplacable) stage.container().style.cursor = "grab";
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = "";
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          setGlisse(caseVisee(e.target));
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          setGlisse(caseVisee(e.target));
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          const node = e.target;
          const cible = caseVisee(node);
          setGlisse(null);
          // On pose le pion sur la case visée en attendant la confirmation du serveur.
          const p = coinCase(cible, grille);
          node.position(p);
          socket.emit("carte:deplacerPion", { id: pion.id, ...cible }, (r: Reponse) => {
            if (!r.ok) {
              node.position(coinCase(pion, grille));
              surErreur(r.erreur);
            } else {
              surErreur(null);
            }
          });
        }}
      >
        <Circle
          x={cote / 2}
          y={cote / 2}
          radius={r}
          // Mort : pion grisé.
          fill={mort ? "#5a5a5a" : pion.couleur}
          stroke={aTerre ? "#d9645a" : pion.type === "pj" ? "#f3d58f" : "#1d1b22"}
          strokeWidth={Math.max(2, cote * (aTerre ? 0.08 : 0.05))}
          dash={pion.cache || aTerre ? [cote * 0.12, cote * 0.08] : undefined}
          shadowColor="black"
          shadowBlur={6}
          shadowOpacity={0.5}
        />
        <Text
          width={cote}
          height={cote}
          text={initiales(nom)}
          fontSize={cote * 0.34}
          fontStyle="bold"
          fill={mort ? "#bdbdbd" : texteSur(pion.couleur)}
          align="center"
          verticalAlign="middle"
          // À terre : les initiales sont couchées.
          rotation={aTerre ? 90 : 0}
          x={aTerre ? cote : 0}
          listening={false}
        />
        {mort && (
          // Grande croix rouge sur un pion mort.
          <Line
            points={[cote / 2 - r * 0.7, cote / 2 - r * 0.7, cote / 2 + r * 0.7, cote / 2 + r * 0.7, cote / 2, cote / 2, cote / 2 + r * 0.7, cote / 2 - r * 0.7, cote / 2 - r * 0.7, cote / 2 + r * 0.7]}
            stroke="#d9645a"
            strokeWidth={Math.max(3, cote * 0.09)}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        )}
      </Group>
      <Etiquette
        x={(visee ?? coin).x + cote / 2}
        y={(visee ?? coin).y + cote + 2 / echelle}
        texte={glisse ? `${nom} · ${metres} m${deplacementMax !== null ? ` / ${deplacementMax} m` : ""}` : nomAffiche}
        echelle={echelle}
        couleur={(glisse && trop) || aTerre ? "#ff9a8f" : mort ? "#b0b0b0" : undefined}
      />
    </>
  );
}

interface Vue {
  x: number;
  y: number;
  /** Zoom par rapport à « carte entière » (1). */
  zoom: number;
}

export function Carte(props: {
  scene: Scene;
  moiId: number;
  estMj: boolean;
  /** Boutons propres au MJ (montrer, préparation…), affichés dans la barre d'outils. */
  bandeau?: React.ReactNode;
}) {
  const { scene, moiId, estMj } = props;
  const fiches = useEtat("fiches");
  const presents = useEtat("presents");
  const reglesDistantes = useEtat("reglesDistantes");
  const pointeurs = useEtat("pointeurs");

  const cadre = useRef<HTMLDivElement>(null);
  // Zone de dessin : suivie par « état » (et non par simple référence) pour la mesurer dès qu'elle existe.
  const [zone, setZone] = useState<HTMLDivElement | null>(null);
  const { l, h } = useTaille(zone);
  const image = useImageChargee(urlImage(scene.image.id));
  const [outil, setOutil] = useState<Outil>("deplacer");
  const [vue, setVue] = useState<Vue>({ x: 0, y: 0, zoom: 1 });
  const [maRegle, setMaRegle] = useState<{ de: Case; a: Case } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [astuce, setAstuce] = useState(false);
  const minuterieAstuce = useRef<number | undefined>(undefined);
  const dernierEnvoiRegle = useRef(0);

  // Échelle « carte entière » : l'image tient dans le cadre.
  const ajuste = image && l > 0 && h > 0 ? Math.min(l / image.width, h / image.height) : 1;
  const echelle = ajuste * vue.zoom;

  /** Revient à la carte entière, centrée. */
  function ajuster() {
    if (!image) return;
    setVue({ zoom: 1, x: (l - image.width * ajuste) / 2, y: (h - image.height * ajuste) / 2 });
  }

  // Nouvelle carte, image chargée ou cadre redimensionné : on montre la carte entière.
  useEffect(ajuster, [image, l, h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const suivre = () => setPleinEcran(document.fullscreenElement === cadre.current);
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);

  /** Zoome vers un point de l'écran (px, py dans le cadre). */
  function zoomerVers(facteur: number, px: number, py: number) {
    setVue((v) => {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * facteur));
      const ancienne = ajuste * v.zoom;
      const nouvelle = ajuste * zoom;
      return { zoom, x: px - ((px - v.x) * nouvelle) / ancienne, y: py - ((py - v.y) * nouvelle) / ancienne };
    });
  }

  // Molette : comme pour les scènes, Ctrl + molette en affichage normal, molette seule en plein écran.
  useEffect(() => {
    const el = zone;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      if (document.fullscreenElement !== cadre.current && !e.ctrlKey) {
        setAstuce(true);
        window.clearTimeout(minuterieAstuce.current);
        minuterieAstuce.current = window.setTimeout(() => setAstuce(false), 1200);
        return;
      }
      e.preventDefault();
      setAstuce(false);
      const r = el.getBoundingClientRect();
      zoomerVers(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => {
      el.removeEventListener("wheel", surMolette);
      window.clearTimeout(minuterieAstuce.current);
    };
  }, [ajuste, zone]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Position de la souris en pixels de l'image. */
  function pointImage(stage: Konva.Stage | null): { x: number; y: number } | null {
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - vue.x) / echelle, y: (p.y - vue.y) / echelle };
  }

  function envoyerRegle(mesure: { de: Case; a: Case } | null, forcer = false) {
    const maintenant = Date.now();
    if (!forcer && maintenant - dernierEnvoiRegle.current < 60) return;
    dernierEnvoiRegle.current = maintenant;
    socket.emit("carte:regle", { sceneId: scene.id, mesure });
  }

  const nomDuPion = (p: Pion) => {
    if (p.type === "pnj" || p.joueurId === null) return p.nom;
    const joueur = presents?.find((x) => x.id === p.joueurId)?.nom ?? "?";
    return nomPersonnage(fiches, p.joueurId, joueur);
  };
  const deplacementDuPion = (p: Pion) => {
    const fiche = p.joueurId !== null ? fiches?.find((f) => f.joueurId === p.joueurId) : undefined;
    return fiche ? deplacement(fiche) : null;
  };

  // Les pions des personnages joueurs passent au-dessus des PNJ, le sien tout en haut.
  const pionsOrdonnes = useMemo(
    () =>
      [...scene.pions].sort(
        (a, b) =>
          Number(b.etat === "mort") - Number(a.etat === "mort") ||
          Number(a.type === "pj") - Number(b.type === "pj") ||
          Number(a.joueurId === moiId) - Number(b.joueurId === moiId),
      ),
    [scene.pions, moiId],
  );

  const grille = scene.grille;
  // Règles et pointeurs des autres : seulement ceux de la scène affichée ici.
  const reglesIci = reglesDistantes.filter((r) => r.sceneId === scene.id);
  const pointeursIci = pointeurs.filter((p) => p.sceneId === scene.id);

  /** Case au centre de la vue (pour poser un nouveau pion à un endroit visible). */
  const centreVue = (): Case => {
    const c = caseSous((l / 2 - vue.x) / echelle, (h / 2 - vue.y) / echelle, grille);
    return { col: Math.max(0, c.col), lig: Math.max(0, c.lig) };
  };

  const curseur = outil === "regle" ? "crosshair" : outil === "pointeur" ? "pointer" : "";

  return (
    <div className="carte-combat">
      <figure className={pleinEcran ? "carte-cadre plein" : "carte-cadre"} ref={cadre}>
        <figcaption className="carte-outils">
          <span className="scene-titre">{scene.nom}</span>
          {props.bandeau}
          <span className="groupe-outils" role="group" aria-label="Outil">
            {(
              [
                ["deplacer", "Déplacer", "Glisser la carte ou un pion"],
                ["regle", "Règle", "Mesurer une distance (tout le monde la voit)"],
                ["pointeur", "Montrer", "Cliquer pour montrer un endroit à tous"],
              ] as const
            ).map(([id, nom, aide]) => (
              <button
                key={id}
                type="button"
                title={aide}
                className={outil === id ? "outil actif" : "outil secondaire"}
                onClick={() => setOutil(id)}
              >
                {nom}
              </button>
            ))}
          </span>
          <span className="zoom">
            <button type="button" className="secondaire" aria-label="Dézoomer" onClick={() => zoomerVers(1 / 1.5, l / 2, h / 2)}>
              −
            </button>
            <span className="zoom-valeur">{Math.round(vue.zoom * 100)} %</span>
            <button type="button" className="secondaire" aria-label="Zoomer" onClick={() => zoomerVers(1.5, l / 2, h / 2)}>
              +
            </button>
            <button type="button" className="secondaire" onClick={ajuster}>
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

        <div className="carte-zone" ref={setZone} style={{ cursor: curseur }}>
          {l > 0 && h > 0 && (
            <Stage
              width={l}
              height={h}
              onMouseDown={(e) => {
                if (outil !== "regle") return;
                const p = pointImage(e.target.getStage());
                if (!p) return;
                const c = caseSous(p.x, p.y, grille);
                setMaRegle({ de: c, a: c });
                envoyerRegle({ de: c, a: c }, true);
              }}
              onMouseMove={(e) => {
                if (outil !== "regle" || !maRegle) return;
                const p = pointImage(e.target.getStage());
                if (!p) return;
                const a = caseSous(p.x, p.y, grille);
                if (a.col === maRegle.a.col && a.lig === maRegle.a.lig) return;
                const mesure = { de: maRegle.de, a };
                setMaRegle(mesure);
                envoyerRegle(mesure);
              }}
              onMouseUp={() => {
                if (outil !== "regle" || !maRegle) return;
                setMaRegle(null);
                envoyerRegle(null, true);
              }}
              onMouseLeave={() => {
                if (maRegle) {
                  setMaRegle(null);
                  envoyerRegle(null, true);
                }
              }}
              onClick={(e) => {
                if (outil !== "pointeur") return;
                const p = pointImage(e.target.getStage());
                if (!p) return;
                ajouterPointeur(scene.id, "Toi", p.x, p.y);
                socket.emit("carte:pointeur", { sceneId: scene.id, ...p });
              }}
            >
              <Layer>
                <Group
                  x={vue.x}
                  y={vue.y}
                  scaleX={echelle}
                  scaleY={echelle}
                  draggable={outil === "deplacer"}
                  onDragMove={(e) => {
                    if (e.target === e.currentTarget) setVue((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
                  }}
                  onDragEnd={(e) => {
                    if (e.target === e.currentTarget) setVue((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
                  }}
                >
                  {image && <ImageKonva image={image} width={image.width} height={image.height} />}
                  {image && grille.visible && (
                    <LignesGrille grille={grille} l={image.width} h={image.height} echelle={echelle} />
                  )}
                  {pionsOrdonnes.map((p) => (
                    <PionCarte
                      key={p.id}
                      pion={p}
                      nom={nomDuPion(p)}
                      grille={grille}
                      echelle={echelle}
                      deplacable={outil === "deplacer" && (estMj || p.joueurId === moiId)}
                      deplacementMax={deplacementDuPion(p)}
                      surErreur={setErreur}
                    />
                  ))}
                  {reglesIci.map((r) => (
                    <Mesure key={r.auteurId} de={r.de} a={r.a} grille={grille} echelle={echelle} auteur={r.auteur} />
                  ))}
                  {maRegle && <Mesure de={maRegle.de} a={maRegle.a} grille={grille} echelle={echelle} />}
                  {pointeursIci.map((p) => (
                    <Signal key={p.cle} x={p.x} y={p.y} auteur={p.auteur} echelle={echelle} />
                  ))}
                </Group>
              </Layer>
            </Stage>
          )}
          {!image && <p className="carte-chargement discret">Chargement de la carte…</p>}
          {astuce && (
            <div className="astuce-zoom" aria-hidden="true">
              <kbd>Ctrl</kbd> + molette pour zoomer
            </div>
          )}
        </div>
      </figure>
      {erreur && <p className="erreur">{erreur}</p>}
      {estMj && <ReglagesMj scene={scene} centreVue={centreVue} nomDuPion={nomDuPion} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Réglages du MJ : grille de l'image, pions de PNJ de la scène

function Reglage(props: {
  nom: string;
  valeur: number;
  pas: number;
  min?: number;
  max?: number;
  surChangement: (v: number) => void;
}) {
  const { nom, valeur, pas, min, max, surChangement } = props;
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const borner = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(v * 10) / 10));
  return (
    <label className="reglage">
      <span>{nom}</span>
      <span className="reglage-valeurs">
        <button type="button" className="secondaire" onClick={() => surChangement(borner(valeur - pas))}>
          −
        </button>
        <input
          className="champ-nombre"
          inputMode="decimal"
          value={brouillon ?? String(valeur).replace(".", ",")}
          onFocus={(e) => {
            setBrouillon(String(valeur).replace(".", ","));
            e.currentTarget.select();
          }}
          onChange={(e) => setBrouillon(e.target.value)}
          onBlur={() => {
            const v = Number((brouillon ?? "").replace(",", "."));
            setBrouillon(null);
            if (Number.isFinite(v) && v !== valeur) surChangement(borner(v));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <button type="button" className="secondaire" onClick={() => surChangement(borner(valeur + pas))}>
          +
        </button>
      </span>
    </label>
  );
}

function ReglagesMj(props: { scene: Scene; centreVue: () => Case; nomDuPion: (p: Pion) => string }) {
  const { scene, centreVue, nomDuPion } = props;
  const [ajouterCache, setAjouterCache] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState<string>("#d9645a");
  const [taille, setTaille] = useState<1 | 2 | 3>(1);
  const repondre = (r: Reponse) => setErreur(r.ok ? null : r.erreur);
  const grille = scene.grille;
  const changerGrille = (changement: Partial<Grille>) =>
    socket.emit("mj:grille", { imageId: scene.image.id, grille: { ...grille, ...changement } }, repondre);
  const pnj = scene.pions.filter((p) => p.type === "pnj");
  const pj = scene.pions.filter((p) => p.type === "pj");
  const modifierPion = (id: string, changement: { etat?: EtatPion; cache?: boolean }) =>
    socket.emit("mj:modifierPion", { id, ...changement }, repondre);

  return (
    <section className="reglages-carte">
      <h3>Préparer la scène (toi seul vois ces réglages)</h3>
      {(
        <>
          <div className="bloc-reglages">
            <h4>Grille (1 case = 2 m)</h4>
            <p className="discret petit">
              Ajuste la taille, puis le décalage, jusqu'à ce que la grille tombe sur celle dessinée sur
              l'image. La grille est liée à l'image « {scene.image.nom} » : elle vaut pour toutes les
              scènes qui l'utilisent.
            </p>
            <div className="ligne-reglages">
              <Reglage nom="Taille d'une case (px)" valeur={grille.taille} pas={1} min={TAILLE_CASE_MIN} max={TAILLE_CASE_MAX} surChangement={(v) => changerGrille({ taille: v })} />
              <Reglage nom="Décalage horizontal" valeur={grille.decalageX} pas={1} surChangement={(v) => changerGrille({ decalageX: v })} />
              <Reglage nom="Décalage vertical" valeur={grille.decalageY} pas={1} surChangement={(v) => changerGrille({ decalageY: v })} />
              <label className="case">
                <input type="checkbox" checked={grille.visible} onChange={(e) => changerGrille({ visible: e.target.checked })} />
                <span>Afficher la grille</span>
              </label>
            </div>
          </div>

          <div className="bloc-reglages">
            <h4>Pions de PNJ et de monstres</h4>
            <form
              className="ajout-pion"
              onSubmit={(e) => {
                e.preventDefault();
                socket.emit("mj:ajouterPion", { sceneId: scene.id, nom, couleur, taille, cache: ajouterCache, ...centreVue() }, (r: Reponse) => {
                  repondre(r);
                  if (r.ok) setNom("");
                });
              }}
            >
              <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={NOM_PION_MAX} placeholder="ex. : Gobelin 1" aria-label="Nom du pion" />
              <select value={couleur} onChange={(e) => setCouleur(e.target.value)} aria-label="Couleur">
                {COULEURS_PIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
              <select value={taille} onChange={(e) => setTaille(Number(e.target.value) as 1 | 2 | 3)} aria-label="Taille">
                <option value={1}>1 case</option>
                <option value={2}>2 × 2 cases</option>
                <option value={3}>3 × 3 cases</option>
              </select>
              <label className="case">
                <input type="checkbox" checked={ajouterCache} onChange={(e) => setAjouterCache(e.target.checked)} />
                <span>caché aux joueurs</span>
              </label>
              <button type="submit" className="secondaire" disabled={nom.trim() === ""}>
                Ajouter
              </button>
            </form>
            <p className="discret petit">
              Le pion apparaît au centre de ta vue ; fais-le glisser où tu veux. Un pion caché n'est pas
              envoyé aux joueurs : tu le vois en transparence, et tu le révèles au bon moment.
            </p>
            {pnj.length > 0 && (
              <ul className="liste-pions-mj">
                {pnj.map((p) => (
                  <li key={p.id} className={p.cache ? "cache" : undefined}>
                    <span className="pastille-couleur" style={{ background: p.couleur }} />
                    <span className="nom-pion">
                      {p.nom}
                      {p.taille > 1 && <span className="discret petit"> ({p.taille}×{p.taille})</span>}
                      {p.etat === "mort" && <span className="mention-pion">mort</span>}
                      {p.cache && <span className="mention-pion discrete">caché</span>}
                    </span>
                    <button type="button" className="secondaire" onClick={() => modifierPion(p.id, { cache: !p.cache })}>
                      {p.cache ? "Révéler" : "Cacher"}
                    </button>
                    <button
                      type="button"
                      className="secondaire"
                      onClick={() => modifierPion(p.id, { etat: p.etat === "mort" ? "normal" : "mort" })}
                    >
                      {p.etat === "mort" ? "Pas mort" : "Mort"}
                    </button>
                    <button type="button" className="lien" onClick={() => socket.emit("mj:retirerPion", { id: p.id }, repondre)}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pj.length > 0 && (
            <div className="bloc-reglages">
              <h4>Personnages joueurs</h4>
              <ul className="liste-pions-mj">
                {pj.map((p) => (
                  <li key={p.id}>
                    <span className="pastille-couleur" style={{ background: p.couleur }} />
                    <span className="nom-pion">
                      {nomDuPion(p)}
                      {p.etat === "a-terre" && <span className="mention-pion">à terre</span>}
                    </span>
                    <button
                      type="button"
                      className="secondaire"
                      onClick={() => modifierPion(p.id, { etat: p.etat === "a-terre" ? "normal" : "a-terre" })}
                    >
                      {p.etat === "a-terre" ? "Relever" : "À terre"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
