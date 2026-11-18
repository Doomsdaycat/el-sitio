// Commandes « npm run sauvegardes » (liste) et « npm run restaurer -- <numéro | fichier.zip> ».
// La restauration se fait serveur arrêté ; l'état actuel est d'abord sauvegardé.
// Ce script n'importe pas base.ts : il ne doit pas ouvrir (ni mettre à jour) la base au démarrage.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { unzipSync } from "fflate";
import { CHEMIN_BASE, DOSSIER_DONNEES, DOSSIER_MEDIAS, FICHIER_PID, NOM_FICHIER_IMAGE } from "./chemins.ts";
import { listerSauvegardes, ressortirImages, sauvegarder, type Sauvegarde } from "./sauvegardes.ts";

const deux = (n: number) => String(n).padStart(2, "0");
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function dateLisible(d: Date): string {
  return `${JOURS[d.getDay()]} ${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
}

function arreter(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Le serveur tourne-t-il sur ces données ? (fichier serveur.pid d'un processus encore vivant) */
function serveurEnMarche(): boolean {
  if (!existsSync(FICHIER_PID)) return false;
  const pid = Number(readFileSync(FICHIER_PID, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false; // Processus disparu (arrêt brutal) : le fichier est périmé.
  }
  try {
    // Numéro repris par un autre programme ?
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("index.ts");
  } catch {
    return true;
  }
}

/** Vérifie qu'un fichier est bien une base Brumeland lisible. Renvoie le nom de la partie. */
function verifierBase(chemin: string): string {
  try {
    const db = new DatabaseSync(chemin, { readOnly: true });
    try {
      const partie = db.prepare("SELECT nom FROM partie ORDER BY id LIMIT 1").get() as { nom: string } | undefined;
      return partie?.nom ?? "(sans nom)";
    } finally {
      db.close();
    }
  } catch {
    arreter("Ce fichier n'est pas une sauvegarde Brumeland lisible : rien n'a été modifié.");
  }
}

function afficherListe(liste: Sauvegarde[]): void {
  if (liste.length === 0) {
    console.log("\nAucune sauvegarde pour l'instant. Le serveur en prend une à chaque démarrage.\n");
    return;
  }
  console.log("\nSauvegardes de la partie (la plus récente en premier) :\n");
  liste.forEach((s, i) => {
    const motif = s.motif ? `  (${s.motif})` : "";
    console.log(`  ${String(i + 1).padStart(2)}.  ${dateLisible(s.date)}${motif}`);
  });
  console.log("\nPour revenir à l'une d'elles, arrête le serveur puis tape par exemple :\n");
  console.log("  npm run restaurer -- 2\n");
}

/** Remplace la base de la partie par celle du chemin donné (déjà vérifiée). Renvoie vrai si l'ancienne a été mise de côté. */
function remplacerBase(source: string): boolean {
  const ancienne = existsSync(CHEMIN_BASE);
  // L'état actuel d'abord, pour pouvoir revenir en arrière.
  if (ancienne) {
    const actuelle = new DatabaseSync(CHEMIN_BASE);
    try {
      sauvegarder(actuelle, "avant-restauration");
    } finally {
      actuelle.close(); // range aussi le journal d'écritures en attente (fichier -wal)
    }
  }
  mkdirSync(DOSSIER_DONNEES, { recursive: true });
  copyFileSync(source, CHEMIN_BASE);
  // D'éventuels restes de l'ancienne base ne doivent pas s'appliquer à la nouvelle.
  rmSync(`${CHEMIN_BASE}-wal`, { force: true });
  rmSync(`${CHEMIN_BASE}-shm`, { force: true });
  return ancienne;
}

/** Après restauration : images ressorties de la corbeille, message final. */
function terminer(nomPartie: string, ancienneMiseDeCote: boolean): void {
  const db = new DatabaseSync(CHEMIN_BASE);
  let manquants: string[];
  try {
    manquants = ressortirImages(db);
  } finally {
    db.close();
  }
  console.log(`\nPartie « ${nomPartie} » restaurée.`);
  if (manquants.length > 0) {
    console.log(`Attention : ${manquants.length} image(s) introuvable(s) ; les scènes qui les utilisent seront vides.`);
  }
  if (ancienneMiseDeCote) {
    console.log("L'état d'avant a été mis de côté : « npm run sauvegardes » le montre en tête de liste.");
  }
  console.log("Tu peux relancer la partie (npm run partie).\n");
}

function restaurerNumero(numero: number): void {
  const liste = listerSauvegardes();
  const choisie = liste[numero - 1];
  if (!choisie) {
    afficherListe(liste);
    arreter(`Il n'y a pas de sauvegarde n° ${numero}.`);
  }
  // Copie à part : la sauvegarde « avant restauration » peut faire sortir la plus ancienne de la liste.
  const dossier = mkdtempSync(join(tmpdir(), "brumeland-restauration-"));
  try {
    const copie = join(dossier, "brumeland.db");
    copyFileSync(choisie.chemin, copie);
    const nom = verifierBase(copie);
    console.log(`\nRestauration de la sauvegarde du ${dateLisible(choisie.date)}…`);
    terminer(nom, remplacerBase(copie));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

function restaurerZip(chemin: string): void {
  if (!existsSync(chemin)) arreter(`Fichier introuvable : ${chemin}`);
  let contenu: Record<string, Uint8Array>;
  try {
    contenu = unzipSync(readFileSync(chemin));
  } catch {
    arreter("Ce fichier .zip est illisible : rien n'a été modifié.");
  }
  const octetsBase = contenu["brumeland.db"];
  if (!octetsBase) arreter("Ce fichier .zip n'est pas un export Brumeland (pas de brumeland.db) : rien n'a été modifié.");
  const dossier = mkdtempSync(join(tmpdir(), "brumeland-restauration-"));
  try {
    const copie = join(dossier, "brumeland.db");
    writeFileSync(copie, octetsBase);
    const nom = verifierBase(copie);
    console.log(`\nRestauration de l'export ${basename(chemin)}…`);
    const ancienne = remplacerBase(copie);
    // Images : seulement les noms attendus, rangées dans data/medias/ (jamais ailleurs).
    mkdirSync(DOSSIER_MEDIAS, { recursive: true });
    let images = 0;
    for (const [nomFichier, octets] of Object.entries(contenu)) {
      const m = /^medias\/([^/]+)$/.exec(nomFichier);
      if (!m || !NOM_FICHIER_IMAGE.test(m[1])) continue;
      writeFileSync(join(DOSSIER_MEDIAS, m[1]), octets);
      images++;
    }
    console.log(`${images} image(s) remise(s) en place.`);
    terminer(nom, ancienne);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

const [commande, argument] = process.argv.slice(2);

if (commande === "liste") {
  afficherListe(listerSauvegardes());
} else if (commande === "restaurer") {
  if (!argument) {
    afficherListe(listerSauvegardes());
    arreter("Indique le numéro de la sauvegarde (ou le fichier .zip d'un export), par exemple : npm run restaurer -- 2");
  }
  if (serveurEnMarche()) {
    arreter(
      "Le serveur Brumeland est en marche : arrête-le d'abord (Ctrl + C dans son terminal), puis relance cette commande.",
    );
  }
  if (/^\d+$/.test(argument)) restaurerNumero(Number(argument));
  else if (argument.toLowerCase().endsWith(".zip")) restaurerZip(resolve(argument));
  else arreter("Indique un numéro de la liste (npm run sauvegardes) ou un fichier .zip d'export.");
} else {
  arreter("Utilisation : npm run sauvegardes, ou npm run restaurer -- <numéro | fichier.zip>");
}
