// Journal partagé des jets de dés, du plus récent au plus ancien.

import { useState } from "react";
import {
  dernierEssai,
  ETATS,
  joueurConcerne,
  oppositionPermetDeForcer,
  peutForcerPar,
  resoudreOpposition,
  trouverOpposant,
  type EntreeJournal,
  type IdEtat,
  type ResultatCompetence,
  type ResultatLibre,
} from "../../shared/jets.ts";
import type { Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { choisirCibleOpposition, useEtat } from "./etat.ts";
import { nomAuteur, nomCampAffiche, nomPour } from "./noms.ts";

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? "x" : ""}`;
}

function DetailCompetence({ r }: { r: ResultatCompetence }) {
  const net = r.faveurs - r.fleaux;
  let verdict = r.reussi ? "Réussite" : "Échec";
  let classe = r.reussi ? "reussite" : "echec";
  if (r.dragon) {
    verdict = "Dragon !";
    classe = "dragon";
  } else if (r.demon) {
    verdict = "Démon !";
    classe = "demon";
  }

  return (
    <div className="detail-jet">
      <span className="discret">
        sous {r.valeur}
        {r.faveurs > 0 && <> · {r.faveurs} faveur{r.faveurs > 1 ? "s" : ""}</>}
        {r.fleaux > 0 && <> · {pluriel(r.fleaux, "fléau")}</>}
        {r.fleauEtat && <> (dont 1 dû à l'état {ETATS.find((e) => e.id === r.fleauEtat)?.nom})</>}
        {r.faveurs > 0 && r.fleaux > 0 && net === 0 && <> (s'annulent)</>}
      </span>
      <span className="des">
        {r.des.map((de, i) => (
          <span
            key={i}
            className={i === r.indexGarde ? "de garde" : "de ecarte"}
            title={i === r.indexGarde ? "dé retenu" : "dé écarté"}
          >
            {de}
          </span>
        ))}
      </span>
      <span className={`verdict ${classe}`}>{verdict}</span>
    </div>
  );
}

/** Formule écrite avec le nombre de dés (« 1D8+1D4 »), même pour les jets enregistrés avant. */
function formuleAffichee(r: ResultatLibre): string {
  return r.termes
    .map((t, i) => {
      const signe = t.signe < 0 ? "-" : i > 0 ? "+" : "";
      return signe + (t.nombre === 0 ? String(t.fixe) : `${t.nombre}D${t.faces}`);
    })
    .join("");
}

function DetailLibre({ r }: { r: ResultatLibre }) {
  return (
    <div className="detail-jet">
      <span className="discret">{formuleAffichee(r)}</span>
      <span className="des">
        {r.termes.map((t, i) => (
          <span key={i} className="terme">
            {(i > 0 || t.signe < 0) && <span className="signe">{t.signe < 0 ? "−" : "+"}</span>}
            {t.nombre === 0 ? (
              <span className="fixe">{t.fixe}</span>
            ) : (
              t.des.map((de, j) => (
                <span key={j} className="de" title={`1D${t.faces}`}>
                  {de}
                </span>
              ))
            )}
          </span>
        ))}
      </span>
      <span className="verdict total">= {r.total}</span>
    </div>
  );
}

/** Les deux jets d'origine d'une opposition à laquelle ce jet appartient, s'il y en a une. */
function paireOpposition(
  entree: EntreeJournal,
  journal: EntreeJournal[],
): { actif: EntreeJournal; opposant: EntreeJournal } | null {
  const racineId = entree.forceDe ?? entree.id;
  const racine = journal.find((e) => e.id === racineId) ?? entree;
  const actif =
    racine.opposeA !== null ? journal.find((e) => e.id === racine.opposeA) : racine;
  const opposant = racine.opposeA !== null ? racine : trouverOpposant(racine.id, journal);
  return actif && opposant ? { actif, opposant } : null;
}

function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Résultat d'une opposition, affiché sous le jet le plus récent des deux camps. */
function ResultatOpposition(props: {
  entree: EntreeJournal;
  paire: { actif: EntreeJournal; opposant: EntreeJournal };
  journal: EntreeJournal[];
}) {
  const { entree, paire, journal } = props;
  const fiches = useEtat("fiches");
  const essaiA = dernierEssai(paire.actif.id, journal);
  const essaiO = dernierEssai(paire.opposant.id, journal);
  if (!essaiA || !essaiO) return null;
  if (entree.id !== Math.max(essaiA.id, essaiO.id)) return null;

  const rA = essaiA.resultat;
  const rO = essaiO.resultat;
  if (rA === null || rO === null) {
    return <p className="issue-opposition discret">Résultat de l'opposition gardé secret par le MJ.</p>;
  }
  if (rA.type !== "competence" || rO.type !== "competence") return null;

  const ouverte = paire.opposant.ouverte;
  const issue = resoudreOpposition(rA, rO, ouverte);
  const a = nomCampAffiche(paire.actif, fiches);
  const o = nomCampAffiche(paire.opposant, fiches);
  let texte: string;
  if (ouverte) {
    texte =
      issue === "egalite"
        ? "Égalité : relancez (chacun peut forcer la chance)."
        : `${majuscule(issue === "actif" ? a : o)} l'emporte.`;
  } else {
    texte = issue === "actif" ? `${majuscule(a)} réussit face à ${o}.` : `${majuscule(a)} échoue face à ${o}.`;
  }
  return (
    <p className={`issue-opposition ${issue}`}>
      <span className="discret">Opposition{ouverte ? " ouverte" : ""} : </span>
      {texte}
    </p>
  );
}

