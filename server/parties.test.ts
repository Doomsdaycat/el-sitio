// Plusieurs parties sur un même serveur : rien ne doit passer d'une partie à l'autre.
// Ce test lance un vrai serveur (port libre, base temporaire) avec deux parties.
// Lancer : npm run tester

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { io as connecter, type Socket } from "socket.io-client";
import { DatabaseSync } from "node:sqlite";
import { unzipSync } from "fflate";
import type { Invitation, PartieMj } from "../shared/messages.ts";

const dossier = mkdtempSync(join(tmpdir(), "brumeland-parties-"));
process.env.BRUMELAND_BASE = join(dossier, "brumeland.db");

interface Jetons {
  mj1: string;
  joueur1: string;
  mj2: string;
  joueur2: string;
}

let serveur: ChildProcess;
let port = 0;
let jetons: Jetons;
const ouverts: Socket[] = [];

function portLibre(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer().listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

/** Prépare deux parties, chacune avec son MJ et un joueur, directement dans la base. */
async function preparer(): Promise<Jetons> {
  const { base } = await import("./base.ts");
  const { creerInvitation, jetonMj, partiePrincipale } = await import("./partie.ts");
  const { nouveauJeton } = await import("./jetons.ts");
  const p1 = partiePrincipale();
  const { id: p2 } = base
    .prepare("INSERT INTO partie (nom, cree_le) VALUES ('Partie de test', ?) RETURNING id")
    .get(new Date().toISOString()) as { id: number };
  base
    .prepare("INSERT INTO participant (partie_id, role, jeton, nom, cree_le) VALUES (?, 'mj', ?, 'Meneur de jeu', ?)")
    .run(p2, nouveauJeton(), new Date().toISOString());
  const jetonJoueur = (partieId: number) => {
    const id = creerInvitation(partieId, null);
    return (base.prepare("SELECT jeton FROM participant WHERE id = ?").get(id) as { jeton: string }).jeton;
  };
  // Une image utilisée par une scène de la partie principale.
  base
    .prepare("INSERT INTO image (id, nom, fichier, type, taille, cree_le) VALUES (?, 'Carte', ?, 'image/png', 1, ?)")
    .run("a".repeat(32), `${"a".repeat(32)}.png`, new Date().toISOString());
  base
    .prepare("INSERT INTO scene (id, partie_id, nom, type, image_id, cree_le) VALUES ('s1', ?, 'Taverne', 'illustration', ?, ?)")
    .run(p1.id, "a".repeat(32), new Date().toISOString());
  const j: Jetons = { mj1: jetonMj(p1.id), joueur1: jetonJoueur(p1.id), mj2: jetonMj(p2), joueur2: jetonJoueur(p2) };
  base.close();
  return j;
}

function lancerServeur(): Promise<void> {
  return new Promise((ok, echec) => {
    serveur = spawn(process.execPath, ["--import", "tsx", "--disable-warning=ExperimentalWarning", "server/index.ts"], {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let sortie = "";
    serveur.stdout!.on("data", (d) => {
      sortie += d;
      if (sortie.includes("démarré")) ok();
    });
    serveur.stderr!.on("data", (d) => (sortie += d));
    serveur.on("exit", (code) => echec(new Error(`Serveur arrêté (${code}) :\n${sortie}`)));
  });
}

/** Ouvre une connexion et note tout ce qu'elle reçoit. */
async function ouvrir(jeton: string) {
  const recu: { evenement: string; donnees: unknown }[] = [];
  const socket = connecter(`http://localhost:${port}`, { auth: { jeton }, reconnection: false, forceNew: true });
  ouverts.push(socket);
  socket.onAny((evenement, donnees) => recu.push({ evenement, donnees }));
  await new Promise<void>((ok, echec) => {
    socket.on("bienvenue", () => ok());
    socket.on("connect_error", echec);
  });
  return { socket, recu };
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

function demander<R>(socket: Socket, evenement: string, donnees: unknown): Promise<R> {
  return new Promise((ok) => socket.emit(evenement, donnees, ok));
}

describe("plusieurs parties sur un même serveur", () => {
  before(async () => {
    port = await portLibre();
    jetons = await preparer();
    await lancerServeur();
  });

  after(() => {
    for (const s of ouverts) s.close();
    serveur?.removeAllListeners("exit");
    serveur?.kill();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("chacun arrive dans sa partie et ne voit que ses présents", async () => {
    const mj1 = await ouvrir(jetons.mj1);
    const j2 = await ouvrir(jetons.joueur2);
    const bienvenue2 = j2.recu.find((r) => r.evenement === "bienvenue")!.donnees as { partie: { nom: string } };
    assert.equal(bienvenue2.partie.nom, "Partie de test");
    await demander(j2.socket, "joueur:choisirNom", { nom: "Prout" });
    await attendre(200);
    const presents = mj1.recu.filter((r) => r.evenement === "presents").at(-1)!.donnees as { nom: string | null }[];
    assert.ok(!presents.some((p) => p.nom === "Prout"), "un joueur de l'autre partie apparaît chez le MJ");
    assert.ok(!mj1.recu.some((r) => r.evenement === "fiche"), "une fiche de l'autre partie est arrivée");
  });

  it("un jet d'une partie n'arrive pas dans l'autre", async () => {
    const j1 = await ouvrir(jetons.joueur1);
    const mj2 = await ouvrir(jetons.mj2);
    const reponse = await demander<{ ok: boolean }>(mj2.socket, "jet:competence", {
      libelle: "Discrétion",
      valeur: 10,
      faveurs: 0,
      fleaux: 0,
      secret: false,
    });
    assert.equal(reponse.ok, true);
    await attendre(200);
    assert.ok(mj2.recu.some((r) => r.evenement === "journal:entree"));
    assert.ok(!j1.recu.some((r) => r.evenement === "journal:entree"), "le jet est arrivé dans l'autre partie");
  });

  it("la bibliothèque est commune, une image utilisée ailleurs ne se supprime pas", async () => {
    const mj2 = await ouvrir(jetons.mj2);
    const images = mj2.recu.find((r) => r.evenement === "images")!.donnees as { id: string; scenes: string[] }[];
    assert.equal(images.length, 1);
    assert.deepEqual(images[0].scenes, ["Taverne (partie « Brumeland »)"]);
    const reponse = await demander<{ ok: boolean; erreur?: string }>(mj2.socket, "mj:supprimerImage", { id: images[0].id });
    assert.equal(reponse.ok, false);
    assert.match(reponse.erreur ?? "", /Taverne/);
  });

  it("le menu des parties : la principale en tête, chacun voit laquelle est ouverte", async () => {
    const mj2 = await ouvrir(jetons.mj2);
    const parties = mj2.recu.findLast((r) => r.evenement === "parties")!.donnees as PartieMj[];
    assert.deepEqual(
      parties.map((p) => [p.nom, p.principale, p.actuelle]),
      [
        ["Brumeland", true, false],
        ["Partie de test", false, true],
      ],
    );
    assert.match(parties[0].lien, new RegExp(`/jeu/${jetons.mj1}$`));
    const j1 = await ouvrir(jetons.joueur1);
    assert.ok(!j1.recu.some((r) => r.evenement === "parties"), "un joueur reçoit la liste des parties");
  });

  it("un joueur ne peut ni créer ni supprimer de partie", async () => {
    const j1 = await ouvrir(jetons.joueur1);
    const creation = await demander<{ ok: boolean }>(j1.socket, "mj:creerPartie", { nom: "Pirate" });
    assert.equal(creation.ok, false);
    const suppression = await demander<{ ok: boolean }>(j1.socket, "mj:supprimerPartie", { id: 2 });
    assert.equal(suppression.ok, false);
  });

  it("créer, renommer, supprimer une partie", async () => {
    const mj1 = await ouvrir(jetons.mj1);
    assert.equal((await demander<{ ok: boolean }>(mj1.socket, "mj:creerPartie", { nom: "  " })).ok, false);
    const doublon = await demander<{ ok: boolean; erreur?: string }>(mj1.socket, "mj:creerPartie", { nom: "brumeland" });
    assert.equal(doublon.ok, false);
    const creation = await demander<{ ok: boolean; id?: string }>(mj1.socket, "mj:creerPartie", { nom: "Essai" });
    assert.equal(creation.ok, true);
    const parties = mj1.recu.findLast((r) => r.evenement === "parties")!.donnees as PartieMj[];
    const essai = parties.find((p) => p.nom === "Essai")!;
    assert.equal(String(essai.id), creation.id);

    // On entre dans la nouvelle partie par son lien MJ : elle est vide.
    const jetonEssai = new URL(essai.lien).pathname.split("/").at(-1)!;
    const mjEssai = await ouvrir(jetonEssai);
    assert.equal((mjEssai.recu.find((r) => r.evenement === "scenes")!.donnees as unknown[]).length, 0);
    assert.equal((mjEssai.recu.find((r) => r.evenement === "invitations")!.donnees as unknown[]).length, 0);

    // Renommer : ceux qui sont dans la partie voient le nouveau nom.
    const renommage = await demander<{ ok: boolean }>(mj1.socket, "mj:renommerPartie", { id: essai.id, nom: "Essai 2" });
    assert.equal(renommage.ok, true);
    await attendre(200);
    assert.ok(mjEssai.recu.some((r) => r.evenement === "partie:nom" && r.donnees === "Essai 2"));
    assert.ok(!mj1.recu.some((r) => r.evenement === "partie:nom"));

    // On ne supprime pas la partie qu'on a ouverte.
    const refus = await demander<{ ok: boolean }>(mjEssai.socket, "mj:supprimerPartie", { id: essai.id });
    assert.equal(refus.ok, false);

    // Suppression depuis une autre partie : sauvegarde d'abord, ceux qui y étaient en sortent.
    const suppression = await demander<{ ok: boolean }>(mj1.socket, "mj:supprimerPartie", { id: essai.id });
    assert.equal(suppression.ok, true);
    await attendre(200);
    assert.ok(mjEssai.recu.some((r) => r.evenement === "exclu"));
    assert.ok(readdirSync(join(dossier, "sauvegardes")).some((f) => f.endsWith("_avant-suppression.db")));
    const apres = mj1.recu.findLast((r) => r.evenement === "parties")!.donnees as PartieMj[];
    assert.ok(!apres.some((p) => p.id === essai.id));
    await assert.rejects(ouvrir(jetonEssai), /lien-inconnu/);
  });

  it("le MJ d'une partie ne voit pas les scènes de l'autre", async () => {
    const mj2 = await ouvrir(jetons.mj2);
    const scenes = mj2.recu.find((r) => r.evenement === "scenes")!.donnees as unknown[];
    assert.equal(scenes.length, 0);
    const mj1 = await ouvrir(jetons.mj1);
    assert.equal((mj1.recu.find((r) => r.evenement === "scenes")!.donnees as unknown[]).length, 1);
  });

  it("dupliquer : copie complète, avec de nouveaux liens", async () => {
    const mj2 = await ouvrir(jetons.mj2);
    const reponse = await demander<{ ok: boolean; id?: string }>(mj2.socket, "mj:dupliquerPartie", { id: 2 });
    assert.equal(reponse.ok, true);
    const parties = mj2.recu.findLast((r) => r.evenement === "parties")!.donnees as PartieMj[];
    const copie = parties.find((p) => String(p.id) === reponse.id)!;
    assert.equal(copie.nom, "Partie de test (copie)");
    assert.notEqual(copie.lien, parties.find((p) => p.id === 2)!.lien);

    const mjCopie = await ouvrir(new URL(copie.lien).pathname.split("/").at(-1)!);
    const invitations = mjCopie.recu.find((r) => r.evenement === "invitations")!.donnees as Invitation[];
    assert.deepEqual(invitations.map((i) => i.nom), ["Prout"]);
    assert.ok(!invitations[0].lien.endsWith(jetons.joueur2), "la copie garde le lien du joueur");
    assert.equal((mjCopie.recu.find((r) => r.evenement === "fiches")!.donnees as unknown[]).length, 1);
    assert.equal((mjCopie.recu.find((r) => r.evenement === "journal")!.donnees as unknown[]).length, 1);
    // L'original n'a pas bougé.
    const original = await ouvrir(jetons.mj2);
    assert.equal((original.recu.find((r) => r.evenement === "journal")!.donnees as unknown[]).length, 1);
  });

  it("exporter une partie seule, puis l'importer comme nouvelle partie", async () => {
    const reponse = await fetch(`http://localhost:${port}/api/export`, { headers: { "X-Brumeland-Jeton": jetons.mj1 } });
    assert.equal(reponse.status, 200);
    assert.match(reponse.headers.get("content-disposition") ?? "", /brumeland-brumeland-/);
    const zip = new Uint8Array(await reponse.arrayBuffer());
    const fichierBase = join(dossier, "export-lu.db");
    writeFileSync(fichierBase, unzipSync(zip)["brumeland.db"]);
    const lue = new DatabaseSync(fichierBase, { readOnly: true });
    const partiesExport = lue.prepare("SELECT nom FROM partie").all() as { nom: string }[];
    const mjExport = lue.prepare("SELECT jeton FROM participant WHERE role = 'mj'").all() as { jeton: string }[];
    const scenesExport = lue.prepare("SELECT nom FROM scene").all() as { nom: string }[];
    lue.close();
    assert.deepEqual(partiesExport.map((p) => p.nom), ["Brumeland"]);
    assert.deepEqual(mjExport.map((p) => p.jeton), [jetons.mj1], "l'export garde le lien MJ");
    assert.deepEqual(scenesExport.map((p) => p.nom), ["Taverne"]);

    // Un joueur ne peut pas importer.
    const refus = await fetch(`http://localhost:${port}/api/import`, {
      method: "POST",
      body: zip,
      headers: { "X-Brumeland-Jeton": jetons.joueur1 },
    });
    assert.equal(refus.status, 403);

    // Réimport sur le même serveur : partie ajoutée, liens changés (déjà utilisés ici).
    const imp = await fetch(`http://localhost:${port}/api/import`, {
      method: "POST",
      body: zip,
      headers: { "X-Brumeland-Jeton": jetons.mj2 },
    });
    const corps = (await imp.json()) as { ok: boolean; ajoutees: { nom: string; liensGardes: boolean }[] };
    assert.deepEqual(corps, { ok: true, ajoutees: [{ nom: "Brumeland (importée)", liensGardes: false }] });
    const mj1 = await ouvrir(jetons.mj1);
    const parties = mj1.recu.findLast((r) => r.evenement === "parties")!.donnees as PartieMj[];
    const importee = parties.find((p) => p.nom === "Brumeland (importée)")!;
    const mjImporte = await ouvrir(new URL(importee.lien).pathname.split("/").at(-1)!);
    const scenes = mjImporte.recu.find((r) => r.evenement === "scenes")!.donnees as { nom: string }[];
    assert.deepEqual(scenes.map((x) => x.nom), ["Taverne"]);
  });

  it("exporter tout le serveur", async () => {
    const reponse = await fetch(`http://localhost:${port}/api/export?tout=1`, { headers: { "X-Brumeland-Jeton": jetons.mj2 } });
    const zip = new Uint8Array(await reponse.arrayBuffer());
    const fichierBase = join(dossier, "export-tout.db");
    writeFileSync(fichierBase, unzipSync(zip)["brumeland.db"]);
    const lue = new DatabaseSync(fichierBase, { readOnly: true });
    const { n } = lue.prepare("SELECT count(*) AS n FROM partie").get() as { n: number };
    lue.close();
    assert.equal(n, 4);
  });
});
