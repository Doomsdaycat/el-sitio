// Écran MJ : créer, copier et supprimer les liens d'invitation des joueurs.

import { useState, type FormEvent } from "react";
import { ETIQUETTE_MAX, type Invitation, type Reponse } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";
import { useEtat } from "./etat.ts";

/** Copie un texte dans le presse-papiers. Renvoie false si le navigateur refuse. */
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

function LigneInvitation({ invitation }: { invitation: Invitation }) {
  const [copie, setCopie] = useState<"non" | "ok" | "echec">("non");
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const titre = invitation.nom ?? invitation.etiquette ?? `Invitation n° ${invitation.id}`;

  async function surCopier() {
    setCopie((await copier(invitation.lien)) ? "ok" : "echec");
    window.setTimeout(() => setCopie("non"), 2000);
  }

  function surSupprimer() {
    if (!confirmer) {
      setConfirmer(true);
      window.setTimeout(() => setConfirmer(false), 4000);
      return;
    }
    socket.emit("mj:supprimerInvitation", { id: invitation.id }, (r: Reponse) => {
      if (!r.ok) setErreur(r.erreur);
    });
  }

  return (
    <li className="invitation">
      <div className="invitation-entete">
        <strong>{titre}</strong>
        {invitation.nom && invitation.etiquette && (
          <span className="discret"> ({invitation.etiquette})</span>
        )}
        <span className={`etiquette-etat ${invitation.dejaVenu ? "venu" : "jamais-venu"}`}>
          {invitation.dejaVenu ? "déjà venu" : "pas encore venu"}
        </span>
      </div>
      <div className="invitation-lien">
        <input
          readOnly
          value={invitation.lien}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Lien de ${titre}`}
        />
        <button type="button" onClick={surCopier}>
          {copie === "ok" ? "Copié ✓" : copie === "echec" ? "Sélectionne et copie" : "Copier"}
        </button>
        <button type="button" className={confirmer ? "danger" : "secondaire"} onClick={surSupprimer}>
          {confirmer ? "Confirmer la suppression" : "Supprimer"}
        </button>
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
    </li>
  );
}

export function Invitations() {
  const liste = useEtat("invitations");
  const [etiquette, setEtiquette] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function surAjouter(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    // Pas de mise à jour locale : la liste revient du serveur une fois l'invitation créée.
    socket.emit("mj:creerInvitation", { etiquette }, (r: Reponse) => {
      setEnvoi(false);
      if (r.ok) setEtiquette("");
      else setErreur(r.erreur);
    });
  }

  return (
    <section className="carte">
      <h2>Invitations des joueurs</h2>
      <p className="discret">
        Un lien par joueur. Envoie-le sur Discord : il suffit d'un clic pour rejoindre la partie.
      </p>

      <form className="ajout" onSubmit={surAjouter}>
        <input
          value={etiquette}
          onChange={(e) => setEtiquette(e.target.value)}
          maxLength={ETIQUETTE_MAX}
          placeholder="Pour qui ? (facultatif, ex. : Julien)"
          aria-label="Pour qui est ce lien ?"
        />
        <button type="submit" disabled={envoi}>
          Ajouter un joueur
        </button>
      </form>
      {erreur && <p className="erreur">{erreur}</p>}

      {liste === null ? (
        <p className="discret">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="discret">Aucune invitation pour l'instant.</p>
      ) : (
        <ul className="liste-invitations">
          {liste.map((invitation) => (
            <LigneInvitation key={invitation.id} invitation={invitation} />
          ))}
        </ul>
      )}
    </section>
  );
}
