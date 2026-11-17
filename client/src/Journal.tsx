// Journal partagé des jets de dés, du plus récent au plus ancien.

import { useState } from "react";
import {
  ETATS,
  peutForcerPar,
  type EntreeJournal,
  type IdEtat,
  type ResultatCompetence,
  type ResultatLibre,
} from "../../shared/jets.ts";
import type { Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { useEtat } from "./etat.ts";

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

function DetailLibre({ r }: { r: ResultatLibre }) {
  return (
    <div className="detail-jet">
      <span className="discret">{r.formule}</span>
      <span className="des">
        {r.termes.map((t, i) => (
          <span key={i} className="terme">
            {(i > 0 || t.signe < 0) && <span className="signe">{t.signe < 0 ? "−" : "+"}</span>}
            {t.nombre === 0 ? (
              <span className="fixe">{t.fixe}</span>
            ) : (
              t.des.map((de, j) => (
                <span key={j} className="de" title={`D${t.faces}`}>
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

function Entree(props: { entree: EntreeJournal; moiId: number; estMj: boolean }) {
  const { entree, moiId, estMj } = props;
  const [choixEtat, setChoixEtat] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const r = entree.resultat;
  const masque = r === null;
  const etat = ETATS.find((e) => e.id === entree.etat);
  const moi = { id: moiId, role: estMj ? ("mj" as const) : ("joueur" as const) };

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
        <strong>{entree.auteurNom}</strong>
        {entree.auteurRole === "mj" && <span className="badge-mj">MJ</span>}
        {entree.pourNom && (
          <span>
            pour <strong>{entree.pourNom}</strong>
          </span>
        )}
        {entree.libelle && <span className="libelle">{entree.libelle}</span>}
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

      {entree.auteurId === moiId && r?.type === "competence" && !r.reussi && (
        <>
          {r.demon && entree.auteurRole === "joueur" && (
            <p className="discret note-jet">Démon : impossible de forcer la chance sur ce jet.</p>
          )}
          {!r.demon && entree.auteurRole === "mj" && entree.pourId === null && (
            <p className="discret note-jet">
              Les PNJ et les monstres ne peuvent pas forcer la chance. Pour un jet de personnage
              joueur, choisis le joueur dans « Pour qui ? » avant de lancer.
            </p>
          )}
        </>
      )}

      <div className="entree-actions">
        {peutForcerPar(entree, moi) && !choixEtat && (
          <button type="button" className="secondaire" onClick={() => setChoixEtat(true)}>
            Forcer la chance
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

      {choixEtat && (
        <div className="choix-etat">
          <p>
            {estMj && entree.pourNom
              ? `Quel état pour ${entree.pourNom} ? (pas un état déjà subi)`
              : "Quel état subis-tu ? (pas un état que tu as déjà)"}
          </p>
          <div className="etats">
            {ETATS.map((e) => (
              <button key={e.id} type="button" className="secondaire" onClick={() => forcer(e.id)}>
                {e.nom} <span className="discret">({e.carac})</span>
              </button>
            ))}
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
            <Entree key={entree.id} entree={entree} moiId={moiId} estMj={estMj} />
          ))}
        </ol>
      )}
    </section>
  );
}
