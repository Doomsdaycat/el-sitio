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

/** Glisser-déposer et flèches pour réordonner les invitations. */
interface OrdreInvitation {
  rang: number;
  total: number;
  deplacer: (versRang: number) => void;
  glissee: boolean;
  survolee: "dessus" | "dessous" | null;
  surDebutGlisse: () => void;
  surSurvol: () => void;
  surFinGlisse: () => void;
  surDepot: () => void;
}

function LigneInvitation({ invitation, ordre }: { invitation: Invitation; ordre: OrdreInvitation }) {
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

  const classes = ["invitation"];
  if (ordre.glissee) classes.push("glissee");
  if (ordre.survolee) classes.push(`survolee-${ordre.survolee}`);

  return (
    <li
      className={classes.join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        ordre.surSurvol();
      }}
      onDrop={(e) => {
        e.preventDefault();
        ordre.surDepot();
      }}
    >
      <div className="invitation-entete">
        <span className="ordre-invitation">
          <span
            className="poignee"
            draggable
            title="Glisser pour déplacer"
            aria-hidden="true"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(invitation.id));
              ordre.surDebutGlisse();
            }}
            onDragEnd={ordre.surFinGlisse}
          >
            ⋮⋮
          </span>
          <button type="button" className="fleche" aria-label={`Monter ${titre}`} disabled={ordre.rang === 0} onClick={() => ordre.deplacer(ordre.rang - 1)}>
            ↑
          </button>
          <button
            type="button"
            className="fleche"
            aria-label={`Descendre ${titre}`}
            disabled={ordre.rang === ordre.total - 1}
            onClick={() => ordre.deplacer(ordre.rang + 1)}
          >
            ↓
          </button>
        </span>
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
  const [glisseeId, setGlisseeId] = useState<number | null>(null);
  const [survoleeId, setSurvoleeId] = useState<number | null>(null);

  /** Déplace une invitation à un rang donné ; la liste ne change qu'une fois le serveur d'accord. */
  function deplacer(id: number, versRang: number) {
    if (!liste) return;
    const ids = liste.map((x) => x.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(versRang, ids.length)), 0, id);
    socket.emit("mj:ordonnerInvitations", { ids }, (r: Reponse) => setErreur(r.ok ? null : r.erreur));
  }


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
          {liste.map((invitation, rang) => (
            <LigneInvitation
              key={invitation.id}
              invitation={invitation}
              ordre={{
                rang,
                total: liste.length,
                deplacer: (versRang) => deplacer(invitation.id, versRang),
                glissee: glisseeId === invitation.id,
                survolee:
                  survoleeId !== invitation.id || glisseeId === null || glisseeId === invitation.id
                    ? null
                    : liste.findIndex((x) => x.id === glisseeId) < rang
                      ? "dessous"
                      : "dessus",
                surDebutGlisse: () => setGlisseeId(invitation.id),
                surSurvol: () => setSurvoleeId(invitation.id),
                surFinGlisse: () => {
                  setGlisseeId(null);
                  setSurvoleeId(null);
                },
                surDepot: () => {
                  if (glisseeId !== null && glisseeId !== invitation.id) deplacer(glisseeId, rang);
                  setGlisseeId(null);
                  setSurvoleeId(null);
                },
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
