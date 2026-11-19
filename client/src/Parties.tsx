// Écran MJ : plusieurs parties sur le même serveur (étape 9).
// - ChoixPartie : sélecteur en haut de l'écran, pour passer d'une partie à l'autre ;
// - Parties : panneau « Mes parties » (nouvelle partie, dupliquer, renommer, supprimer).
// Chaque partie a son propre lien MJ : changer de partie, c'est ouvrir ce lien.

import { useState, type FormEvent } from "react";
import { PARTIE_NOM_MAX, type PartieMj, type Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { useEtat } from "./etat.ts";

/** Ouvre une partie : son lien MJ, dans cet onglet (le navigateur s'en souvient ensuite). */
function ouvrirPartie(partie: PartieMj): void {
  window.location.href = new URL(partie.lien).pathname;
}

const nomAffiche = (p: PartieMj) => (p.principale ? `⭐ ${p.nom}` : p.nom);

/** Nom de la partie en haut de l'écran : un menu dès qu'il y a plusieurs parties. */
export function ChoixPartie({ nom }: { nom: string }) {
  const parties = useEtat("parties");
  if (!parties || parties.length < 2) return <strong>{nom}</strong>;
  const actuelle = parties.find((p) => p.actuelle);
  return (
    <select
      className="choix-partie"
      value={actuelle?.id ?? ""}
      aria-label="Changer de partie"
      onChange={(e) => {
        const choisie = parties.find((p) => p.id === Number(e.target.value));
        if (choisie && !choisie.actuelle) ouvrirPartie(choisie);
      }}
    >
      {parties.map((p) => (
        <option key={p.id} value={p.id}>
          {nomAffiche(p)}
        </option>
      ))}
    </select>
  );
}

function LignePartie({ partie }: { partie: PartieMj }) {
  const [renommage, setRenommage] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function surRenommer(e: FormEvent) {
    e.preventDefault();
    socket.emit("mj:renommerPartie", { id: partie.id, nom: renommage ?? "" }, (r: Reponse) => {
      if (r.ok) {
        setRenommage(null);
        setErreur(null);
      } else setErreur(r.erreur);
    });
  }

  function surDupliquer() {
    setErreur(null);
    socket.emit("mj:dupliquerPartie", { id: partie.id }, (r: Reponse) => {
      if (!r.ok) setErreur(r.erreur);
    });
  }

  function surSupprimer() {
    if (!confirmer) {
      setConfirmer(true);
      window.setTimeout(() => setConfirmer(false), 5000);
      return;
    }
    socket.emit("mj:supprimerPartie", { id: partie.id }, (r: Reponse) => {
      if (!r.ok) setErreur(r.erreur);
    });
  }

  return (
    <li className={partie.actuelle ? "partie partie-actuelle" : "partie"}>
      {renommage === null ? (
        <div className="partie-entete">
          <strong>{nomAffiche(partie)}</strong>
          {partie.principale && <span className="discret"> (partie principale)</span>}
          {partie.actuelle && <span className="etiquette-etat venu">ouverte ici</span>}
          <span className="discret partie-joueurs">
            {partie.joueurs === 0 ? "aucun joueur" : partie.joueurs === 1 ? "1 joueur" : `${partie.joueurs} joueurs`}
          </span>
        </div>
      ) : (
        <form className="ajout" onSubmit={surRenommer}>
          <input
            value={renommage}
            onChange={(e) => setRenommage(e.target.value)}
            maxLength={PARTIE_NOM_MAX}
            aria-label="Nouveau nom de la partie"
            autoFocus
          />
          <button type="submit">Enregistrer</button>
          <button type="button" className="secondaire" onClick={() => setRenommage(null)}>
            Annuler
          </button>
        </form>
      )}
      {renommage === null && (
        <div className="actions-partie">
          {!partie.actuelle && (
            <button type="button" onClick={() => ouvrirPartie(partie)}>
              Ouvrir
            </button>
          )}
          <button type="button" className="secondaire" onClick={() => setRenommage(partie.nom)}>
            ✏️ Renommer
          </button>
          <button
            type="button"
            className="secondaire"
            title="Copie complète (fiches, scènes, journal…), avec de nouveaux liens"
            onClick={surDupliquer}
          >
            📑 Dupliquer
          </button>
          {!partie.actuelle && (
            <button type="button" className={confirmer ? "danger" : "secondaire"} onClick={surSupprimer}>
              {confirmer ? "Confirmer : tout sera effacé" : "🗑️ Supprimer"}
            </button>
          )}
        </div>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </li>
  );
}

export function Parties() {
  const parties = useEtat("parties");
  const [nom, setNom] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function surCreer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    socket.emit("mj:creerPartie", { nom }, (r: Reponse) => {
      setEnvoi(false);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      // La nouvelle partie apparaît dans la liste (envoyée par le serveur), avec « Ouvrir ».
      setNom("");
    });
  }

  return (
    <section className="carte parties">
      <h2>Mes parties</h2>
      <p className="discret">
        Chaque partie a ses joueurs, ses fiches, son journal et ses scènes. La bibliothèque d'images est
        commune à toutes. Pour essayer quelque chose sans toucher ta campagne, duplique-la : la copie
        a ses propres liens, tes joueurs ne risquent pas d'y entrer par erreur.
      </p>

      {parties === null ? (
        <p className="discret">Chargement…</p>
      ) : (
        <ul className="liste-parties">
          {parties.map((p) => (
            <LignePartie key={p.id} partie={p} />
          ))}
        </ul>
      )}

      <form className="ajout" onSubmit={surCreer}>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={PARTIE_NOM_MAX}
          placeholder="Nom de la nouvelle partie (ex. : Test)"
          aria-label="Nom de la nouvelle partie"
        />
        <button type="submit" disabled={envoi}>
          ➕ Nouvelle partie
        </button>
      </form>
      {erreur && <p className="erreur">{erreur}</p>}
      <p className="discret">
        Une partie supprimée reste dans les sauvegardes automatiques du serveur pendant un moment.
      </p>
    </section>
  );
}
