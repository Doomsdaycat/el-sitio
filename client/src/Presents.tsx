// Liste des participants et de leur statut (connecté ou non), visible par tout le monde.

import { useEffect, useState } from "react";
import type { Present } from "../../shared/messages.ts";
import { socket } from "./connexion.ts";

export function Presents({ moiId }: { moiId: number }) {
  const [liste, setListe] = useState<Present[] | null>(null);

  useEffect(() => {
    socket.on("presents", setListe);
    return () => {
      socket.off("presents", setListe);
    };
  }, []);

  if (liste === null) return null;
  const nbConnectes = liste.filter((p) => p.connecte).length;

  return (
    <section className="carte presents">
      <h2>À la table</h2>
      <p className="discret">
        {nbConnectes} connecté{nbConnectes > 1 ? "s" : ""} sur {liste.length}
      </p>
      <ul>
        {liste.map((p) => (
          <li key={p.id} className={p.connecte ? "present connecte" : "present absent"}>
            <span className="pastille" aria-hidden="true" />
            <span className="present-nom">
              {p.nom ?? <em>nouveau joueur</em>}
              {p.id === moiId && <span className="discret"> (toi)</span>}
            </span>
            {p.role === "mj" && <span className="badge-mj">MJ</span>}
            <span className="visually-hidden">{p.connecte ? "connecté" : "déconnecté"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
