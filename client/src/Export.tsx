// Export (MJ) : télécharge un fichier .zip, avec la partie ouverte seule ou tout le serveur.
// Import : ajoute au serveur les parties d'un export.

import { useState } from "react";
import { jeton } from "./connexion.ts";
import { BoutonImport } from "./Import.tsx";

export function Export() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function exporter(tout: boolean) {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch(tout ? "/api/export?tout=1" : "/api/export", { headers: { "X-Brumeland-Jeton": jeton ?? "" } });
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
      {/* Pas de titre : l'onglet du panneau Gestion le donne déjà. */}
      <p className="discret">
        Le serveur sauvegarde tout seul (au démarrage, puis toutes les 30 minutes). Pour garder une
        copie ailleurs ou déplacer une partie sur un autre serveur, exporte-la : un seul fichier .zip
        avec la partie et ses images. « Importer » ajoute la partie d'un export à tes parties, sans
        rien remplacer.
      </p>
      <div className="actions-export">
        <button type="button" onClick={() => void exporter(false)} disabled={enCours}>
          {enCours ? "Préparation de l'export…" : "📦 Exporter cette partie"}
        </button>
        <BoutonImport />
        <button type="button" className="secondaire" onClick={() => void exporter(true)} disabled={enCours}>
          Exporter tout le serveur
        </button>
      </div>
      <p className="discret avertissement-export">
        ⚠️ Ce fichier contient les liens d'invitation (le tien et ceux des joueurs) : garde-le pour toi.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
