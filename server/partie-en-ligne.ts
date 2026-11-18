// Commande « npm run partie » : ouvre le tunnel Cloudflare et lance le serveur,
// pour que les joueurs puissent rejoindre la partie depuis chez eux.
//
// Le tunnel « rapide » de Cloudflare est gratuit et sans compte, mais son adresse
// change à chaque lancement : les liens des joueurs changent donc aussi.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const CLOUDFLARED = process.env.BRUMELAND_CLOUDFLARED ?? "cloudflared";
const JOURNAL_TUNNEL = resolve("data/tunnel.log");
const DELAI_MAX_MS = 45_000;
const ADRESSE_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function arreterAvecMessage(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// 1. cloudflared est-il installé ?
const verification = spawnSync(CLOUDFLARED, ["--version"], { encoding: "utf8" });
if (verification.error) {
  arreterAvecMessage(
    "Le programme « cloudflared » est introuvable.\n" +
      "Installe-le une fois pour toutes avec la commande indiquée dans le README\n" +
      "(section « Jouer avec des amis à distance »), puis relance : npm run partie",
  );
}

mkdirSync("data", { recursive: true });
const journal = createWriteStream(JOURNAL_TUNNEL, { flags: "w" });

let tunnel: ChildProcess | null = null;
let serveur: ChildProcess | null = null;
let arretEnCours = false;

/** Arrête proprement le tunnel et le serveur. */
function toutArreter(code: number): void {
  if (arretEnCours) return;
  arretEnCours = true;
  serveur?.kill("SIGTERM");
  tunnel?.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => {
  console.log("\nArrêt de la partie…");
  toutArreter(0);
});
process.on("SIGTERM", () => toutArreter(0));

// 2. Ouverture du tunnel. Cloudflare donne une adresse publique en https.
console.log("Ouverture du tunnel Cloudflare (10 à 20 secondes)…");
tunnel = spawn(
  CLOUDFLARED,
  ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const delai = setTimeout(() => {
  console.error(
    `\nLe tunnel n'a pas répondu en ${DELAI_MAX_MS / 1000} secondes.\n` +
      `Vérifie ta connexion Internet, puis relance. Détails dans ${JOURNAL_TUNNEL}`,
  );
  toutArreter(1);
}, DELAI_MAX_MS);

let adresse: string | null = null;
let reste = "";

function lireSortieTunnel(morceau: Buffer): void {
  journal.write(morceau);
  if (adresse) return;
  reste += morceau.toString("utf8");
  const trouve = reste.match(ADRESSE_TUNNEL);
  if (trouve) {
    adresse = trouve[0];
    clearTimeout(delai);
    lancerServeur(adresse);
  } else {
    reste = reste.slice(-500);
  }
}

tunnel.stdout?.on("data", lireSortieTunnel);
tunnel.stderr?.on("data", lireSortieTunnel);
tunnel.on("exit", (code) => {
  if (arretEnCours) return;
  console.error(`\nLe tunnel s'est arrêté (code ${code}). Détails dans ${JOURNAL_TUNNEL}`);
  toutArreter(1);
});

// 3. Le serveur démarre une fois l'adresse publique connue : ses liens l'utilisent.
let premierLancement = true;
function lancerServeur(adressePublique: string): void {
  if (premierLancement) console.log(`Tunnel ouvert : ${adressePublique}`);
  serveur = spawn(
    process.execPath,
    ["--import", "tsx", "--disable-warning=ExperimentalWarning", "server/index.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", BRUMELAND_ADRESSE: adressePublique },
    },
  );
  const lancement = premierLancement;
  premierLancement = false;
  serveur.on("exit", (code) => {
    if (arretEnCours) return;
    // Après l'import d'une partie, le serveur demande à être relancé (code 75).
    if (code === 75) {
      lancerServeur(adressePublique);
      return;
    }
    toutArreter(code ?? 1);
  });
  if (lancement) setTimeout(() => {
    if (arretEnCours) return;
    console.log(
      "Attention : l'adresse du tunnel change à chaque lancement.\n" +
        "Renvoie les liens des joueurs (bouton « Copier » sur ton écran MJ) à chaque séance.\n" +
        "Si un lien ne s'ouvre pas tout de suite, attends une minute : le tunnel finit de s'activer.\n",
    );
  }, 1500);
}
