// Export de la partie (MJ seulement) : un seul fichier .zip avec une copie de la base
// et toutes les images. Il se restaure avec « npm run restaurer -- fichier.zip ».
// Il contient les liens d'invitation : le MJ doit le garder pour lui.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import { zipSync, type Zippable } from "fflate";
import { base } from "./base.ts";
import { DOSSIER_MEDIAS, NOM_FICHIER_IMAGE } from "./chemins.ts";
import { participantParJeton } from "./partie.ts";
import { copierBase, fichiersImages } from "./sauvegardes.ts";

const LISEZMOI = `Export d'une partie Brumeland VTT.

- brumeland.db : la partie (invitations, fiches, journal, scènes, combat).
- medias/ : les images de la bibliothèque.

Pour la reprendre : copie ce fichier dans le dossier du projet, arrête le serveur, puis
  npm run restaurer -- nom-du-fichier.zip

Attention : ce fichier contient les liens d'invitation (MJ et joueurs). Garde-le pour toi.
`;

const deux = (n: number) => String(n).padStart(2, "0");

export function brancherRoutesExport(app: Express, partieId: number): void {
  app.get("/api/export", (req, res) => {
    const jeton = req.get("x-brumeland-jeton");
    const participant = jeton ? participantParJeton(jeton) : undefined;
    if (!participant || participant.partieId !== partieId || participant.role !== "mj") {
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
