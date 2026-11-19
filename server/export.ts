// Export et import des parties.
// - Export (MJ seulement) : un fichier .zip avec une base et ses images. Soit la partie ouverte
//   seule, soit tout le serveur (toutes les parties, toute la bibliothèque).
//   Il contient les liens d'invitation : le MJ doit le garder pour lui.
// - Import par le MJ : chaque partie de l'export est ajoutée au serveur (rien n'est remplacé),
//   avec ses liens d'invitation s'ils ne sont pas déjà utilisés ici.
// - Installation d'un serveur tout neuf (la première personne qui l'ouvre) : l'export remplace
//   tout ; il est vérifié, mis en attente, et le serveur redémarre pour l'appliquer base fermée.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { DatabaseSync } from "node:sqlite";
import { zipSync, type Zippable } from "fflate";
import { PARTIE_NOM_MAX } from "../shared/messages.ts";
import { base } from "./base.ts";
import { DOSSIER_MEDIAS, FICHIER_IMPORT, NOM_FICHIER_IMAGE } from "./chemins.ts";
import { copierPartie, nomLibre } from "./copie-partie.ts";
import { lienInvitation } from "./liens.ts";
import { migrerBase } from "./migrations.ts";
import { jetonMj, nomPartieDejaPris, noterVisite, participantParJeton, partieParId, type Participant } from "./partie.ts";
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

/** Le MJ qui fait la demande (d'après le jeton en en-tête), sinon undefined. */
function mjDemandeur(req: Request): Participant | undefined {
  const jeton = req.get("x-brumeland-jeton");
  const participant = jeton ? participantParJeton(jeton) : undefined;
  return participant?.role === "mj" ? participant : undefined;
}
const estMj = (req: Request) => mjDemandeur(req) !== undefined;

const LISEZMOI = `Export Brumeland VTT.

- brumeland.db : la ou les parties (invitations, fiches, journal, scènes, combat).
- medias/ : les images utilisées.

Pour ajouter ces parties à un serveur : écran MJ, « 📥 Importer une partie ».
Pour remplacer tout le contenu d'un serveur par cet export : arrête le serveur, puis
  npm run restaurer -- nom-du-fichier.zip

Attention : ce fichier contient les liens d'invitation (MJ et joueurs). Garde-le pour toi.
`;

/** Nom de fichier sans caractères gênants : « Les Brumes d'Été » → « les-brumes-d-ete ». */
function enNomDeFichier(texte: string): string {
  const s = texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 40) || "partie";
}

const deux = (n: number) => String(n).padStart(2, "0");

/**
 * GET /api/export : la partie ouverte par ce MJ (sa base à elle seule, avec les images de ses
 * scènes) ; GET /api/export?tout=1 : tout le serveur (copie de la base entière, toutes les images).
 */
export function brancherRoutesExport(app: Express): void {
  app.get("/api/export", (req, res) => {
    const mj = mjDemandeur(req);
    if (!mj) {
      res.status(403).json({ ok: false, erreur: "Seul le Meneur de jeu peut exporter la partie." });
      return;
    }
    const tout = req.query.tout === "1";
    const dossier = mkdtempSync(join(tmpdir(), "brumeland-export-"));
    try {
      const copie = join(dossier, "brumeland.db");
      if (tout) {
        copierBase(base, copie);
      } else {
        // Base neuve, avec seulement cette partie (mêmes liens : la base est vide).
        const seule = new DatabaseSync(copie);
        try {
          migrerBase(seule);
          copierPartie(base, mj.partieId, seule, { nom: partieParId(mj.partieId)?.nom ?? "Partie", liens: "garder", images: true });
        } finally {
          seule.close();
        }
      }
      const contenu: Zippable = {
        "LISEZMOI.txt": new TextEncoder().encode(LISEZMOI),
        "brumeland.db": readFileSync(copie),
      };
      // Seulement les images de la bibliothèque (pas la corbeille). Déjà compressées : stockées telles quelles.
      const medias: Zippable = {};
      const lue = new DatabaseSync(copie, { readOnly: true });
      const fichiers = fichiersImages(lue);
      lue.close();
      for (const f of fichiers) {
        const chemin = join(DOSSIER_MEDIAS, f);
        if (NOM_FICHIER_IMAGE.test(f) && existsSync(chemin)) medias[f] = [readFileSync(chemin), { level: 0 }];
      }
      if (Object.keys(medias).length > 0) contenu.medias = medias;
      const zip = zipSync(contenu, { level: 6 });
      const d = new Date();
      const quoi = tout ? "serveur" : enNomDeFichier(partieParId(mj.partieId)?.nom ?? "partie");
      const nom = `brumeland-${quoi}-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}h${deux(d.getMinutes())}.zip`;
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

export interface PartieAjoutee {
  nom: string;
  /** Faux si des liens ont dû être changés (déjà utilisés sur ce serveur). */
  liensGardes: boolean;
}

/**
 * Ajoute au serveur toutes les parties d'un export (déjà vérifié par lireExport) : la base de
 * l'export est d'abord mise au niveau de l'outil, sur une copie temporaire.
 */
function ajouterParties(octetsBase: Uint8Array, medias: [string, Uint8Array][]): PartieAjoutee[] {
  const dossier = mkdtempSync(join(tmpdir(), "brumeland-import-"));
  try {
    const chemin = join(dossier, "brumeland.db");
    writeFileSync(chemin, octetsBase);
    const source = new DatabaseSync(chemin);
    try {
      migrerBase(source);
      // Images d'abord : une scène ne doit jamais renvoyer à un fichier absent.
      mkdirSync(DOSSIER_MEDIAS, { recursive: true });
      for (const [nom, donnees] of medias) {
        const cible = join(DOSSIER_MEDIAS, nom);
        if (!existsSync(cible)) writeFileSync(cible, donnees);
      }
      const parties = source.prepare("SELECT id, nom FROM partie ORDER BY id").all() as { id: number; nom: string }[];
      return parties.map((p) => {
        const nom = nomLibre(p.nom, (n) => nomPartieDejaPris(n, null), "importée", PARTIE_NOM_MAX, true);
        const bilan = copierPartie(source, p.id, base, { nom, liens: "garder", images: true });
        return { nom, liensGardes: bilan.liensGardes };
      });
    } finally {
      source.close();
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * @param partieId partie principale (celle qu'on installe sur un serveur neuf).
 * @param redemarrer arrête proprement le serveur pour qu'il redémarre et applique l'import
 *   (relancé par « npm run partie », « npm start » ou l'hébergeur).
 * @param apresAjout prévient les écrans MJ (liste des parties, bibliothèque) après un ajout.
 */
export function brancherRoutesImport(app: Express, partieId: number, redemarrer: () => void, apresAjout: () => void): void {
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
        if (installationOuverte(partieId)) {
          // Serveur neuf : l'export remplace tout (mêmes liens), après redémarrage.
          writeFileSync(FICHIER_IMPORT, octets);
          importEnCours = true;
          res.json({ ok: true, redemarrage: true, lien: lienInvitation(contenu.jetonMj) });
          // Le temps que la réponse parte, puis redémarrage.
          setTimeout(redemarrer, 500);
          return;
        }
        // Sinon (MJ) : les parties de l'export s'ajoutent à celles du serveur.
        importEnCours = true;
        try {
          const ajoutees = ajouterParties(contenu.octetsBase, contenu.medias);
          apresAjout();
          res.json({ ok: true, ajoutees });
        } finally {
          importEnCours = false;
        }
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
