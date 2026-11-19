// Panneau pour lancer les dés : jet de compétence ou jet libre, sur une ligne.
// Les options (pour qui, faveurs et fléaux, jet secret, raccourcis) se déplient au besoin ;
// repliées, celles qui sont actives restent rappelées en bref.
// Le navigateur n'invente aucun résultat : il envoie la demande, le serveur lance.

import { useState, type FormEvent } from "react";
import {
  BONUS_MAX,
  FORMULE_MAX,
  LIBELLE_MAX,
  VALEUR_MAX,
  VALEUR_MIN,
} from "../../shared/jets.ts";
import type { Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { nomCampAffiche } from "./noms.ts";
import { apresJet, changerReglages, choisirCibleOpposition, useEtat } from "./etat.ts";

type Mode = "competence" | "libre";

const RACCOURCIS = ["1D4", "1D6", "1D8", "1D10", "1D12", "1D20", "2D6", "1D3"];

function Compteur(props: {
  nom: string;
  valeur: number;
  surChangement: (n: number) => void;
  classe: string;
}) {
  const { nom, valeur, surChangement, classe } = props;
  return (
    <div className={`compteur ${classe}`}>
      <span className="compteur-nom">{nom}</span>
      <button
        type="button"
        className="secondaire"
        onClick={() => surChangement(Math.max(0, valeur - 1))}
        disabled={valeur === 0}
        aria-label={`Une ${nom.toLowerCase()} de moins`}
      >
        −
      </button>
      <span className="compteur-valeur" aria-live="polite">
        {valeur}
      </span>
      <button
        type="button"
        className="secondaire"
        onClick={() => surChangement(Math.min(BONUS_MAX, valeur + 1))}
        disabled={valeur === BONUS_MAX}
        aria-label={`Une ${nom.toLowerCase()} de plus`}
      >
        +
      </button>
    </div>
  );
}

export function PanneauJet({ estMj }: { estMj: boolean }) {
  const [modeChoisi, setMode] = useState<Mode>("competence");
  // Jet en opposition : choisi avec le bouton « S'opposer » du journal.
  const cible = useEtat("cibleOpposition");
  // Une opposition se fait toujours avec un jet de compétence ou de caractéristique.
  const mode: Mode = cible ? "competence" : modeChoisi;
  const [libelle, setLibelle] = useState("");
  const [valeur, setValeur] = useState("");
  // Faveurs, fléaux et « secret » sont partagés avec les jets en un clic depuis la fiche.
  const { faveurs, fleaux, secret, ouverte } = useEtat("reglages");
  const setOuverte = (o: boolean) => changerReglages({ ouverte: o });
  const setFaveurs = (n: number) => changerReglages({ faveurs: n });
  const setFleaux = (n: number) => changerReglages({ fleaux: n });
  const setSecret = (s: boolean) => changerReglages({ secret: s });
  const [formule, setFormule] = useState("");
  // MJ : pour qui lance-t-il ? "" = PNJ ou monstre, sinon l'id du joueur.
  const [pour, setPour] = useState("");
  const presents = useEtat("presents");
  const fiches = useEtat("fiches");
  const joueurs = (presents ?? []).filter((p) => p.role === "joueur" && p.nom !== null);
  // Si le joueur choisi disparaît de la liste (invitation supprimée), on revient à « PNJ ».
  const pourValide = joueurs.some((j) => String(j.id) === pour) ? pour : "";
  const pourId = estMj && pourValide !== "" ? Number(pourValide) : null;
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [options, setOptions] = useState(false);

  function terminer(r: Reponse) {
    setEnvoi(false);
    if (r.ok) {
      // Faveurs et fléaux valent pour un seul jet ; l'opposition éventuelle est faite.
      apresJet();
      setErreur(null);
    } else {
      setErreur(r.erreur);
    }
  }

  function surLancer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    if (mode === "competence") {
      socket.emit(
        "jet:competence",
        {
          libelle,
          valeur: Number(valeur),
          faveurs,
          fleaux,
          secret: estMj && secret,
          pourId,
          opposeA: cible?.id ?? null,
          ouverte: estMj && cible !== null && ouverte,
        },
        terminer,
      );
    } else {
      socket.emit("jet:libre", { libelle, formule, secret: estMj && secret, pourId }, terminer);
    }
  }

  const valeurOk =
    /^\d+$/.test(valeur) && Number(valeur) >= VALEUR_MIN && Number(valeur) <= VALEUR_MAX;
  const pret = mode === "competence" ? valeurOk : formule.trim() !== "";

  // Rappel des options actives quand elles sont repliées (faveurs posées depuis une fiche…).
  const pourNom = pourId !== null ? joueurs.find((j) => j.id === pourId)?.nom : null;
  const rappel = [
    pourNom ? `pour ${pourNom}` : null,
    mode === "competence" && faveurs > 0 ? `${faveurs} faveur${faveurs > 1 ? "s" : ""}` : null,
    mode === "competence" && fleaux > 0 ? `${fleaux} fléau${fleaux > 1 ? "x" : ""}` : null,
    estMj && secret ? "secret" : null,
  ].filter((x): x is string => x !== null);

  return (
    <section className="carte panneau-jet">
      <div className="panneau-jet-entete">
        <h2>Lancer les dés</h2>
        {cible === null && (
          <span className="groupe-outils mode-jet" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "competence"}
              className={mode === "competence" ? "outil actif" : "outil secondaire"}
              onClick={() => setMode("competence")}
            >
              Compétence
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "libre"}
              className={mode === "libre" ? "outil actif" : "outil secondaire"}
              onClick={() => setMode("libre")}
            >
              Jet libre
            </button>
          </span>
        )}
      </div>

      {cible && (
        <div className="bandeau-opposition">
          <p>
            <strong>Jet en opposition</strong> à {nomCampAffiche(cible, fiches)}
            {cible.libelle && <> ({cible.libelle})</>}
          </p>
          {estMj && (
            <label className="case">
              <input
                type="checkbox"
                checked={ouverte}
                onChange={(e) => setOuverte(e.target.checked)}
              />
              <span>Opposition ouverte : personne n'agit (bras de fer, poison, maladie…)</span>
            </label>
          )}
          <button
            type="button"
            className="lien"
            onClick={() => {
              choisirCibleOpposition(null);
              setOuverte(false);
              setErreur(null);
            }}
          >
            Annuler l'opposition
          </button>
        </div>
      )}

      <form onSubmit={surLancer} className="formulaire-jet">
        <div className="ligne-jet">
          <input
            className="champ-libelle"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={LIBELLE_MAX}
            aria-label={mode === "competence" ? "Compétence ou caractéristique (facultatif)" : "Pour quoi ? (facultatif)"}
            placeholder={mode === "competence" ? "Compétence (facultatif)" : "Pour quoi ? (facultatif)"}
          />
          {mode === "competence" ? (
            <input
              value={valeur}
              onChange={(e) => setValeur(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              aria-label={`Valeur (de ${VALEUR_MIN} à ${VALEUR_MAX})`}
              title={`Valeur de la compétence ou de la caractéristique (de ${VALEUR_MIN} à ${VALEUR_MAX})`}
              placeholder="Valeur"
              className="champ-valeur"
            />
          ) : (
            <input
              value={formule}
              onChange={(e) => setFormule(e.target.value)}
              maxLength={FORMULE_MAX}
              aria-label="Dés à lancer"
              placeholder="2D6+3"
              className="champ-formule"
            />
          )}
          <button type="submit" disabled={!pret || envoi} className="bouton-lancer">
            {secret && estMj ? "En secret" : "Lancer"}
          </button>
        </div>

        <button type="button" className="lien bouton-options" aria-expanded={options} onClick={() => setOptions((o) => !o)}>
          {options ? "Masquer les options ▴" : "Options ▾"}
          {!options && rappel.length > 0 && <span className="rappel-options"> · {rappel.join(" · ")}</span>}
        </button>

        {options && (
          <div className="options-jet">
            {estMj && (
              <label>
                <span>Pour qui ?</span>
                <select value={pourValide} onChange={(e) => setPour(e.target.value)}>
                  <option value="">PNJ ou monstre</option>
                  {joueurs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nom} (personnage joueur)
                    </option>
                  ))}
                </select>
              </label>
            )}
            {mode === "competence" ? (
              <div className="compteurs">
                <Compteur nom="Faveurs" valeur={faveurs} surChangement={setFaveurs} classe="faveur" />
                <Compteur nom="Fléaux" valeur={fleaux} surChangement={setFleaux} classe="fleau" />
              </div>
            ) : (
              <div className="raccourcis">
                {RACCOURCIS.map((r) => (
                  <button key={r} type="button" className="secondaire" onClick={() => setFormule(r)}>
                    {r}
                  </button>
                ))}
              </div>
            )}
            {estMj && (
              <label className="case">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
                <span>Jet secret (les joueurs ne voient pas le résultat)</span>
              </label>
            )}
          </div>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
      </form>
    </section>
  );
}
