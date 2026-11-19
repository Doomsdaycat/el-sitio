// Panneau Combat : ordre d'initiative du round, tour en cours, actions (j'ai joué, attendre,
// course, réaction), et pour le MJ la préparation des participants et le tirage.

import { useState, type FormEvent } from "react";
import {
  carteCourante,
  cartesDe,
  cartesPourAttendre,
  CARTES_MAX_PAR_COMBATTANT,
  deplacementDuRound,
  deplacementRestant,
  NB_CARTES,
  NOM_COMBATTANT_MAX,
  surpriseEnAttente,
  type Combat as DonneesCombat,
  type Combattant,
} from "../../shared/combat.ts";
import { deplacement, psMax } from "../../shared/fiche.ts";
import type { Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { useEtat } from "./etat.ts";
import { nomPersonnage } from "./noms.ts";

type Emettre = (evenement: string, donnees?: object) => void;

function useNoms() {
  const fiches = useEtat("fiches");
  const presents = useEtat("presents");
  const nom = (x: Combattant): string => {
    if (x.type === "pnj" || x.joueurId === null) return x.nom;
    const joueur = presents?.find((p) => p.id === x.joueurId)?.nom ?? "?";
    return nomPersonnage(fiches, x.joueurId, joueur);
  };
  const fiche = (x: Combattant) => (x.joueurId !== null ? fiches?.find((f) => f.joueurId === x.joueurId) : undefined);
  return { nom, fiche };
}

/** PS maximum d'un PNJ, modifiable à tout moment (vide : pas de suivi des PS). */
function ChampPsMax(props: { x: Combattant; emettre: Emettre }) {
  const { x, emettre } = props;
  const [brouillon, setBrouillon] = useState<string | null>(null);
  function valider() {
    if (brouillon === null) return;
    const texte = brouillon.trim();
    setBrouillon(null);
    if (texte === "") {
      if (x.ps) emettre("mj:combat:modifier", { id: x.id, ps: null });
      return;
    }
    const max = Number(texte);
    if (max === x.ps?.max) return;
    // Nouveau maximum : les PS actuels restent, sans dépasser le maximum (pleins si c'est le premier).
    const actuels = x.ps ? Math.min(x.ps.actuels, max) : max;
    emettre("mj:combat:modifier", { id: x.id, ps: { actuels, max } });
  }
  return (
    <input
      className="champ-nombre"
      inputMode="numeric"
      aria-label={`PS maximum de ${x.nom}`}
      title="PS maximum (visibles de toi seul)"
      placeholder="PS"
      value={brouillon ?? (x.ps ? String(x.ps.max) : "")}
      onFocus={(e) => {
        setBrouillon(x.ps ? String(x.ps.max) : "");
        e.currentTarget.select();
      }}
      onChange={(e) => setBrouillon(e.target.value.replace(/\D/g, "").slice(0, 3))}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/** Réglages des participants (MJ) : avant le premier tirage, et en cours de combat. */
function Participants(props: { combat: DonneesCombat; emettre: Emettre }) {
  const { combat, emettre } = props;
  const { nom } = useNoms();
  const [nomPnj, setNomPnj] = useState("");
  const [cartes, setCartes] = useState(1);
  const [ps, setPs] = useState("");
  const total = combat.combattants.reduce((n, x) => n + x.nbCartes, 0);

  function ajouter(e: FormEvent) {
    e.preventDefault();
    emettre("mj:combat:ajouterPnj", { nom: nomPnj, nbCartes: cartes, psMax: ps === "" ? null : Number(ps) });
    setNomPnj("");
    setPs("");
  }

  return (
    <div className="participants">
      <ul className="liste-participants">
        {combat.combattants.map((x) => (
          <li key={x.id}>
            <span className="nom-participant">
              {nom(x)}
              {x.type === "pj" && <span className="discret petit"> (joueur)</span>}
            </span>
            {x.type === "pnj" && (
              <select
                aria-label="Nombre de cartes"
                title="Cartes par round (plusieurs pour certains monstres)"
                value={x.nbCartes}
                onChange={(e) => emettre("mj:combat:modifier", { id: x.id, nbCartes: Number(e.target.value) })}
              >
                {Array.from({ length: CARTES_MAX_PAR_COMBATTANT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} carte{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            )}
            {x.type === "pnj" && <ChampPsMax x={x} emettre={emettre} />}
            {combat.phase === "preparation" && (
              <label className="case" title="Attaque surprise : choisit sa carte au premier round">
                <input
                  type="checkbox"
                  checked={x.surprise}
                  onChange={(e) => emettre("mj:combat:modifier", { id: x.id, surprise: e.target.checked })}
                />
                <span>surprend</span>
              </label>
            )}
            <button type="button" className="lien" onClick={() => emettre("mj:combat:retirer", { id: x.id })}>
              Retirer
            </button>
          </li>
        ))}
      </ul>
      <p className={total > NB_CARTES ? "erreur petit" : "discret petit"}>
        {total} carte{total > 1 ? "s" : ""} sur {NB_CARTES}
        {total > NB_CARTES && " : regroupe des PNJ (une carte pour un groupe)."}
      </p>
      <div className="boutons-participants">
        <button type="button" className="secondaire" onClick={() => emettre("mj:combat:ajouterPionsScene")}>
          Ajouter les PNJ de la scène
        </button>
        <button type="button" className="secondaire" onClick={() => emettre("mj:combat:ajouterJoueurs")}>
          Ajouter les joueurs manquants
        </button>
      </div>
      <form className="ajout-participant" onSubmit={ajouter}>
        <input
          value={nomPnj}
          onChange={(e) => setNomPnj(e.target.value)}
          maxLength={NOM_COMBATTANT_MAX}
          placeholder="PNJ ou groupe (ex. : Loups ×3)"
          aria-label="Nom du PNJ ou du groupe"
        />
        <select value={cartes} onChange={(e) => setCartes(Number(e.target.value))} aria-label="Cartes">
          {Array.from({ length: CARTES_MAX_PAR_COMBATTANT }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} carte{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <input
          className="champ-nombre"
          value={ps}
          onChange={(e) => setPs(e.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder="PS"
          aria-label="PS (facultatif)"
          title="PS (facultatif, visibles de toi seul)"
        />
        <button type="submit" className="secondaire" disabled={nomPnj.trim() === ""}>
          Ajouter
        </button>
      </form>
    </div>
  );
}

/** Choix des cartes par les attaquants qui surprennent (premier round). */
function ChoixSurprise(props: { combat: DonneesCombat; moiId: number; estMj: boolean; emettre: Emettre }) {
  const { combat, moiId, estMj, emettre } = props;
  const { nom } = useNoms();
  const prises = new Set(Object.values(combat.choixSurprise).flat());
  const attente = surpriseEnAttente(combat);
  const miens = attente.filter((x) => estMj || x.joueurId === moiId);

  return (
    <div className="choix-surprise">
      <p>
        <strong>Attaque surprise</strong> : {attente.map(nom).join(", ")}{" "}
        {attente.length > 1 ? "choisissent" : "choisit"} sa carte. Les autres cartes seront tirées ensuite.
      </p>
      {miens.map((x) => (
        <div key={x.id}>
          <p className="petit">{estMj ? `Carte pour ${nom(x)} :` : "Choisis ta carte :"}</p>
          <div className="cartes-a-choisir">
            {Array.from({ length: NB_CARTES }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                className="carte-initiative"
                disabled={prises.has(v)}
                onClick={() => emettre("combat:choisirCarte", { combattantId: x.id, valeur: v })}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Boutons − / + autour d'un nombre de PS. */
function ReglagePs(props: { actuels: number; max: number; changer: (n: number) => void; libelle?: string }) {
  const { actuels, max, changer, libelle = "" } = props;
  return (
    <span className="ps-pnj">
      <button type="button" className="secondaire" aria-label="Moins 1 PS" disabled={actuels <= 0} onClick={() => changer(actuels - 1)}>
        −
      </button>
      <span className={actuels === 0 ? "ps-combat zero" : "ps-combat"} title="Points de santé">
        {actuels}/{max}
        {libelle}
      </span>
      <button type="button" className="secondaire" aria-label="Plus 1 PS" disabled={actuels >= max} onClick={() => changer(actuels + 1)}>
        +
      </button>
    </span>
  );
}

/**
 * Ordre du round : une ligne courte par carte (numéro, nom, PS en bref). Un clic sur le nom
 * déplie le détail : PS à régler, et pour le MJ le déplacement restant et la réaction d'un joueur.
 */
function Ordre(props: { combat: DonneesCombat; moiId: number; estMj: boolean; emettre: Emettre }) {
  const { combat, moiId, estMj, emettre } = props;
  const { nom, fiche } = useNoms();
  const [deplie, setDeplie] = useState<string | null>(null);
  const courante = carteCourante(combat);
  const cartes = [...combat.cartes].sort((a, b) => a.valeur - b.valeur);

  return (
    <ol className="ordre-combat">
      {cartes.map((carte) => {
        const x = combat.combattants.find((y) => y.id === carte.combattantId);
        if (!x) return null;
        const siennes = cartesDe(combat, x.id);
        const rang = siennes.length > 1 ? ` (${siennes.findIndex((s) => s.valeur === carte.valeur) + 1}/${siennes.length})` : "";
        const f = fiche(x);
        // PS en bref : fiche du joueur (tout le monde), PS du PNJ (MJ seulement).
        const ps = f ? { actuels: f.psActuels, max: psMax(f) } : estMj && x.ps ? x.ps : null;
        const reglerFiche = !!f && (estMj || x.joueurId === moiId);
        const aDetail = reglerFiche || (estMj && (!!x.ps || x.type === "pj"));
        const ouverte = aDetail && deplie === `${carte.valeur}`;
        const classes = ["ligne-ordre"];
        if (carte.jouee) classes.push("jouee");
        if (courante?.valeur === carte.valeur) classes.push("courante");
        if (x.type === "pj" && x.joueurId === moiId) classes.push("moi");
        if (ouverte) classes.push("ouverte");
        return (
          <li key={carte.valeur} className={classes.join(" ")}>
            <div className="ligne-ordre-resume">
              <button
                type="button"
                className="carte-initiative"
                disabled={!estMj}
                title={estMj ? (carte.jouee ? "Remettre la carte face visible" : "Retourner la carte (tour joué ou réaction)") : undefined}
                onClick={() => emettre("mj:combat:retourner", { valeur: carte.valeur, jouee: !carte.jouee })}
              >
                {carte.valeur}
              </button>
              {aDetail ? (
                <button
                  type="button"
                  className="nom-participant nom-depliable"
                  aria-expanded={ouverte}
                  title={ouverte ? "Replier" : "Détails : PS, déplacement…"}
                  onClick={() => setDeplie(ouverte ? null : `${carte.valeur}`)}
                >
                  {nom(x)}
                  {rang}
                  {carte.attendue && <span className="discret petit"> · a attendu</span>}
                  <span className="discret chevron" aria-hidden="true">{ouverte ? "▴" : "▾"}</span>
                </button>
              ) : (
                <span className="nom-participant">
                  {nom(x)}
                  {rang}
                  {carte.attendue && <span className="discret petit"> · a attendu</span>}
                </span>
              )}
              {ps && (
                <span className={ps.actuels === 0 ? "ps-combat zero" : "ps-combat"} title="Points de santé">
                  {ps.actuels}/{ps.max}
                </span>
              )}
            </div>
            {ouverte && (
              <div className="ligne-ordre-detail">
                {f && reglerFiche && (
                  <ReglagePs
                    actuels={f.psActuels}
                    max={psMax(f)}
                    libelle=" PS"
                    changer={(n) => emettre("fiche:modifier", { joueurId: f.joueurId, modification: { champ: "ps", valeur: n } })}
                  />
                )}
                {estMj && x.ps && (
                  <ReglagePs
                    actuels={x.ps.actuels}
                    max={x.ps.max}
                    libelle=" PS"
                    changer={(n) => emettre("mj:combat:modifier", { id: x.id, ps: { ...x.ps!, actuels: n } })}
                  />
                )}
                {estMj && x.type === "pj" && (
                  <LigneMjJoueur combat={combat} combattant={x} deplacementFiche={f ? deplacement(f) : null} emettre={emettre} />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** MJ, sur la ligne d'un personnage joueur : déplacement restant et réaction (souvent hors de son tour). */
function LigneMjJoueur(props: {
  combat: DonneesCombat;
  combattant: Combattant;
  deplacementFiche: number | null;
  emettre: Emettre;
}) {
  const { combat, combattant, deplacementFiche, emettre } = props;
  const m = combat.mouvements[combattant.id];
  const reste = deplacementRestant(m, deplacementFiche);
  const total = deplacementDuRound(m, deplacementFiche);
  const peutReagir = cartesDe(combat, combattant.id).some((x) => !x.jouee);
  return (
    <span className="ligne-mj-joueur">
      {reste !== null && total !== null && (
        <span className="discret petit" title="Déplacement restant ce round">
          {reste}/{total} m{m?.course ? " (course)" : ""}
        </span>
      )}
      {peutReagir && (
        <button
          type="button"
          className="secondaire"
          title="Réaction (parer, esquiver) : sa carte est retournée et il ne se déplace plus ce round"
          onClick={() => emettre("combat:reaction", { combattantId: combattant.id })}
        >
          Réaction
        </button>
      )}
    </span>
  );
}

/** Actions de celui dont c'est le tour, et déplacement du round pour son personnage. */
function MesActions(props: { combat: DonneesCombat; moiId: number; estMj: boolean; emettre: Emettre }) {
  const { combat, moiId, estMj, emettre } = props;
  const { nom, fiche } = useNoms();
  const [attente, setAttente] = useState("");
  const courante = carteCourante(combat);
  const duTour = courante ? combat.combattants.find((x) => x.id === courante.combattantId) : undefined;
  const monTour = !!duTour && (estMj || (duTour.type === "pj" && duTour.joueurId === moiId));
  const echangeables = cartesPourAttendre(combat);
  const moi = combat.combattants.find((x) => x.type === "pj" && x.joueurId === moiId);

  return (
    <div className="mes-actions">
      {courante && duTour ? (
        <p className={monTour && !estMj ? "a-toi" : undefined}>
          {monTour && !estMj ? (
            <strong>C'est ton tour !</strong>
          ) : (
            <>
              Au tour de <strong>{nom(duTour)}</strong> (carte {courante.valeur})
            </>
          )}
        </p>
      ) : (
        <p className="discret">Tout le monde a joué : round terminé.</p>
      )}

      {monTour && courante && (
        <div className="boutons-tour">
          <button type="button" onClick={() => emettre("combat:terminerTour")}>
            {estMj ? "Tour suivant" : "J'ai joué"}
          </button>
          {echangeables.length > 0 && (
            <span className="attendre">
              <select value={attente} onChange={(e) => setAttente(e.target.value)} aria-label="Attendre : échanger avec">
                <option value="">Attendre…</option>
                {echangeables.map((c) => {
                  const x = combat.combattants.find((y) => y.id === c.combattantId);
                  return (
                    <option key={c.valeur} value={c.valeur}>
                      échanger avec {x ? nom(x) : "?"} (carte {c.valeur})
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="secondaire"
                disabled={attente === ""}
                onClick={() => {
                  emettre("combat:attendre", { valeur: Number(attente) });
                  setAttente("");
                }}
              >
                Attendre
              </button>
            </span>
          )}
        </div>
      )}

      {moi && combat.phase === "round" && <MonDeplacement combat={combat} combattant={moi} emettre={emettre} fiche={fiche(moi)} />}
      {/* MJ : pendant le tour d'un joueur, il peut jouer à sa place (course, réaction, déplacement). */}
      {estMj && duTour?.type === "pj" && combat.phase === "round" && (
        <MonDeplacement combat={combat} combattant={duTour} emettre={emettre} fiche={fiche(duTour)} pour={nom(duTour)} />
      )}
    </div>
  );
}

function MonDeplacement(props: {
  combat: DonneesCombat;
  combattant: Combattant;
  emettre: Emettre;
  fiche: ReturnType<ReturnType<typeof useNoms>["fiche"]>;
  /** MJ qui joue à la place du joueur : nom du personnage dans le titre. */
  pour?: string;
}) {
  const { combat, combattant, emettre, fiche, pour } = props;
  const m = combat.mouvements[combattant.id];
  const dep = fiche ? deplacement(fiche) : null;
  const total = deplacementDuRound(m, dep);
  const reste = deplacementRestant(m, dep);
  const peutReagir = cartesDe(combat, combattant.id).some((x) => !x.jouee);
  if (!m) return null;
  return (
    <div className="mon-deplacement">
      <p>
        {pour ? <>Déplacement de {pour} :</> : "Déplacement :"}{" "}
        {total === null ? (
          <span className="discret">
            {pour ? "famille à choisir sur sa fiche pour le calculer" : "choisis ta famille sur ta fiche pour le calculer"}
          </span>
        ) : (
          <>
            reste <strong>{reste} m</strong> sur {total} m
            {m.reaction && <span className="discret"> (réaction faite)</span>}
          </>
        )}
      </p>
      <div className="boutons-tour">
        <label className="case" title="Action Course : déplacement doublé ce round">
          <input
            type="checkbox"
            checked={m.course}
            disabled={m.reaction}
            onChange={(e) => emettre("combat:course", { combattantId: combattant.id, course: e.target.checked })}
          />
          <span>Course (×2)</span>
        </label>
        <button
          type="button"
          className="secondaire"
          disabled={!peutReagir}
          title="Parer ou esquiver : ta carte est retournée et tu ne te déplaces plus ce round"
          onClick={() => emettre("combat:reaction", { combattantId: combattant.id })}
        >
          Réaction
        </button>
      </div>
    </div>
  );
}

export function Combat({ moiId, estMj }: { moiId: number; estMj: boolean }) {
  const combat = useEtat("combat");
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmerFin, setConfirmerFin] = useState(false);
  const [voirParticipants, setVoirParticipants] = useState(false);

  const emettre: Emettre = (evenement, donnees = {}) =>
    (socket.emit as (e: string, d: object, r: (r: Reponse) => void) => void)(evenement, donnees, (r: Reponse) =>
      setErreur(r.ok ? null : r.erreur),
    );

  // Hors combat : une seule ligne pour le MJ, rien pour les joueurs.
  if (!combat) {
    if (!estMj) return null;
    return (
      <section className="carte combat combat-vide">
        <div className="combat-vide-ligne">
          <span className="discret">⚔️ Pas de combat</span>
          <button type="button" className="secondaire" onClick={() => emettre("mj:combat:commencer")}>
            Commencer
          </button>
        </div>
        {erreur && <p className="erreur">{erreur}</p>}
      </section>
    );
  }

  const titre =
    combat.phase === "preparation"
      ? "Combat : préparation"
      : combat.phase === "surprise"
        ? "Combat : surprise"
        : `Combat · round ${combat.round}`;

  return (
    <section className="carte combat">
      <h2>{titre}</h2>

      {combat.phase === "preparation" &&
        (estMj ? (
          <>
            <Participants combat={combat} emettre={emettre} />
            <button type="button" className="bouton-lancer" onClick={() => emettre("mj:combat:tirer")}>
              Tirer l'initiative
            </button>
          </>
        ) : (
          <p className="discret">Le MJ prépare le combat…</p>
        ))}

      {combat.phase === "surprise" && <ChoixSurprise combat={combat} moiId={moiId} estMj={estMj} emettre={emettre} />}

      {combat.phase === "round" && (
        <>
          <Ordre combat={combat} moiId={moiId} estMj={estMj} emettre={emettre} />
          <MesActions combat={combat} moiId={moiId} estMj={estMj} emettre={emettre} />
          {estMj && voirParticipants && <Participants combat={combat} emettre={emettre} />}
        </>
      )}

      {/* MJ : actions du combat, sur une seule ligne. */}
      {estMj && (
        <div className="actions-combat-mj">
          {combat.phase === "round" && (
            <>
              <button
                type="button"
                className={carteCourante(combat) !== null ? "secondaire" : undefined}
                disabled={carteCourante(combat) !== null}
                title={
                  carteCourante(combat) !== null
                    ? "Disponible quand tout le monde a joué (ou retourne les cartes restantes)"
                    : "Nouveau tirage d'initiative"
                }
                onClick={() => emettre("mj:combat:tirer")}
              >
                Round suivant
              </button>
              <button type="button" className="lien" onClick={() => setVoirParticipants((v) => !v)}>
                {voirParticipants ? "Masquer les participants" : "Participants…"}
              </button>
            </>
          )}
          <button
            type="button"
            className={confirmerFin ? "danger" : "lien"}
            onClick={() => {
              if (!confirmerFin) {
                setConfirmerFin(true);
                window.setTimeout(() => setConfirmerFin(false), 4000);
                return;
              }
              setConfirmerFin(false);
              emettre("mj:combat:finir");
            }}
          >
            {confirmerFin ? "Confirmer : fin du combat" : "Fin du combat"}
          </button>
        </div>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
