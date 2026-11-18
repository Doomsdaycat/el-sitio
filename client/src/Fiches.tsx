// Fiches de personnage : un onglet par personnage, modifiables par le joueur concerné et le MJ.
// L'écran ne change rien de lui-même : chaque modification part au serveur, qui renvoie la fiche.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  AGES,
  bonusDegats,
  CARAC_MAX,
  CARAC_MIN,
  CARACS,
  COMPETENCES,
  deplacement,
  etatGenant,
  FAMILLES,
  NIVEAU_MAX,
  NIVEAU_MIN,
  niveauCompetence,
  nomFiche,
  NOMS_CARACS,
  PROFESSIONS,
  psMax,
  pvMax,
  TEXTE_COURT_MAX,
  TEXTE_LONG_MAX,
  TEXTES,
  type CibleJetFiche,
  type Fiche,
  type ModificationFiche,
} from "../../shared/fiche.ts";
import { ETATS } from "../../shared/jets.ts";
import type { Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { apresJet, useEtat } from "./etat.ts";

// ---------------------------------------------------------------------------
// Champs : on garde ce que la personne tape tant qu'elle est dans le champ,
// et on l'envoie au serveur en sortant du champ (ou avec Entrée).

function ChampNombre(props: {
  valeur: number | null;
  min: number;
  max: number;
  surValider: (n: number | null) => void;
  videAutorise?: boolean;
  placeholder?: string;
  desactive?: boolean;
  label: string;
  classe?: string;
}) {
  const { valeur, min, max, surValider, videAutorise, placeholder, desactive, label, classe } = props;
  const [brouillon, setBrouillon] = useState<string | null>(null);

  function valider() {
    if (brouillon === null) return;
    const texte = brouillon.trim();
    setBrouillon(null);
    if (texte === "") {
      if (videAutorise && valeur !== null) surValider(null);
      return;
    }
    const n = Number(texte);
    if (n !== valeur) surValider(n);
  }

  return (
    <input
      className={`champ-nombre ${classe ?? ""}`}
      inputMode="numeric"
      aria-label={label}
      title={`${label} (${min} à ${max})`}
      disabled={desactive}
      placeholder={placeholder}
      value={brouillon ?? (valeur === null ? "" : String(valeur))}
      onFocus={(e) => {
        setBrouillon(valeur === null ? "" : String(valeur));
        e.currentTarget.select();
      }}
      onChange={(e) => setBrouillon(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onBlur={valider}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setBrouillon(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function ChampTexte(props: {
  valeur: string;
  max: number;
  surValider: (texte: string) => void;
  multiligne?: boolean;
  desactive?: boolean;
  label: string;
  placeholder?: string;
}) {
  const { valeur, max, surValider, multiligne, desactive, label, placeholder } = props;
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const minuterie = useRef<number | undefined>(undefined);

  function envoyer(texte: string) {
    window.clearTimeout(minuterie.current);
    if (texte !== valeur) surValider(texte);
  }

  // Pour les grandes zones, on enregistre aussi pendant la frappe (après une courte pause).
  function changer(texte: string) {
    setBrouillon(texte);
    if (multiligne) {
      window.clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(() => envoyer(texte), 1500);
    }
  }

  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  const commun = {
    "aria-label": label,
    disabled: desactive,
    maxLength: max,
    placeholder,
    value: brouillon ?? valeur,
    onFocus: () => setBrouillon(valeur),
    onBlur: () => {
      if (brouillon !== null) envoyer(brouillon);
      setBrouillon(null);
    },
  };

  return multiligne ? (
    <textarea {...commun} rows={5} onChange={(e) => changer(e.target.value)} />
  ) : (
    <input
      {...commun}
      onChange={(e) => changer(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

// ---------------------------------------------------------------------------

/** Bonus aux dégâts affiché comme dans le livre : « +1D4 », ou « — » sans bonus. */
const signe = (bonus: string | null) => (bonus ? `+${bonus}` : "—");

/** Nom cliquable pour lancer, ou simple texte si on ne peut pas lancer depuis cette fiche. */
function BoutonJet(p: {
  cible: CibleJetFiche;
  titre: string;
  lancer: ((cible: CibleJetFiche) => void) | null;
  children: React.ReactNode;
}) {
  if (!p.lancer) return <span className="nom-jet">{p.children}</span>;
  const lancer = p.lancer;
  return (
    <button type="button" className="bouton-jet" title={p.titre} onClick={() => lancer(p.cible)}>
      {p.children}
    </button>
  );
}

function LigneCompetence(p: {
  c: (typeof COMPETENCES)[number];
  fiche: Fiche;
  lancer: ((cible: CibleJetFiche) => void) | null;
  modifier: (m: ModificationFiche) => void;
}) {
  const { c, fiche, lancer, modifier } = p;
  const { niveau, base } = niveauCompetence(fiche, c.id);
  const etat = etatGenant(fiche, c.carac);
  return (
    <li className="ligne-competence">
      <BoutonJet cible={{ type: "competence", id: c.id }} titre={`Lancer ${c.nom} (${niveau})`} lancer={lancer}>
        {c.nom}
      </BoutonJet>
      {etat && (
        <span className="marque-fleau" title={`Fléau : ${ETATS.find((e) => e.id === etat)?.nom}`}>
          fléau
        </span>
      )}
      <span className="carac-competence">{c.carac}</span>
      <ChampNombre
        label={c.nom}
        valeur={base ? null : niveau}
        placeholder={String(niveau)}
        min={NIVEAU_MIN}
        max={NIVEAU_MAX}
        videAutorise
        desactive={lancer === null}
        classe={base ? "base" : ""}
        surValider={(n) => modifier({ champ: "competence", id: c.id, valeur: n })}
      />
    </li>
  );
}

function FicheVue(props: {
  fiche: Fiche;
  nomJoueur: string | null;
  modifiable: boolean;
}) {
  const { fiche, nomJoueur, modifiable } = props;
  const reglages = useEtat("reglages");
  const cibleOpposition = useEtat("cibleOpposition");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouvelleEcole, setNouvelleEcole] = useState("");
  const [niveauEcole, setNiveauEcole] = useState("");

  function repondre(r: Reponse) {
    setErreur(r.ok ? null : r.erreur);
  }

  function modifier(modification: ModificationFiche) {
    socket.emit("fiche:modifier", { joueurId: fiche.joueurId, modification }, repondre);
  }

  function lancer(cible: CibleJetFiche) {
    socket.emit(
      "jet:fiche",
      {
        joueurId: fiche.joueurId,
        cible,
        faveurs: reglages.faveurs,
        fleaux: reglages.fleaux,
        secret: reglages.secret,
        opposeA: cibleOpposition?.id ?? null,
        ouverte: cibleOpposition !== null && reglages.ouverte,
      },
      (r: Reponse) => {
        repondre(r);
        if (r.ok) apresJet();
      },
    );
  }

  function ajouterEcole(e: FormEvent) {
    e.preventDefault();
    socket.emit(
      "fiche:modifier",
      {
        joueurId: fiche.joueurId,
        modification: { champ: "ajouterEcole", nom: nouvelleEcole, niveau: Number(niveauEcole) },
      },
      (r: Reponse) => {
        repondre(r);
        if (r.ok) {
          setNouvelleEcole("");
          setNiveauEcole("");
        }
      },
    );
  }

  const lanceur = modifiable ? lancer : null;
  const dep = deplacement(fiche);
  const competencesGenerales = COMPETENCES.filter((c) => !c.arme);
  const competencesArmes = COMPETENCES.filter((c) => c.arme);

  return (
    <div className="fiche">
      {erreur && <p className="erreur">{erreur}</p>}
      {!modifiable && (
        <p className="discret">Fiche en lecture seule : seuls son joueur et le MJ peuvent la modifier.</p>
      )}

      <section className="fiche-identite">
        <label>
          <span>Nom du personnage</span>
          <ChampTexte
            label="Nom du personnage"
            valeur={fiche.nomPersonnage}
            max={TEXTE_COURT_MAX}
            desactive={!modifiable}
            placeholder={`Personnage de ${nomJoueur ?? "?"}`}
            surValider={(v) => modifier({ champ: "nomPersonnage", valeur: v })}
          />
        </label>
        <label>
          <span>Joueur</span>
          <input value={nomJoueur ?? ""} disabled aria-label="Joueur" />
        </label>
        <label>
          <span>Famille</span>
          <select
            value={fiche.famille}
            disabled={!modifiable}
            onChange={(e) => modifier({ champ: "famille", valeur: e.target.value })}
          >
            <option value="">—</option>
            {FAMILLES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Profession</span>
          <select
            value={fiche.profession}
            disabled={!modifiable}
            onChange={(e) => modifier({ champ: "profession", valeur: e.target.value })}
          >
            <option value="">—</option>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Âge</span>
          <select
            value={fiche.age}
            disabled={!modifiable}
            onChange={(e) => modifier({ champ: "age", valeur: e.target.value })}
          >
            <option value="">—</option>
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h3>Caractéristiques et états</h3>
        <div className="fiche-caracs">
          {CARACS.map((c) => {
            const etat = ETATS.find((e) => e.carac === c)!;
            const actif = fiche.etats.includes(etat.id);
            return (
              <div key={c} className={actif ? "carte-carac genee" : "carte-carac"}>
                <BoutonJet cible={{ type: "carac", carac: c }} titre={`Jet de ${NOMS_CARACS[c]}`} lancer={lanceur}>
                  <strong>{c}</strong>
                </BoutonJet>
                <span className="discret petit">{NOMS_CARACS[c]}</span>
                <ChampNombre
                  label={NOMS_CARACS[c]}
                  valeur={fiche.caracs[c]}
                  min={CARAC_MIN}
                  max={CARAC_MAX}
                  desactive={!modifiable}
                  classe="grand"
                  surValider={(n) => n !== null && modifier({ champ: "carac", carac: c, valeur: n })}
                />
                <label className="case etat">
                  <input
                    type="checkbox"
                    checked={actif}
                    disabled={!modifiable}
                    onChange={(e) => modifier({ champ: "etat", etat: etat.id, actif: e.target.checked })}
                  />
                  <span>{etat.nom}</span>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="fiche-derivees">
        {(
          [
            ["ps", "Points de santé (PS)", fiche.psActuels, psMax(fiche)],
            ["pv", "Points de volonté (PV)", fiche.pvActuels, pvMax(fiche)],
          ] as const
        ).map(([champ, nom, actuel, max]) => (
          <div key={champ} className="jauge">
            <span className="jauge-nom">{nom}</span>
            <div className="jauge-valeurs">
              {modifiable && (
                <button
                  type="button"
                  className="secondaire"
                  disabled={actuel <= 0}
                  aria-label={`${nom} : moins 1`}
                  onClick={() => modifier({ champ, valeur: actuel - 1 })}
                >
                  −
                </button>
              )}
              <span className={actuel === 0 ? "jauge-chiffre vide" : "jauge-chiffre"}>
                {actuel} <span className="discret">/ {max}</span>
              </span>
              {modifiable && (
                <button
                  type="button"
                  className="secondaire"
                  disabled={actuel >= max}
                  aria-label={`${nom} : plus 1`}
                  onClick={() => modifier({ champ, valeur: actuel + 1 })}
                >
                  +
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="jauge">
          <span className="jauge-nom">Déplacement</span>
          <span className="jauge-chiffre">{dep === null ? "—" : `${dep} m`}</span>
        </div>
        <div className="jauge">
          <span className="jauge-nom">Bonus aux dégâts</span>
          {/* Deux blocs insécables : s'il faut deux lignes, la coupure tombe avant AGI. */}
          <span className="bonus-degats">
            <span>
              FOR : <strong>{signe(bonusDegats(fiche.caracs.FOR))}</strong>
            </span>
            <span>
              AGI : <strong>{signe(bonusDegats(fiche.caracs.AGI))}</strong>
            </span>
          </span>
        </div>
      </section>

      <section>
        <h3>Compétences</h3>
        <p className="discret petit">
          {modifiable ? "Clique sur une compétence pour lancer le dé. " : ""}
          Un niveau vide vaut la chance de base (en gris).
        </p>
        <div className="fiche-competences">
          <ul>
            {competencesGenerales.map((c) => (
              <LigneCompetence key={c.id} c={c} fiche={fiche} lancer={lanceur} modifier={modifier} />
            ))}
          </ul>
          <div>
            <h4>Compétences d'armes</h4>
            <ul>
              {competencesArmes.map((c) => (
                <LigneCompetence key={c.id} c={c} fiche={fiche} lancer={lanceur} modifier={modifier} />
              ))}
            </ul>
            <h4>Écoles de magie</h4>
            <ul>
              {fiche.ecoles.map((e) => (
                <li key={e.id} className="ligne-competence">
                  <BoutonJet cible={{ type: "ecole", id: e.id }} titre={`Lancer ${e.nom} (${e.niveau})`} lancer={lanceur}>
                    {e.nom}
                  </BoutonJet>
                  {etatGenant(fiche, "INT") && <span className="marque-fleau">fléau</span>}
                  <span className="carac-competence">INT</span>
                  <ChampNombre
                    label={e.nom}
                    valeur={e.niveau}
                    min={NIVEAU_MIN}
                    max={NIVEAU_MAX}
                    desactive={!modifiable}
                    surValider={(n) =>
                      n !== null && modifier({ champ: "ecole", id: e.id, nom: e.nom, niveau: n })
                    }
                  />
                  {modifiable && (
                    <button
                      type="button"
                      className="lien"
                      aria-label={`Retirer ${e.nom}`}
                      onClick={() => modifier({ champ: "retirerEcole", id: e.id })}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {fiche.ecoles.length === 0 && !modifiable && <p className="discret petit">Aucune.</p>}
            {modifiable && (
              <form className="ajout-ecole" onSubmit={ajouterEcole}>
                <input
                  value={nouvelleEcole}
                  onChange={(e) => setNouvelleEcole(e.target.value)}
                  maxLength={TEXTE_COURT_MAX}
                  placeholder="ex. : Élémentalisme"
                  aria-label="Nom de l'école de magie"
                />
                <input
                  value={niveauEcole}
                  onChange={(e) => setNiveauEcole(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  inputMode="numeric"
                  placeholder="niv."
                  aria-label="Niveau"
                  className="champ-nombre"
                />
                <button
                  type="submit"
                  className="secondaire"
                  disabled={nouvelleEcole.trim() === "" || niveauEcole === ""}
                >
                  Ajouter
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="fiche-textes">
        {TEXTES.map((t) => (
          <label key={t.id}>
            <span>{t.nom}</span>
            <ChampTexte
              label={t.nom}
              valeur={fiche.textes[t.id]}
              max={TEXTE_LONG_MAX}
              multiligne
              desactive={!modifiable}
              surValider={(v) => modifier({ champ: "texte", id: t.id, valeur: v })}
            />
          </label>
        ))}
      </section>
    </div>
  );
}

export function Fiches({ moiId, estMj }: { moiId: number; estMj: boolean }) {
  const fiches = useEtat("fiches");
  const presents = useEtat("presents");
  const [choisie, setChoisie] = useState<number | null>(null);

  if (fiches === null) return null;
  const nomJoueur = (id: number) => presents?.find((p) => p.id === id)?.nom ?? null;

  // Le joueur voit d'abord sa propre fiche.
  const ordonnees = [...fiches].sort(
    (a, b) => Number(b.joueurId === moiId) - Number(a.joueurId === moiId) || a.joueurId - b.joueurId,
  );
  const active =
    ordonnees.find((f) => f.joueurId === choisie) ?? ordonnees[0] ?? null;

  return (
    <div className="fiches">
      {ordonnees.length === 0 ? (
        <p className="discret">
          Aucun personnage pour l'instant : une fiche apparaît dès qu'un joueur a choisi son nom.
        </p>
      ) : (
        <>
          <div className="onglets" role="tablist">
            {ordonnees.map((f) => (
              <button
                key={f.joueurId}
                type="button"
                role="tab"
                aria-selected={f.joueurId === active?.joueurId}
                className={f.joueurId === active?.joueurId ? "onglet actif" : "onglet"}
                onClick={() => setChoisie(f.joueurId)}
              >
                {nomFiche(f, nomJoueur(f.joueurId))}
                {f.joueurId === moiId && <span className="discret"> (toi)</span>}
              </button>
            ))}
          </div>
          {active && (
            <FicheVue
              key={active.joueurId}
              fiche={active}
              nomJoueur={nomJoueur(active.joueurId)}
              modifiable={estMj || active.joueurId === moiId}
            />
          )}
        </>
      )}
    </div>
  );
}
