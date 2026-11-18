// Export de la partie (MJ) : télécharge un fichier .zip avec la base et toutes les images.

import { useState } from "react";
import { jeton } from "./connexion.ts";
import { BoutonImport } from "./Import.tsx";

export function Export() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function exporter() {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/export", { headers: { "X-Brumeland-Jeton": jeton ?? "" } });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
        setErreur(corps?.erreur ?? "L'export a échoué.");
        return;
      }
      const nom = /filename="([^"]+)"/.exec(reponse.headers.get("Content-Disposition") ?? "")?.[1] ?? "brumeland.zip";
      const adresse = URL.createObjectURL(await reponse.blob());
      const lien = document.createElement("a");
      lien.href = adresse;
      lien.download = nom;
      document.body.append(lien);
      lien.click();
      lien.remove();
      window.setTimeout(() => URL.revokeObjectURL(adresse), 60_000);
    } catch {
      setErreur("Le serveur ne répond pas : l'export a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="carte export">
      <h2>Sauvegarde de la partie</h2>
      <p className="discret">
        Le serveur sauvegarde la partie tout seul (au démarrage, puis toutes les 30 minutes). Pour en
        garder une copie ailleurs ou la déplacer sur un autre ordinateur, exporte-la : un seul fichier
        .zip avec toute la partie et ses images. « Importer » remplace la partie par celle d'un export.
      </p>
      <div className="actions-export">
        <button type="button" onClick={exporter} disabled={enCours}>
          {enCours ? "Préparation de l'export…" : "📦 Exporter la partie"}
        </button>
        <BoutonImport confirmer />
      </div>
      <p className="discret avertissement-export">
        ⚠️ Ce fichier contient les liens d'invitation (le tien et ceux des joueurs) : garde-le pour toi.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
