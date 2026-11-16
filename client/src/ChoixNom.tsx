// Formulaire où le joueur choisit son nom (première visite) ou le change.

import { useState, type FormEvent } from "react";
import { NOM_MAX, type Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";

interface Props {
  nomActuel: string | null;
  /** Appelé quand le serveur a accepté le nom (ou quand le joueur annule un changement). */
  surTermine?: () => void;
}

export function ChoixNom({ nomActuel, surTermine }: Props) {
  const [nom, setNom] = useState(nomActuel ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const premiereVisite = nomActuel === null;

  function surValider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    // L'écran ne change qu'une fois le nom accepté par le serveur.
    socket.emit("joueur:choisirNom", { nom }, (r: Reponse) => {
      setEnvoi(false);
      if (r.ok) surTermine?.();
      else setErreur(r.erreur);
    });
  }

  return (
    <section className="carte choix-nom">
      <h2>{premiereVisite ? "Bienvenue à la table !" : "Changer de nom"}</h2>
      {premiereVisite && (
        <p className="discret">
          Comment veux-tu que les autres t'appellent ? Tu ne le feras qu'une fois : ensuite, ton lien
          suffit pour être reconnu.
        </p>
      )}
      <form className="ajout" onSubmit={surValider}>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={NOM_MAX}
          placeholder="Ton nom ou ton pseudo"
          aria-label="Ton nom"
          autoFocus
        />
        <button type="submit" disabled={envoi || nom.trim() === ""}>
          {premiereVisite ? "Entrer" : "Valider"}
        </button>
        {!premiereVisite && (
          <button type="button" className="secondaire" onClick={surTermine}>
            Annuler
          </button>
        )}
      </form>
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
