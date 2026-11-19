// Scène immersive : image, grille, pions ; zoom, règle de mesure et pointeur.
// Dessinée avec Konva (canvas). Le serveur décide : un pion déplacé ne bouge vraiment
// que lorsque le serveur a accepté et renvoyé la nouvelle position.

import Konva from "konva";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import {
  carteCourante,
  decouperTrace,
  deplacementDuRound,
  deplacementRestant,
  estSonTour,
  type EtapeTrace,
} from "../../shared/combat.ts";
import { deplacement } from "../../shared/fiche.ts";
import type { Reponse } from "../../shared/messages.ts";
import { casesDuRectangle, cleCase, CASES_PAR_ENVOI_MAX, type Brouillard } from "../../shared/brouillard.ts";
import { urlImage, type Scene } from "../../shared/scenes.ts";
import { socket } from "./connexion.ts";
import { ajouterPointeur, useEtat } from "./etat.ts";
import { BlocReglages, PanneauReglages } from "./ReglagesScene.tsx";
import { nomPersonnage } from "./noms.ts";

type Outil = "deplacer" | "regle" | "pointeur" | "brouillard";

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
function Etiquette(props: {
  x: number;
  y: number;
  texte: string;
  echelle: number;
  couleur?: string;
  /** Largeur maximale (en pixels de l'image) : au-delà, le texte est raccourci avec « … ». */
  largeurMax?: number;
}) {
  const taillePolice = 13 / props.echelle;
  const largeurTexte = (props.texte.length * 7.2 + 12) / props.echelle;
  const largeur = props.largeurMax !== undefined ? Math.min(largeurTexte, props.largeurMax) : largeurTexte;
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
        padding={3 / props.echelle}
        wrap="none"
        ellipsis
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

/**
 * Chemin d'un pion pendant le round de combat : pointillés dorés de case en case, un point à
 * chaque étape, et la distance totale près du départ. Pour un personnage joueur, la partie qui
 * dépasse son déplacement autorisé du round est en rouge.
 */
function Trace(props: {
  points: EtapeTrace[];
  taille: number;
  grille: Grille;
  echelle: number;
  actif: boolean;
  /** Déplacement autorisé du round, en mètres (null : pas de limite). */
  limite: number | null;
}) {
  const { points, taille, grille, echelle, actif, limite } = props;
  if (points.length < 2) return null;
  const demi = (taille * grille.taille) / 2;
  // Centre d'une case (les coordonnées peuvent tomber entre deux cases, à la limite).
  const centre = (c: { col: number; lig: number }) => ({
    x: grille.decalageX + c.col * grille.taille + demi,
    y: grille.decalageY + c.lig * grille.taille + demi,
  });
  const { morceaux, metres, depassement } = decouperTrace(points, limite);
  const dore = actif ? "#f3d58f" : "#c9a25b";
  const rouge = "#ff6b5e";
  const etapes = points.slice(0, -1).map(centre);
  const depart = centre(points[0]);
  return (
    <Group listening={false} opacity={actif ? 1 : 0.8}>
      {morceaux.map((m, i) => {
        const a = centre(m.de);
        const b = centre(m.a);
        return (
          <Group key={i}>
            <Line points={[a.x, a.y, b.x, b.y]} stroke="rgba(0,0,0,0.55)" strokeWidth={7 / echelle} lineCap="round" />
            <Line
              points={[a.x, a.y, b.x, b.y]}
              stroke={m.depasse ? rouge : dore}
              strokeWidth={(m.depasse ? 5 : 4) / echelle}
              dash={m.depasse ? undefined : [12 / echelle, 7 / echelle]}
              lineCap="round"
            />
          </Group>
        );
      })}
      {etapes.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={(i === 0 ? 6 : 4) / echelle} fill={dore} stroke="#1d1b22" strokeWidth={1.5 / echelle} />
      ))}
      <Etiquette
        x={depart.x}
        y={depart.y + 8 / echelle}
        texte={depassement > 0 ? `${metres} m parcourus (${depassement} m de trop)` : `${metres} m parcourus`}
        echelle={echelle}
        couleur={depassement > 0 ? rouge : "#f3d58f"}
      />
    </Group>
  );
}

