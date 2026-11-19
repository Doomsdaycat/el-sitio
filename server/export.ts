// Export et import de la partie.
// - Export (MJ seulement) : un seul fichier .zip avec une copie de la base et toutes les images.
//   Il contient les liens d'invitation : le MJ doit le garder pour lui.
// - Import : le MJ (ou, sur un serveur tout neuf, la première personne qui l'ouvre) dépose un
//   export. Il est vérifié, mis en attente, et le serveur redémarre pour l'appliquer base fermée.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { zipSync, type Zippable } from "fflate";
import { base } from "./base.ts";
import { DOSSIER_MEDIAS, FICHIER_IMPORT, NOM_FICHIER_IMAGE } from "./chemins.ts";
import { lienInvitation } from "./liens.ts";
import { jetonMj, noterVisite, participantParJeton } from "./partie.ts";
import { ErreurRestauration, lireExport } from "./restauration.ts";
import { copierBase, fichiersImages } from "./sauvegardes.ts";

/** Taille maximale d'un export déposé (images comprises). */
const IMPORT_TAILLE_MAX = 500 * 1024 * 1024;

/**
 * Serveur tout neuf : une seule partie, personne n'est encore venu (ni MJ ni joueur) et la
 * bibliothèque est vide.
 * La première personne qui ouvre l'adresse peut alors installer la partie. Sur un serveur en
 * ligne, à faire avant d'ouvrir l'adresse au public.
 */
function installationOuverte(partieId: number): boolean {
  const { n } = base.prepare("SELECT count(*) AS n FROM participant WHERE partie_id = ?").get(partieId) as { n: number };
  const { v } = base
    .prepare("SELECT count(*) AS v FROM participant WHERE partie_id = ? AND derniere_visite IS NOT NULL")
    .get(partieId) as { v: number };
  const { i } = base.prepare("SELECT count(*) AS i FROM image").get() as { i: number };
  const { p } = base.prepare("SELECT count(*) AS p FROM partie").get() as { p: number };
  return n === 1 && v === 0 && i === 0 && p === 1;
}

/** Le MJ (de n'importe quelle partie) qui fait la demande, d'après le jeton en en-tête. */
function estMj(req: Request): boolean {
  const jeton = req.get("x-brumeland-jeton");
  const participant = jeton ? participantParJeton(jeton) : undefined;
  return !!participant && participant.role === "mj";
}

const LISEZMOI = `Export d'une partie Brumeland VTT.

- brumeland.db : la partie (invitations, fiches, journal, scènes, combat).
- medias/ : les images de la bibliothèque.

Pour la reprendre : copie ce fichier dans le dossier du projet, arrête le serveur, puis
  npm run restaurer -- nom-du-fichier.zip

Attention : ce fichier contient les liens d'invitation (MJ et joueurs). Garde-le pour toi.
`;

const deux = (n: number) => String(n).padStart(2, "0");

export function brancherRoutesExport(app: Express): void {
  app.get("/api/export", (req, res) => {
    if (!estMj(req)) {
      res.status(403).json({ ok: false, erreur: "Seul le Meneur de jeu peut exporter la partie." });
      return;
    }
    const dossier = mkdtempSync(join(tmpdir(), "brumeland-export-"));
    try {
      const copie = join(dossier, "brumeland.db");
      copierBase(base, copie);
      const contenu: Zippable = {
        "LISEZMOI.txt": new TextEncoder().encode(LISEZMOI),
        "brumeland.db": readFileSync(copie),
      };
      // Seulement les images de la bibliothèque (pas la corbeille). Déjà compressées : stockées telles quelles.
      const medias: Zippable = {};
      for (const f of fichiersImages(base)) {
        const chemin = join(DOSSIER_MEDIAS, f);
        if (NOM_FICHIER_IMAGE.test(f) && existsSync(chemin)) medias[f] = [readFileSync(chemin), { level: 0 }];
      }
      if (Object.keys(medias).length > 0) contenu.medias = medias;
      const zip = zipSync(contenu, { level: 6 });
      const d = new Date();
      const nom = `brumeland-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}h${deux(d.getMinutes())}.zip`;
      res.set("Content-Type", "application/zip");
      res.set("Content-Disposition", `attachment; filename="${nom}"`);
      res.set("Cache-Control", "no-store");
      res.send(Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength));
    } catch (erreur) {
      console.error(erreur);
      res.status(500).json({ ok: false, erreur: "L'export a échoué." });
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
}

/**
 * @param redemarrer arrête proprement le serveur pour qu'il redémarre et applique l'import
 *   (relancé par « npm run partie », « npm start » ou l'hébergeur).
 */
export function brancherRoutesImport(app: Express, partieId: number, redemarrer: () => void): void {
  let importEnCours = false;

  app.get("/api/installation", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ouverte: installationOuverte(partieId) });
  });

  // Serveur neuf, sans import : on garde la partie vide et on donne le lien MJ.
  app.post("/api/installation/nouvelle", (_req, res) => {
    if (!installationOuverte(partieId)) {
      res.status(403).json({ ok: false, erreur: "Cette partie est déjà installée." });
      return;
    }
    const jeton = jetonMj(partieId);
    const mj = participantParJeton(jeton);
    if (mj) noterVisite(mj.id); // l'installation se ferme
    res.json({ ok: true, lien: lienInvitation(jeton) });
  });

  app.post(
    "/api/import",
    (req: Request, res: Response, suite: NextFunction) => {
      if (!estMj(req) && !installationOuverte(partieId)) {
        res.status(403).json({ ok: false, erreur: "Seul le Meneur de jeu peut importer une partie." });
        return;
      }
      if (importEnCours) {
        res.status(409).json({ ok: false, erreur: "Un import est déjà en cours." });
        return;
      }
      suite();
    },
    express.raw({ type: () => true, limit: IMPORT_TAILLE_MAX }),
    (req, res) => {
      const octets = req.body;
      if (!Buffer.isBuffer(octets) || octets.length === 0) {
        res.status(400).json({ ok: false, erreur: "Fichier vide." });
        return;
      }
      try {
        const contenu = lireExport(octets);
        writeFileSync(FICHIER_IMPORT, octets);
        importEnCours = true;
        res.json({ ok: true, nomPartie: contenu.nomPartie, lien: lienInvitation(contenu.jetonMj) });
        // Le temps que la réponse parte, puis redémarrage (la partie importée remplace l'actuelle).
        setTimeout(redemarrer, 500);
      } catch (erreur) {
        if (erreur instanceof ErreurRestauration) {
          res.status(400).json({ ok: false, erreur: erreur.message });
        } else {
          console.error(erreur);
          res.status(500).json({ ok: false, erreur: "L'import a échoué." });
        }
      }
    },
  );

  app.use("/api/import", (erreur: { type?: string; status?: number }, _req: Request, res: Response, suite: NextFunction) => {
    if (erreur?.type === "entity.too.large") {
      res.status(413).json({ ok: false, erreur: `Fichier trop lourd : ${IMPORT_TAILLE_MAX / 1024 / 1024} Mo au plus.` });
      return;
    }
    if (erreur) {
      res.status(erreur.status ?? 400).json({ ok: false, erreur: "L'envoi du fichier a échoué." });
      return;
    }
    suite();
  });
}
