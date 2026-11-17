// Bibliothèque d'images du MJ : dépôt, envoi aux navigateurs, renommage, suppression.
// Les scènes (qui utilisent ces images) sont gérées dans scenes.ts.
// Les fichiers sont rangés dans data/medias/, à côté de la base (jamais dans le dépôt git).

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Server, Socket } from "socket.io";
import type { MessagesClient, MessagesServeur, Reponse } from "../shared/messages.ts";
import {
  FORMATS_IMAGE,
  IMAGE_NOM_MAX,
  IMAGE_TAILLE_MAX,
  type ImageBibliotheque,
} from "../shared/scenes.ts";
import { base, CHEMIN_BASE } from "./base.ts";
import { nomDepuisFichier, reconnaitreImage } from "./images-format.ts";
import { participantParJeton, type Participant } from "./partie.ts";
import { diffuserScenes, scenesUtilisant } from "./scenes.ts";

export const DOSSIER_MEDIAS = join(dirname(CHEMIN_BASE), "medias");

interface DonneesSocket {
  participant: Participant;
}
type Io = Server<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;
type SocketBrumeland = Socket<MessagesClient, MessagesServeur, Record<string, never>, DonneesSocket>;

const SALLE_MJ = "mj";

// ---------------------------------------------------------------------------
// Base de données

interface LigneImage extends Omit<ImageBibliotheque, "scenes"> {
  fichier: string;
}

const COLONNES = "id, nom, fichier, type, taille, cree_le AS creeLe";

function lireImage(partieId: number, id: string): LigneImage | undefined {
  return base
    .prepare(`SELECT ${COLONNES} FROM image WHERE partie_id = ? AND id = ?`)
    .get(partieId, id) as LigneImage | undefined;
}

export function listerImages(partieId: number): ImageBibliotheque[] {
  const lignes = base
    .prepare(`SELECT ${COLONNES} FROM image WHERE partie_id = ? ORDER BY cree_le, id`)
    .all(partieId) as unknown as LigneImage[];
  return lignes.map(({ fichier: _fichier, ...image }) => ({ ...image, scenes: scenesUtilisant(partieId, image.id) }));
}

// ---------------------------------------------------------------------------
// Diffusions (la bibliothèque n'est envoyée qu'au MJ)

export function diffuserImages(io: Io, partieId: number): void {
  io.to(SALLE_MJ).emit("images", listerImages(partieId));
}

export function envoyerImages(socket: SocketBrumeland, partieId: number): void {
  if (socket.data.participant.role === "mj") socket.emit("images", listerImages(partieId));
}

// ---------------------------------------------------------------------------
// Adresses HTTP : dépôt (MJ) et lecture des images

/** Le dépôt passe par HTTP (plus adapté aux gros fichiers) : le MJ joint son jeton. */
function exigerMj(partieId: number) {
  return (req: Request, res: Response, suite: NextFunction) => {
    const jeton = req.get("x-brumeland-jeton");
    const participant = jeton ? participantParJeton(jeton) : undefined;
    if (!participant || participant.partieId !== partieId || participant.role !== "mj") {
      res.status(403).json({ ok: false, erreur: "Seul le meneur de jeu peut déposer des images." });
      return;
    }
    suite();
  };
}

