// Import d'un export .zip :
// - depuis l'écran MJ : les parties de l'export s'ajoutent à celles du serveur (menu des parties) ;
// - à l'installation d'un serveur neuf : l'export remplace tout ; le serveur redémarre pour
//   l'appliquer, puis on ouvre le lien MJ de la partie importée.

import { useEffect, useRef, useState } from "react";
import { jeton } from "./connexion.ts";

type Reponse =
  | { ok: true; redemarrage: true; lien: string }
  | { ok: true; redemarrage?: false; ajoutees: { nom: string; liensGardes: boolean }[] }
  | { ok: false; erreur: string };

const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Attend que le serveur ait redémarré, puis ouvre le lien (sur l'adresse actuelle du navigateur). */
async function ouvrirApresRedemarrage(lien: string): Promise<void> {
  await pause(2000);
  for (let essai = 0; essai < 90; essai++) {
    try {
      const r = await fetch("/api/sante", { cache: "no-store" });
      if (r.ok) break;
    } catch {
      // Serveur encore en train de redémarrer.
    }
    await pause(1000);
  }
  window.location.href = new URL(lien).pathname;
}

async function envoyer(fichier: File): Promise<Reponse> {
  try {
    const r = await fetch("/api/import", {
      method: "POST",
      body: fichier,
      headers: { "X-Brumeland-Jeton": jeton ?? "", "Content-Type": "application/zip" },
    });
    return ((await r.json().catch(() => null)) as Reponse | null) ?? { ok: false, erreur: "L'import a échoué." };
  } catch {
    return { ok: false, erreur: "Le serveur ne répond pas : l'import a échoué." };
  }
}

/** Bouton « Importer une partie ». */
export function BoutonImport() {
  const champ = useRef<HTMLInputElement>(null);
  const [etape, setEtape] = useState<"pret" | "envoi" | "redemarrage">("pret");
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  async function surFichier(fichier: File | undefined) {
    if (champ.current) champ.current.value = "";
    if (!fichier) return;
    setErreur(null);
    setBilan(null);
    setEtape("envoi");
    const r = await envoyer(fichier);
    if (!r.ok) {
      setErreur(r.erreur);
      setEtape("pret");
      return;
    }
    if (r.redemarrage) {
      setEtape("redemarrage");
      await ouvrirApresRedemarrage(r.lien);
      return;
    }
    setEtape("pret");
    const noms = r.ajoutees.map((p) => `« ${p.nom} »`).join(", ");
    const liensChanges = r.ajoutees.some((p) => !p.liensGardes);
    setBilan(
      `${r.ajoutees.length > 1 ? "Parties ajoutées" : "Partie ajoutée"} : ${noms}. Ouvre-la depuis « Mes parties ».` +
        (liensChanges ? " Certains de ses liens étaient déjà utilisés ici : ils ont été remplacés par de nouveaux." : ""),
    );
  }

  return (
    <>
      <input
        ref={champ}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => void surFichier(e.target.files?.[0])}
      />
      <button type="button" disabled={etape !== "pret"} onClick={() => champ.current?.click()}>
        {etape === "envoi"
          ? "Envoi du fichier…"
          : etape === "redemarrage"
            ? "Partie importée, redémarrage…"
            : "📥 Importer une partie"}
      </button>
      {erreur && <p className="erreur">{erreur}</p>}
      {bilan && <p className="succes">{bilan}</p>}
    </>
  );
}

/** Serveur tout neuf : la première personne qui ouvre l'adresse installe la partie. */
export function Installation() {
  const [ouverte, setOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/installation", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ouverte?: boolean }) => setOuverte(d.ouverte === true))
      .catch(() => setOuverte(false));
  }, []);

  async function nouvelle() {
    setErreur(null);
    try {
      const r = (await (await fetch("/api/installation/nouvelle", { method: "POST" })).json()) as
        | { ok: true; lien: string }
        | { ok: false; erreur: string };
      if (r.ok) window.location.href = new URL(r.lien).pathname;
      else setErreur(r.erreur);
    } catch {
      setErreur("Le serveur ne répond pas.");
    }
  }

  if (!ouverte) return null;
  return (
    <section className="carte installation">
      <h2>Installation de la partie</h2>
      <p>
        Ce serveur est tout neuf. Pour y reprendre ta partie, importe le fichier .zip obtenu avec
        « 📦 Exporter cette partie » (ou « Exporter tout le serveur ») sur ton écran MJ actuel : tout est repris (liens, fiches, scènes,
        images). Ton lien MJ s'ouvre ensuite tout seul.
      </p>
      <div className="actions-installation">
        <BoutonImport />
        <button type="button" className="secondaire" onClick={() => void nouvelle()}>
          Commencer une nouvelle partie
        </button>
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
      <p className="discret">Cet écran disparaît dès que la partie est installée.</p>
    </section>
  );
}
