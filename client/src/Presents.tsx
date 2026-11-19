// Liste des participants et de leur statut (connecté ou non), visible par tout le monde.
// Affichée dans le panneau de connexion de la barre du haut.

import type { Present } from "../../shared/messages.ts";

export function ListePresents({ liste, moiId }: { liste: Present[]; moiId: number | null }) {
  return (
    <ul className="liste-presents">
      {liste.map((p) => (
        <li key={p.id} className={p.connecte ? "present connecte" : "present absent"}>
          <span className="pastille" aria-hidden="true" />
          <span className="present-nom">
            {p.nom ?? <em>nouveau joueur</em>}
            {p.id === moiId && <span className="discret"> (toi)</span>}
          </span>
          {p.role === "mj" ? (
            <span className="badge-mj">MJ</span>
          ) : (
            !p.connecte && <span className="discret present-statut">absent</span>
          )}
          <span className="visually-hidden">{p.connecte ? "connecté" : "déconnecté"}</span>
        </li>
      ))}
    </ul>
  );
}