export function brancherRoutesImages(app: Express, io: Io, partieId: number): void {
  mkdirSync(DOSSIER_MEDIAS, { recursive: true });

  app.post(
    "/api/images",
    exigerMj(partieId),
    express.raw({ type: () => true, limit: IMAGE_TAILLE_MAX }),
    (req, res) => {
      const octets = req.body;
      if (!Buffer.isBuffer(octets) || octets.length === 0) {
        res.status(400).json({ ok: false, erreur: "Fichier vide." });
        return;
      }
      const format = reconnaitreImage(octets);
      if (!format) {
        res.status(415).json({ ok: false, erreur: `Format non accepté : ${FORMATS_IMAGE} seulement.` });
        return;
      }
      let nomFichier = "";
      try {
        nomFichier = decodeURIComponent(req.get("x-nom-fichier") ?? "");
      } catch {
        // Nom illisible : on garde « Image ».
      }
      const id = randomBytes(16).toString("hex");
      const fichier = `${id}.${format.extension}`;
      writeFileSync(join(DOSSIER_MEDIAS, fichier), octets);
      base
        .prepare(
          "INSERT INTO image (id, partie_id, nom, fichier, type, taille, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, partieId, nomDepuisFichier(nomFichier), fichier, format.type, octets.length, new Date().toISOString());
      diffuserImages(io, partieId);
      res.json({ ok: true, id });
    },
  );

  // Les identifiants d'images sont aléatoires et impossibles à deviner : un joueur ne connaît
  // que ceux des images des scènes que le MJ lui a montrées. Le navigateur les garde en cache.
  app.get("/api/images/:id", (req, res) => {
    const image = /^[0-9a-f]{32}$/.test(req.params.id) ? lireImage(partieId, req.params.id) : undefined;
    const chemin = image && join(DOSSIER_MEDIAS, image.fichier);
    if (!image || !chemin || !existsSync(chemin)) {
      res.status(404).json({ ok: false, erreur: "Image introuvable." });
      return;
    }
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.set("X-Content-Type-Options", "nosniff");
    res.type(image.type);
    res.sendFile(chemin);
  });

  // Fichier trop gros ou envoi interrompu : réponse claire en français.
  app.use("/api/images", (erreur: { type?: string; status?: number }, _req: Request, res: Response, suite: NextFunction) => {
    if (erreur?.type === "entity.too.large") {
      res.status(413).json({ ok: false, erreur: `Image trop lourde : ${IMAGE_TAILLE_MAX / 1024 / 1024} Mo au plus.` });
      return;
    }
    if (erreur) {
      res.status(erreur.status ?? 400).json({ ok: false, erreur: "L'envoi de l'image a échoué." });
      return;
    }
    suite();
  });
}

// ---------------------------------------------------------------------------
// Commandes du MJ

export function brancherImages(io: Io, socket: SocketBrumeland, partieId: number): void {
  function reserveMj<D>(action: (d: D) => Reponse) {
    return (d: D, reponse: (r: Reponse) => void) => {
      if (typeof reponse !== "function") return;
      if (socket.data.participant.role !== "mj") {
        reponse({ ok: false, erreur: "Action réservée au meneur de jeu." });
        return;
      }
      try {
        reponse(action(d));
      } catch (erreur) {
        console.error(erreur);
        reponse({ ok: false, erreur: "Erreur inattendue sur le serveur." });
      }
    };
  }

  socket.on(
    "mj:renommerImage",
    reserveMj((d: { id: string; nom: string }) => {
      const image = typeof d?.id === "string" ? lireImage(partieId, d.id) : undefined;
      if (!image) return { ok: false, erreur: "Cette image n'existe plus." };
      const nom = typeof d.nom === "string" ? d.nom.normalize("NFC").replace(/\s+/g, " ").trim() : "";
      if (nom === "") return { ok: false, erreur: "Donne un nom à l'image." };
      if (nom.length > IMAGE_NOM_MAX) return { ok: false, erreur: `${IMAGE_NOM_MAX} caractères au plus.` };
      base.prepare("UPDATE image SET nom = ? WHERE id = ?").run(nom, image.id);
      diffuserScenes(io, partieId); // envoie aussi la bibliothèque
      return { ok: true };
    }),
  );

  socket.on(
    "mj:supprimerImage",
    reserveMj((d: { id: string }) => {
      const image = typeof d?.id === "string" ? lireImage(partieId, d.id) : undefined;
      if (!image) return { ok: false, erreur: "Cette image n'existe plus." };
      // Une image utilisée par des scènes ne peut pas être supprimée.
      const utilisee = scenesUtilisant(partieId, image.id);
      if (utilisee.length > 0) {
        const liste = utilisee.map((n) => `« ${n} »`).join(", ");
        return {
          ok: false,
          erreur: `Image utilisée par ${utilisee.length > 1 ? "les scènes" : "la scène"} ${liste} : supprime ou modifie d'abord ${utilisee.length > 1 ? "ces scènes" : "cette scène"}.`,
        };
      }
      base.prepare("DELETE FROM image WHERE id = ?").run(image.id);
      try {
        unlinkSync(join(DOSSIER_MEDIAS, image.fichier));
      } catch {
        // Fichier déjà absent : rien à faire.
      }
      diffuserImages(io, partieId);
      return { ok: true };
    }),
  );
}
