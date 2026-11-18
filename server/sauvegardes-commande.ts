// Commandes « npm run sauvegardes » (liste) et « npm run restaurer -- <numéro | fichier.zip> ».
// La restauration se fait serveur arrêté ; l'état actuel est d'abord sauvegardé.
// Ce script n'importe pas base.ts : il ne doit pas ouvrir (ni mettre à jour) la base au démarrage.

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { FICHIER_PID } from "./chemins.ts";
import { ErreurRestauration, finirRestauration, lireBase, remplacerBase, restaurerExport } from "./restauration.ts";
import { listerSauvegardes, type Sauvegarde } from "./sauvegardes.ts";

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

/** Message final après une restauration. */
function terminer(bilan: { nomPartie: string; manquants: string[]; ancienneMiseDeCote: boolean }): void {
  console.log(`\nPartie « ${bilan.nomPartie} » restaurée.`);
  if (bilan.manquants.length > 0) {
    console.log(`Attention : ${bilan.manquants.length} image(s) introuvable(s) ; les scènes qui les utilisent seront vides.`);
  }
  if (bilan.ancienneMiseDeCote) {
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
    const { nomPartie } = lireBase(copie);
    console.log(`\nRestauration de la sauvegarde du ${dateLisible(choisie.date)}…`);
    const ancienneMiseDeCote = remplacerBase(copie);
    terminer({ nomPartie, manquants: finirRestauration(), ancienneMiseDeCote });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

function restaurerZip(chemin: string): void {
  if (!existsSync(chemin)) arreter(`Fichier introuvable : ${chemin}`);
  console.log(`\nRestauration de l'export ${basename(chemin)}…`);
  const bilan = restaurerExport(readFileSync(chemin));
  console.log(`${bilan.images} image(s) remise(s) en place.`);
  terminer(bilan);
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
  try {
    if (/^\d+$/.test(argument)) restaurerNumero(Number(argument));
    else if (argument.toLowerCase().endsWith(".zip")) restaurerZip(resolve(argument));
    else arreter("Indique un numéro de la liste (npm run sauvegardes) ou un fichier .zip d'export.");
  } catch (erreur) {
    if (erreur instanceof ErreurRestauration) arreter(erreur.message);
    throw erreur;
  }
} else {
  arreter("Utilisation : npm run sauvegardes, ou npm run restaurer -- <numéro | fichier.zip>");
}