/** Révélation d'un pion caché : anneau doré qui s'agrandit et étincelles qui jaillissent. */
function Eclat(props: { x: number; y: number; rayon: number }) {
  const { x, y, rayon } = props;
  const anneau = useRef<Konva.Circle>(null);
  const anneau2 = useRef<Konva.Circle>(null);
  const etincelles = useRef<(Konva.Circle | null)[]>([]);
  const NB = 12;
  useEffect(() => {
    // Toute l'animation tient en 1 seconde.
    anneau.current?.to({ radius: rayon * 3, opacity: 0, strokeWidth: 1, duration: 1, easing: Konva.Easings.EaseOut });
    anneau2.current?.to({ radius: rayon * 2.2, opacity: 0, duration: 0.75, easing: Konva.Easings.EaseOut });
    etincelles.current.forEach((e, i) => {
      if (!e) return;
      const angle = (i / NB) * Math.PI * 2;
      const portee = rayon * (2.2 + (i % 3) * 0.4);
      e.to({
        x: x + Math.cos(angle) * portee,
        y: y + Math.sin(angle) * portee,
        opacity: 0,
        radius: rayon * 0.04,
        duration: 0.8 + (i % 4) * 0.06,
        easing: Konva.Easings.EaseOut,
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Group listening={false}>
      <Circle ref={anneau} x={x} y={y} radius={rayon} stroke="#f3d58f" strokeWidth={rayon * 0.18} opacity={0.95} shadowColor="#f3d58f" shadowBlur={20} />
      <Circle ref={anneau2} x={x} y={y} radius={rayon * 0.6} fill="rgba(243,213,143,0.55)" opacity={0.9} />
      {Array.from({ length: NB }, (_, i) => (
        <Circle
          key={i}
          ref={(n) => {
            etincelles.current[i] = n;
          }}
          x={x}
          y={y}
          radius={rayon * 0.11}
          fill={i % 2 === 0 ? "#f3d58f" : "#ffffff"}
          shadowColor="#f3d58f"
          shadowBlur={8}
        />
      ))}
    </Group>
  );
}

/** Toutes les cases qui touchent l'image (la grille peut déborder un peu sur les bords). */
function casesDeLImage(l: number, h: number, g: Grille): Case[] {
  const colMin = Math.floor(-g.decalageX / g.taille);
  const ligMin = Math.floor(-g.decalageY / g.taille);
  const colMax = Math.floor((l - 1 - g.decalageX) / g.taille);
  const ligMax = Math.floor((h - 1 - g.decalageY) / g.taille);
  return casesDuRectangle({ col: colMin, lig: ligMin }, { col: colMax, lig: ligMax });
}

/**
 * Brouillard de guerre : toutes les cases non révélées sont couvertes.
 * Opaque pour les joueurs ; voile sombre pour le MJ, qui voit ce qu'il cache.
 */
function CoucheBrouillard(props: { brouillard: Brouillard; grille: Grille; l: number; h: number; estMj: boolean }) {
  const { brouillard, grille, l, h, estMj } = props;
  const cases = useMemo(() => {
    const reveles = new Set(brouillard.reveles);
    return casesDeLImage(l, h, grille).filter((c) => !reveles.has(cleCase(c)));
  }, [brouillard.reveles, grille, l, h]);
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        ctx.beginPath();
        for (const c of cases) {
          const x = Math.max(0, grille.decalageX + c.col * grille.taille);
          const y = Math.max(0, grille.decalageY + c.lig * grille.taille);
          const x2 = Math.min(l, grille.decalageX + (c.col + 1) * grille.taille);
          const y2 = Math.min(h, grille.decalageY + (c.lig + 1) * grille.taille);
          // Un léger chevauchement évite les fines lignes claires entre deux cases.
          ctx.rect(x - 0.5, y - 0.5, x2 - x + 1, y2 - y + 1);
        }
        ctx.fillStyle = estMj ? "rgba(8, 6, 14, 0.55)" : "#0b0a0e";
        ctx.fill();
      }}
    />
  );
}

/** MJ : aperçu des cases qu'il est en train de révéler (doré) ou de recouvrir (sombre). */
function ApercuBrouillard(props: { cases: Case[]; grille: Grille; reveler: boolean; echelle: number }) {
  const { cases, grille, reveler, echelle } = props;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, forme) => {
        ctx.beginPath();
        for (const c of cases) {
          ctx.rect(grille.decalageX + c.col * grille.taille, grille.decalageY + c.lig * grille.taille, grille.taille, grille.taille);
        }
        ctx.fillStrokeShape(forme);
      }}
      fill={reveler ? "rgba(243, 213, 143, 0.28)" : "rgba(0, 0, 0, 0.45)"}
      stroke={reveler ? "#f3d58f" : "#9c94a8"}
      strokeWidth={2 / echelle}
    />
  );
}

