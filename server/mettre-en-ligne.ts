// Commande « npm run mettre-en-ligne » : publie la version actuelle sur l'hébergement.
//
// L'hébergement réutilise le dépôt GitHub el-sitio, que le serveur de l'hébergeur surveille
// (ArgoCD) : el-sitio est une copie exacte de ce dépôt. Étapes :
//   1. nouvelle version (package.json), étiquette vX.Y.Z, envoi sur GitHub (ici et el-sitio) ;
//   2. GitHub fabrique l'image Docker et l'essaie (quelques minutes) ;
//   3. si tout va bien, chart/Chart.yaml pointe vers la nouvelle image : ArgoCD l'installe.
// Ne pas lancer pendant une séance : le serveur en ligne redémarre (moins d'une minute).

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DEPOT_HEBERGEMENT = "Doomsdaycat/el-sitio";
const URL_HEBERGEMENT = `https://github.com/${DEPOT_HEBERGEMENT}.git`;
const DISTANT = "hebergement";
const ADRESSE = "https://antoine.vanyda.cloud";
/** Dernier commit de l'ancien site el-sitio, avant son remplacement par Brumeland. */
const ANCIEN_SITE = "0f42ec77017a76bb0ac63b024eac9fdbf9b97895";

function arreter(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitVisible(...args: string[]): void {
  const r = spawnSync("git", args, { stdio: "inherit" });
  if (r.status !== 0) arreter(`La commande « git ${args.join(" ")} » a échoué.`);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 0. Vérifications

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") arreter("Place-toi d'abord sur la branche main.");
if (git("status", "--porcelain") !== "") {
  arreter("Des modifications ne sont pas encore enregistrées (commit) : enregistre-les d'abord.");
}
if (spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status !== 0) {
  arreter("GitHub ne te reconnaît pas : tape « gh auth login », puis relance.");
}
if (!git("remote").split("\n").includes(DISTANT)) git("remote", "add", DISTANT, URL_HEBERGEMENT);

console.log("Vérification du code et des tests…");
for (const script of ["verifier", "tester"]) {
  if (spawnSync("npm", ["run", "-s", script], { stdio: "ignore" }).status !== 0) {
    arreter(`« npm run ${script} » signale un problème : rien n'a été publié.`);
  }
}

gitVisible("fetch", "--quiet", "--tags", DISTANT);
gitVisible("fetch", "--quiet", "origin");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main") && !estAncetre("origin/main", "HEAD")) {
  arreter("GitHub a des changements que ce PC n'a pas : tape « git pull », puis relance.");
}

function estAncetre(a: string, b: string): boolean {
  return spawnSync("git", ["merge-base", "--is-ancestor", a, b]).status === 0;
}

// ---------------------------------------------------------------------------
// 1. Nouvelle version

type Version = [number, number, number];
const lire = (v: string): Version | null => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : null;
};
const comparer = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const paquet = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const connues = [paquet.version, ...git("tag", "--list", "v*").split("\n")]
  .map(lire)
  .filter((v): v is Version => v !== null)
  .sort(comparer);
const plusHaute = connues.at(-1) ?? [0, 0, 0];
const version = `${plusHaute[0]}.${plusHaute[1] + 1}.0`;

console.log(`Publication de la version ${version}…`);
paquet.version = version;
writeFileSync("package.json", `${JSON.stringify(paquet, null, 2)}\n`);
gitVisible("commit", "--quiet", "-am", `Version ${version}`);
gitVisible("tag", `v${version}`);

// Envoi sur el-sitio : copie exacte de ce dépôt. La toute première fois, l'ancien site est
// remplacé (il reste consultable dans la branche « ancien-site »).
function envoyerHebergement(...refs: string[]): void {
  const distant = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${DISTANT}/main`], { encoding: "utf8" })
    .stdout.trim();
  if (distant && !estAncetre(`${DISTANT}/main`, "HEAD")) {
    if (distant !== ANCIEN_SITE) {
      arreter(
        `Le dépôt ${DEPOT_HEBERGEMENT} a été modifié par quelqu'un d'autre : rien n'a été écrasé.\n` +
          "Demande à Claude de regarder ce qui a changé.",
      );
    }
    gitVisible("push", "--quiet", DISTANT, `${ANCIEN_SITE}:refs/heads/ancien-site`);
    gitVisible("push", "--quiet", "--force", DISTANT, "HEAD:main", ...refs);
  } else {
    gitVisible("push", "--quiet", DISTANT, "HEAD:main", ...refs);
  }
  git("fetch", "--quiet", DISTANT);
}

gitVisible("push", "--quiet", "origin", "main", `v${version}`);
envoyerHebergement(`v${version}`);

// ---------------------------------------------------------------------------
// 2. Fabrication de l'image par GitHub

console.log("GitHub fabrique l'image (3 à 6 minutes)…");
let idTravail: string | null = null;
for (let essai = 0; essai < 60 && !idTravail; essai++) {
  await pause(5000);
  const liste = execFileSync(
    "gh",
    ["run", "list", "-R", DEPOT_HEBERGEMENT, "-w", "release.yml", "-L", "10", "--json", "databaseId,headBranch"],
    { encoding: "utf8" },
  );
  const travail = (JSON.parse(liste) as { databaseId: number; headBranch: string }[]).find(
    (t) => t.headBranch === `v${version}`,
  );
  if (travail) idTravail = String(travail.databaseId);
}
if (!idTravail) arreter("GitHub n'a pas lancé la fabrication de l'image. Demande à Claude de regarder.");
const suivi = spawnSync("gh", ["run", "watch", idTravail, "-R", DEPOT_HEBERGEMENT, "--exit-status", "-i", "15"], {
  stdio: ["ignore", "ignore", "inherit"],
});
if (suivi.status !== 0) {
  arreter(
    "La fabrication de l'image a échoué : le serveur en ligne n'a pas changé.\n" +
      `Détails : https://github.com/${DEPOT_HEBERGEMENT}/actions/runs/${idTravail}`,
  );
}

// ---------------------------------------------------------------------------
// 3. Installation par le serveur de l'hébergeur

const chart = readFileSync("chart/Chart.yaml", "utf8").replace(/^appVersion: .*$/m, `appVersion: "${version}"`);
writeFileSync("chart/Chart.yaml", chart);
gitVisible("commit", "--quiet", "-am", `Mise en ligne de la version ${version}`);
gitVisible("push", "--quiet", "origin", "main");
envoyerHebergement();

console.log(
  `\nVersion ${version} envoyée. Le serveur l'installe dans les minutes qui viennent :\n` +
    `  ${ADRESSE}\n` +
    "La partie et les liens des joueurs ne changent pas.\n",
);