function Entree(props: {
  entree: EntreeJournal;
  journal: EntreeJournal[];
  moiId: number;
  estMj: boolean;
}) {
  const { entree, journal, moiId, estMj } = props;
  const [choixEtat, setChoixEtat] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const r = entree.resultat;
  const masque = r === null;
  const etat = ETATS.find((e) => e.id === entree.etat);
  const fiches = useEtat("fiches");
  const concerne = joueurConcerne(entree);
  const etatsDejaSubis = fiches?.find((f) => f.joueurId === concerne)?.etats ?? [];
  const pour = nomPour(entree, fiches);
  const moi = { id: moiId, role: estMj ? ("mj" as const) : ("joueur" as const) };
  const opposant = trouverOpposant(entree.id, journal);
  const paire = r?.type === "competence" || masque ? paireOpposition(entree, journal) : null;
  const cibleDeOpposition =
    entree.opposeA !== null ? journal.find((e) => e.id === entree.opposeA) : undefined;
  const peutSOpposer =
    r?.type === "competence" &&
    entree.forceDe === null &&
    entree.opposeA === null &&
    !opposant &&
    (estMj || joueurConcerne(entree) !== moiId);
  const peutForcerIci = peutForcerPar(entree, moi) && oppositionPermetDeForcer(entree, opposant);

  function repondre(rep: Reponse) {
    if (rep.ok) {
      setChoixEtat(false);
      setErreur(null);
    } else {
      setErreur(rep.erreur);
    }
  }

  function forcer(id: IdEtat) {
    socket.emit("jet:forcer", { id: entree.id, etat: id }, repondre);
  }

  const classes = ["entree"];
  if (entree.forceDe !== null) classes.push("tentative");
  if (entree.secret && !entree.revele) classes.push("secret");

  return (
    <li className={classes.join(" ")}>
      <div className="entree-entete">
        <strong>{nomAuteur(entree, fiches)}</strong>
        {entree.auteurRole === "mj" && <span className="badge-mj">MJ</span>}
        {pour && (
          <span>
            pour <strong>{pour}</strong>
          </span>
        )}
        {entree.libelle && <span className="libelle">{entree.libelle}</span>}
        {entree.opposeA !== null && (
          <span className="badge-opposition">
            {entree.ouverte ? "opposition ouverte" : "s'oppose"}
            {cibleDeOpposition && <> à {nomCampAffiche(cibleDeOpposition, fiches)}</>}
          </span>
        )}
        {estMj && entree.secret && (
          <span className="badge-secret">{entree.revele ? "révélé" : "secret"}</span>
        )}
        <span className="heure">{heure(entree.creeLe)}</span>
      </div>

      {etat && (
        <p className="force-chance">
          force la chance et devient <strong>{etat.nom}</strong> ({etat.carac})
        </p>
      )}

      {masque ? (
        <p className="discret jet-cache">Le MJ lance les dés en secret…</p>
      ) : r.type === "competence" ? (
        <DetailCompetence r={r} />
      ) : (
        <DetailLibre r={r} />
      )}

      {entree.auteurId === moiId &&
        entree.auteurRole === "joueur" &&
        r?.type === "competence" &&
        r.demon && (
          <p className="discret note-jet">Démon : impossible de forcer la chance sur ce jet.</p>
        )}

      <div className="entree-actions">
        {peutForcerIci && !choixEtat && (
          <button type="button" className="secondaire" onClick={() => setChoixEtat(true)}>
            Forcer la chance
          </button>
        )}
        {peutSOpposer && (
          <button type="button" className="secondaire" onClick={() => choisirCibleOpposition(entree)}>
            S'opposer
          </button>
        )}
        {estMj && entree.secret && !entree.revele && (
          <button
            type="button"
            className="secondaire"
            onClick={() => socket.emit("mj:revelerJet", { id: entree.id }, repondre)}
          >
            Révéler aux joueurs
          </button>
        )}
      </div>

      {paire && <ResultatOpposition entree={entree} paire={paire} journal={journal} />}

      {choixEtat && (
        <div className="choix-etat">
          <p>
            {estMj && pour
              ? `Quel état pour ${pour} ? (pas un état déjà subi)`
              : "Quel état subis-tu ? (pas un état que tu as déjà)"}
          </p>
          <div className="etats">
            {ETATS.map((e) => {
              const deja = etatsDejaSubis.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="secondaire"
                  disabled={deja}
                  title={deja ? "État déjà subi" : undefined}
                  onClick={() => forcer(e.id)}
                >
                  {e.nom} <span className="discret">({e.carac})</span>
                </button>
              );
            })}
            <button type="button" className="lien" onClick={() => setChoixEtat(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </li>
  );
}

export function Journal({ moiId, estMj }: { moiId: number; estMj: boolean }) {
  const journal = useEtat("journal");
  const [confirmerVider, setConfirmerVider] = useState(false);

  function vider() {
    if (!confirmerVider) {
      setConfirmerVider(true);
      window.setTimeout(() => setConfirmerVider(false), 4000);
      return;
    }
    socket.emit("mj:viderJournal", {}, () => setConfirmerVider(false));
  }

  return (
    <section className="carte journal">
      <div className="journal-entete">
        <h2>Journal des jets</h2>
        {estMj && journal && journal.length > 0 && (
          <button type="button" className={confirmerVider ? "danger" : "lien"} onClick={vider}>
            {confirmerVider ? "Confirmer : tout effacer" : "Vider le journal"}
          </button>
        )}
      </div>
      {journal === null ? (
        <p className="discret">Chargement…</p>
      ) : journal.length === 0 ? (
        <p className="discret">Aucun jet pour l'instant.</p>
      ) : (
        <ol className="liste-journal">
          {[...journal].reverse().map((entree) => (
            <Entree key={entree.id} entree={entree} journal={journal} moiId={moiId} estMj={estMj} />
          ))}
        </ol>
      )}
    </section>
  );
}