/** Couleur du signal « Pointer du doigt » : le vert mousse de l'interface, plus clair et plus vif pour se voir sur la carte. */
const COULEUR_SIGNAL = "#cdee55";

/** Signal animé qui s'agrandit et s'efface. */
function Signal(props: { x: number; y: number; auteur: string; echelle: number }) {
  const cercle = useRef<Konva.Circle>(null);
  useEffect(() => {
    cercle.current?.to({ radius: 60 / props.echelle, opacity: 0, duration: 1.6 });
  }, [props.echelle]);
  return (
    <Group listening={false}>
      <Circle x={props.x} y={props.y} radius={8 / props.echelle} fill={COULEUR_SIGNAL} stroke="#191e1b" strokeWidth={1.5 / props.echelle} />
      <Circle
        ref={cercle}
        x={props.x}
        y={props.y}
        radius={10 / props.echelle}
        stroke={COULEUR_SIGNAL}
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
  /** En combat, pour son propre pion : déplacement restant et total du round (en mètres). */
  limiteRound: { restant: number; total: number } | null;
  /** C'est au tour de ce pion dans le combat. */
  actif: boolean;
  /** Le MJ vient de révéler ce pion : il apparaît en grossissant. */
  revele: boolean;
  /** La souris est sur ce pion : son nom complet s'affiche (et il passe au premier plan). */
  survole: boolean;
  surSurvol: (survole: boolean) => void;
  surErreur: (e: string | null) => void;
}) {
  const { pion, nom, grille, echelle, deplacable, deplacementMax, limiteRound, actif, revele, surErreur } = props;
  const contenu = useRef<Konva.Group>(null);
  useEffect(() => {
    const g = contenu.current;
    if (!revele || !g) return;
    g.scale({ x: 0.15, y: 0.15 });
    g.to({ scaleX: 1, scaleY: 1, duration: 0.6, easing: Konva.Easings.BackEaseOut });
  }, [revele]);
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
  // En combat, la limite est ce qui reste du round ; sinon, le déplacement de la fiche.
  const trop = limiteRound ? metres > limiteRound.restant : deplacementMax !== null && metres > deplacementMax;
  const texteGlisse = limiteRound
    ? `${nom} · ${metres} m (reste ${Math.max(0, limiteRound.restant - metres)} m / ${limiteRound.total} m)`
    : `${nom} · ${metres} m${deplacementMax !== null ? ` / ${deplacementMax} m` : ""}`;
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
          props.surSurvol(true);
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = "";
          props.surSurvol(false);
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
        {/* Contenu du pion, centré : permet l'effet d'apparition (il « grossit » depuis son centre). */}
        <Group ref={contenu} x={cote / 2} y={cote / 2} offsetX={cote / 2} offsetY={cote / 2}>
        {actif && (
          // Tour en cours dans le combat : halo doré autour du pion.
          <Circle
            x={cote / 2}
            y={cote / 2}
            radius={r * 1.22}
            stroke="#f3d58f"
            strokeWidth={Math.max(3, cote * 0.07)}
            shadowColor="#f3d58f"
            shadowBlur={18}
            shadowOpacity={0.9}
            listening={false}
          />
        )}
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
      </Group>
      {/* Nom limité à la largeur du pion (pas de chevauchement entre voisins) ; complet au survol
          ou en glissant. Pion trop petit à l'écran : seulement les initiales, sauf au survol. */}
      {(glisse || props.survole || cote * echelle >= 36) && (
        <Etiquette
          x={(visee ?? coin).x + cote / 2}
          y={(visee ?? coin).y + cote + 2 / echelle}
          texte={glisse ? texteGlisse : nomAffiche}
          echelle={echelle}
          couleur={(glisse && trop) || aTerre ? "#ff9a8f" : mort ? "#b0b0b0" : undefined}
          largeurMax={glisse || props.survole ? undefined : cote}
        />
      )}
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
  /** MJ : menu des scènes, à la place du nom de la scène. */
  entete?: React.ReactNode;
}) {
  const { scene, moiId, estMj } = props;
  const fiches = useEtat("fiches");
  const presents = useEtat("presents");
  const reglesDistantes = useEtat("reglesDistantes");
  const pointeurs = useEtat("pointeurs");
  const reglagesOuverts = useEtat("reglagesOuverts");
  const revelations = useEtat("revelations");
  const annulables = useEtat("annulables");

  const cadre = useRef<HTMLDivElement>(null);
  // Zone de dessin : suivie par « état » (et non par simple référence) pour la mesurer dès qu'elle existe.
  const [zone, setZone] = useState<HTMLDivElement | null>(null);
  const { l, h } = useTaille(zone);
  const image = useImageChargee(urlImage(scene.image.id));
  const [outil, setOutil] = useState<Outil>("deplacer");
  const [vue, setVue] = useState<Vue>({ x: 0, y: 0, zoom: 1 });
  const [maRegle, setMaRegle] = useState<{ de: Case; a: Case } | null>(null);
  // Outil brouillard (MJ) : révéler ou recouvrir, par rectangle ou au pinceau.
  const [brouillardReveler, setBrouillardReveler] = useState(true);
  const [brouillardPinceau, setBrouillardPinceau] = useState(false);
  const [saisie, setSaisie] = useState<{ debut: Case; fin: Case; peintes: Map<string, Case> } | null>(null);
  // Brouillard désactivé (ou autre scène sans brouillard) : on revient à l'outil Déplacer.
  useEffect(() => {
    if (outil === "brouillard" && (!estMj || !scene.brouillard.actif)) setOutil("deplacer");
  }, [outil, estMj, scene.brouillard.actif]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [astuce, setAstuce] = useState(false);
  const survolCarte = useRef(false);

  /** Annule mon dernier déplacement de pion (le serveur sait lequel). */
  function annulerDeplacement() {
    socket.emit("carte:annulerDeplacement", {}, (r: Reponse) => setErreur(r.ok ? null : r.erreur));
  }

  // Ctrl + Z quand la souris est sur la carte (et pas dans un champ de saisie) : annuler.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable)) return;
      if (!survolCarte.current) return;
      e.preventDefault();
      annulerDeplacement();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Combat en cours dans cette scène : pion dont c'est le tour, et déplacement restant du round.
  const combat = useEtat("combat");
  const courante = combat ? carteCourante(combat) : null;
  const combattantActif = courante ? combat?.combattants.find((x) => x.id === courante.combattantId) : undefined;
  const pionActif = (p: Pion) =>
    !!combattantActif &&
    (combattantActif.type === "pj" ? p.joueurId === combattantActif.joueurId : p.id === combattantActif.pionId);
  /** Déplacement autorisé du round pour le pion d'un personnage joueur (tout le monde voit le dépassement). */
  const limiteTrace = (p: Pion): number | null => {
    if (!combat || p.joueurId === null) return null;
    const x = combat.combattants.find((y) => y.type === "pj" && y.joueurId === p.joueurId);
    return deplacementDuRound(x ? combat.mouvements[x.id] : undefined, deplacementDuPion(p));
  };
  /**
   * Déplacement restant affiché en glissant : pour le joueur qui bouge son propre pion, ou pour
   * le MJ qui bouge le pion d'un joueur pendant son tour (il joue à sa place ; ça compte aussi).
   */
  const limiteRound = (p: Pion) => {
    if (!combat || combat.phase !== "round" || p.joueurId === null) return null;
    const concerne = estMj ? estSonTour(combat, p.joueurId) : p.joueurId === moiId;
    if (!concerne) return null;
    const x = combat.combattants.find((y) => y.type === "pj" && y.joueurId === p.joueurId);
    const m = x ? combat.mouvements[x.id] : undefined;
    const dep = deplacementDuPion(p);
    const restant = deplacementRestant(m, dep);
    const total = deplacementDuRound(m, dep);
    return restant === null || total === null ? null : { restant, total };
  };

  // Les pions des personnages joueurs passent au-dessus des PNJ, le sien tout en haut.
  const [pionSurvole, setPionSurvole] = useState<string | null>(null);
  const pionsOrdonnes = useMemo(
    () =>
      [...scene.pions].sort(
        (a, b) =>
          Number(a.id === pionSurvole) - Number(b.id === pionSurvole) ||
          Number(b.etat === "mort") - Number(a.etat === "mort") ||
          Number(a.type === "pj") - Number(b.type === "pj") ||
          Number(a.joueurId === moiId) - Number(b.joueurId === moiId),
      ),
    [scene.pions, moiId, pionSurvole],
  );

  const grille = scene.grille;
  // Règles et pointeurs des autres : seulement ceux de la scène affichée ici.
  const reglesIci = reglesDistantes.filter((r) => r.sceneId === scene.id);
  const pointeursIci = pointeurs.filter((p) => p.sceneId === scene.id);
  const revelationsIci = revelations.filter((r) => r.sceneId === scene.id);

  /** Case au centre de la vue (pour poser un nouveau pion à un endroit visible). */
  const centreVue = (): Case => {
    const c = caseSous((l / 2 - vue.x) / echelle, (h / 2 - vue.y) / echelle, grille);
    return { col: Math.max(0, c.col), lig: Math.max(0, c.lig) };
  };

  const curseur = outil === "regle" || outil === "brouillard" ? "crosshair" : outil === "pointeur" ? "pointer" : "";
  const casesSaisies = saisie
    ? brouillardPinceau
      ? [...saisie.peintes.values()]
      : casesDuRectangle(saisie.debut, saisie.fin)
    : [];

  /** Envoie au serveur les cases révélées ou recouvertes (en plusieurs fois si besoin). */
  function envoyerBrouillard(cases: Case[], reveler: boolean) {
    for (let i = 0; i < cases.length; i += CASES_PAR_ENVOI_MAX) {
      socket.emit(
        "mj:brouillard:modifier",
        { sceneId: scene.id, cases: cases.slice(i, i + CASES_PAR_ENVOI_MAX), reveler },
        (r: Reponse) => setErreur(r.ok ? null : r.erreur),
      );
    }
  }

  return (
    <div className={estMj && reglagesOuverts ? "carte-combat avec-reglages" : "carte-combat"}>
      <figure className={pleinEcran ? "carte-cadre plein" : "carte-cadre"} ref={cadre}>
        <div className="barres-scene">
          {/* Ligne 1 : la scène (nom, la montrer ou non) et le plein écran. */}
          <div className="barre barre-scene">
            {props.entete ?? <span className="scene-titre">{scene.nom}</span>}
            <span className="actions-scene">{props.bandeau}</span>
          </div>
          {/* Ligne 2 : les outils (et l'annulation, après Déplacer) à gauche ; la navigation (zoom, plein écran) sur sa propre ligne, à droite. */}
          <div className="barre barre-outils">
            <span className="groupe-outils" role="group" aria-label="Outil">
              {(
                [
                  ["deplacer", "🥾 Déplacer", "Glisser la carte ou un pion"],
                  ["regle", "📏 Règle", "Mesurer une distance (tout le monde la voit)"],
                  ["pointeur", "👉 Pointer du doigt", "Cliquer pour montrer un endroit à tous"],
                  ...(estMj && scene.brouillard.actif
                    ? ([["brouillard", "☁️ Brouillard", "Révéler ou recouvrir des zones de la carte"]] as const)
                    : []),
                ] as const
              ).map(([id, nom, aide]) => (
                <Fragment key={id}>
                  <button
                    type="button"
                    title={aide}
                    className={outil === id ? "outil actif" : "outil secondaire"}
                    onClick={() => setOutil(id)}
                  >
                    {nom}
                  </button>
                  {/* Annuler un déplacement : juste après l'outil Déplacer, seulement s'il y a quelque chose à annuler. */}
                  {id === "deplacer" && annulables > 0 && (
                    <button
                      type="button"
                      className="secondaire bouton-annuler"
                      title="Annuler mon dernier déplacement (Ctrl + Z, souris sur la carte)"
                      aria-label="Annuler mon dernier déplacement"
                      onClick={annulerDeplacement}
                    >
                      <span className="botte-barree">🥾</span>
                    </button>
                  )}
                </Fragment>
              ))}
            </span>
            <span className="navigation" role="group" aria-label="Navigation">
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
          {outil === "brouillard" && (
            <div className="barre barre-options">
              <span className="nom-options">Brouillard :</span>
              <span className="groupe-outils" role="group" aria-label="Révéler ou recouvrir">
                <button type="button" className={brouillardReveler ? "outil actif" : "outil secondaire"} onClick={() => setBrouillardReveler(true)}>
                  Révéler
                </button>
                <button type="button" className={!brouillardReveler ? "outil actif" : "outil secondaire"} onClick={() => setBrouillardReveler(false)}>
                  Recouvrir
                </button>
              </span>
              <span className="groupe-outils" role="group" aria-label="Forme">
                <button type="button" className={!brouillardPinceau ? "outil actif" : "outil secondaire"} title="Tracer un rectangle" onClick={() => setBrouillardPinceau(false)}>
                  ▭ Zone
                </button>
                <button type="button" className={brouillardPinceau ? "outil actif" : "outil secondaire"} title="Peindre case par case" onClick={() => setBrouillardPinceau(true)}>
                  🖌 Case par case
                </button>
              </span>
            </div>
          )}
        </div>

        <div
          className="carte-zone"
          ref={setZone}
          style={{ cursor: curseur }}
          onMouseEnter={() => (survolCarte.current = true)}
          onMouseLeave={() => (survolCarte.current = false)}
        >
          {l > 0 && h > 0 && (
            <Stage
              width={l}
              height={h}
              onMouseDown={(e) => {
                if (outil === "brouillard") {
                  const p = pointImage(e.target.getStage());
                  if (!p) return;
                  const c = caseSous(p.x, p.y, grille);
                  setSaisie({ debut: c, fin: c, peintes: new Map([[cleCase(c), c]]) });
                  return;
                }
                if (outil !== "regle") return;
                const p = pointImage(e.target.getStage());
                if (!p) return;
                const c = caseSous(p.x, p.y, grille);
                setMaRegle({ de: c, a: c });
                envoyerRegle({ de: c, a: c }, true);
              }}
              onMouseMove={(e) => {
                if (outil === "brouillard" && saisie) {
                  const p = pointImage(e.target.getStage());
                  if (!p) return;
                  const c = caseSous(p.x, p.y, grille);
                  if (c.col === saisie.fin.col && c.lig === saisie.fin.lig) return;
                  const peintes = brouillardPinceau ? new Map(saisie.peintes).set(cleCase(c), c) : saisie.peintes;
                  setSaisie({ ...saisie, fin: c, peintes });
                  return;
                }
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
                if (outil === "brouillard" && saisie) {
                  envoyerBrouillard(casesSaisies, brouillardReveler);
                  setSaisie(null);
                  return;
                }
                if (outil !== "regle" || !maRegle) return;
                setMaRegle(null);
                envoyerRegle(null, true);
              }}
              onMouseLeave={() => {
                if (saisie) setSaisie(null);
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
                  {image && scene.brouillard.actif && (
                    <CoucheBrouillard brouillard={scene.brouillard} grille={grille} l={image.width} h={image.height} estMj={estMj} />
                  )}
                  {saisie && casesSaisies.length > 0 && (
                    <ApercuBrouillard cases={casesSaisies} grille={grille} reveler={brouillardReveler} echelle={echelle} />
                  )}
                  {combat?.phase === "round" &&
                    scene.pions.map((p) =>
                      combat.traces[p.id] ? (
                        <Trace
                          key={`trace-${p.id}`}
                          points={combat.traces[p.id]}
                          taille={p.taille}
                          grille={grille}
                          echelle={echelle}
                          actif={pionActif(p)}
                          limite={limiteTrace(p)}
                        />
                      ) : null,
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
                      limiteRound={limiteRound(p)}
                      actif={pionActif(p)}
                      revele={revelationsIci.some((r) => r.pionId === p.id)}
                      survole={pionSurvole === p.id}
                      surSurvol={(oui) => setPionSurvole((avant) => (oui ? p.id : avant === p.id ? null : avant))}
                      surErreur={setErreur}
                    />
                  ))}
                  {reglesIci.map((r) => (
                    <Mesure key={r.auteurId} de={r.de} a={r.a} grille={grille} echelle={echelle} auteur={r.auteur} />
                  ))}
                  {maRegle && <Mesure de={maRegle.de} a={maRegle.a} grille={grille} echelle={echelle} />}
                  {revelationsIci.map((r) => {
                    const p = scene.pions.find((x) => x.id === r.pionId);
                    if (!p) return null;
                    const coin = coinCase(p, grille);
                    const demi = (p.taille * grille.taille) / 2;
                    return <Eclat key={r.cle} x={coin.x + demi} y={coin.y + demi} rayon={demi * 0.85} />;
                  })}
                  {pointeursIci.map((p) => (
                    <Signal key={p.cle} x={p.x} y={p.y} auteur={p.auteur} echelle={echelle} />
                  ))}
                </Group>
              </Layer>
            </Stage>
          )}
          {!image && <p className="chargement-scene discret">Chargement de la carte…</p>}
          {astuce && (
            <div className="astuce-zoom" aria-hidden="true">
              <kbd>Ctrl</kbd> + molette pour zoomer
            </div>
          )}
        </div>
      </figure>
      {estMj && reglagesOuverts && (
        <ReglagesMj
          scene={scene}
          centreVue={centreVue}
          nomDuPion={nomDuPion}
          nomDuJoueur={(joueurId) => nomPersonnage(fiches, joueurId, presents?.find((x) => x.id === joueurId)?.nom ?? "?")}
          toutesLesCases={() => (image ? casesDeLImage(image.width, image.height, grille) : [])}
          envoyerBrouillard={envoyerBrouillard}
          choisirOutilBrouillard={() => setOutil("brouillard")}
        />
      )}
      {erreur && <p className="erreur">{erreur}</p>}
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

function ReglagesMj(props: {
  scene: Scene;
  centreVue: () => Case;
  nomDuPion: (p: Pion) => string;
  nomDuJoueur: (joueurId: number) => string;
  toutesLesCases: () => Case[];
  envoyerBrouillard: (cases: Case[], reveler: boolean) => void;
  choisirOutilBrouillard: () => void;
}) {
  const { scene, centreVue, nomDuPion, nomDuJoueur, toutesLesCases, envoyerBrouillard, choisirOutilBrouillard } = props;
  const [confirmerToutCacher, setConfirmerToutCacher] = useState(false);
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
    <PanneauReglages scene={scene}>
      <BlocReglages titre="☁️ Brouillard de guerre">
        <label className="case">
          <input
            type="checkbox"
            checked={scene.brouillard.actif}
            onChange={(e) => {
              socket.emit("mj:brouillard:activer", { sceneId: scene.id, actif: e.target.checked }, repondre);
              if (e.target.checked) choisirOutilBrouillard();
            }}
          />
          <span>Activer le brouillard sur cette scène</span>
        </label>
        {scene.brouillard.actif && (
          <>
            <p className="discret petit">
              Les joueurs ne voient que les cases révélées (toi, tu vois la carte à travers un voile).
              Avec l'outil <strong>Brouillard</strong>, en haut de la carte : <strong>Révéler</strong> ou{" "}
              <strong>Recouvrir</strong>, par <strong>zone</strong> (trace un rectangle) ou au <strong>pinceau</strong>.
              Un PNJ entièrement dans le brouillard n'est pas envoyé aux joueurs.
            </p>
            <div className="boutons-participants">
              <button type="button" className="secondaire" onClick={() => envoyerBrouillard(toutesLesCases(), true)}>
                Tout révéler
              </button>
              <button
                type="button"
                className={confirmerToutCacher ? "danger" : "secondaire"}
                onClick={() => {
                  if (!confirmerToutCacher) {
                    setConfirmerToutCacher(true);
                    window.setTimeout(() => setConfirmerToutCacher(false), 4000);
                    return;
                  }
                  setConfirmerToutCacher(false);
                  socket.emit("mj:brouillard:toutCacher", { sceneId: scene.id }, repondre);
                }}
              >
                {confirmerToutCacher ? "Confirmer : tout recouvrir" : "Tout recouvrir"}
              </button>
            </div>
          </>
        )}
      </BlocReglages>
      {(
        <>
          <BlocReglages titre="Grille (1 case = 2 m)">
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
          </BlocReglages>

          <BlocReglages titre="Pions de PNJ et de monstres">
            {pnj.length > 0 ? (
              <ul className="liste-pions-panneau">
                {pnj.map((p) => (
                  <li key={p.id} className={p.cache ? "cache" : undefined}>
                    <span className="pastille-couleur" style={{ background: p.couleur }} />
                    <span className="nom-pion">
                      {p.nom}
                      {p.taille > 1 && <span className="discret petit"> {p.taille}×{p.taille}</span>}
                      {p.etat === "mort" && <span className="mention-pion">mort</span>}
                      {p.cache && <span className="mention-pion discrete">caché</span>}
                    </span>
                    <span className="actions-pion">
                      <button
                        type="button"
                        className={p.cache ? "secondaire actif" : "secondaire"}
                        title={p.cache ? "Révéler aux joueurs" : "Cacher aux joueurs"}
                        aria-label={p.cache ? `Révéler ${p.nom}` : `Cacher ${p.nom}`}
                        onClick={() => modifierPion(p.id, { cache: !p.cache })}
                      >
                        {p.cache ? "🙈" : "👁"}
                      </button>
                      <button
                        type="button"
                        className={p.etat === "mort" ? "secondaire actif" : "secondaire"}
                        title={p.etat === "mort" ? "Pas mort" : "Mort"}
                        aria-label={p.etat === "mort" ? `${p.nom} : pas mort` : `${p.nom} : mort`}
                        onClick={() => modifierPion(p.id, { etat: p.etat === "mort" ? "normal" : "mort" })}
                      >
                        💀
                      </button>
                      <button
                        type="button"
                        className="secondaire"
                        title="Retirer le pion de la scène"
                        aria-label={`Retirer ${p.nom}`}
                        onClick={() => socket.emit("mj:retirerPion", { id: p.id }, repondre)}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="discret petit">Aucun PNJ dans cette scène.</p>
            )}
            <form
              className="ajout-pion-panneau"
              onSubmit={(e) => {
                e.preventDefault();
                socket.emit("mj:ajouterPion", { sceneId: scene.id, nom, couleur, taille, cache: ajouterCache, ...centreVue() }, (r: Reponse) => {
                  repondre(r);
                  if (r.ok) setNom("");
                });
              }}
            >
              <span className="titre-sous-bloc">Ajouter un PNJ</span>
              <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={NOM_PION_MAX} placeholder="ex. : Gobelin 1" aria-label="Nom du pion" />
              <div className="ligne-ajout-pion">
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
              </div>
              <div className="ligne-ajout-pion">
                <label className="case">
                  <input type="checkbox" checked={ajouterCache} onChange={(e) => setAjouterCache(e.target.checked)} />
                  <span>caché aux joueurs</span>
                </label>
                <button type="submit" className="secondaire" disabled={nom.trim() === ""}>
                  Ajouter
                </button>
              </div>
              <p className="discret petit">
                Le pion apparaît au centre de ta vue ; fais-le glisser où tu veux. Caché, tu le vois en
                transparence et tu le révèles au bon moment.
              </p>
            </form>
          </BlocReglages>

          <BlocReglages titre="Personnages joueurs">
            {pj.length === 0 && scene.pjAbsents.length === 0 ? (
              <p className="discret petit">Les personnages apparaissent ici quand les joueurs ont choisi leur nom.</p>
            ) : (
              <ul className="liste-pions-panneau">
                {pj.map((p) => (
                  <li key={p.id}>
                    <span className="pastille-couleur" style={{ background: p.couleur }} />
                    <span className="nom-pion">
                      {nomDuPion(p)}
                      {p.etat === "a-terre" && <span className="mention-pion">à terre</span>}
                    </span>
                    <span className="actions-pion">
                      <button
                        type="button"
                        className={p.etat === "a-terre" ? "secondaire actif" : "secondaire"}
                        title={p.etat === "a-terre" ? "Relever" : "À terre"}
                        onClick={() => modifierPion(p.id, { etat: p.etat === "a-terre" ? "normal" : "a-terre" })}
                      >
                        {p.etat === "a-terre" ? "Relever" : "À terre"}
                      </button>
                      <button
                        type="button"
                        className="secondaire"
                        title="Retirer ce personnage de la scène (il n'est pas dans ce lieu)"
                        aria-label={`Retirer ${nomDuPion(p)} de la scène`}
                        onClick={() => socket.emit("mj:presenceJoueur", { sceneId: scene.id, joueurId: p.joueurId!, present: false }, repondre)}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
                {scene.pjAbsents.map((joueurId) => (
                  <li key={`absent-${joueurId}`} className="absent">
                    <span className="pastille-couleur vide" />
                    <span className="nom-pion">
                      {nomDuJoueur(joueurId)}
                      <span className="mention-pion discrete">pas dans la scène</span>
                    </span>
                    <span className="actions-pion">
                      <button
                        type="button"
                        className="secondaire"
                        title="Remettre ce personnage dans la scène, là où il était"
                        onClick={() => socket.emit("mj:presenceJoueur", { sceneId: scene.id, joueurId, present: true }, repondre)}
                      >
                        Remettre
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </BlocReglages>
        </>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </PanneauReglages>
  );
}
