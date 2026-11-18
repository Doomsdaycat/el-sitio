// Tests des règles de combat. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attendre,
  carteCourante,
  cartesDe,
  cartesPourAttendre,
  choisirCarteSurprise,
  combatVide,
  deplacementRestant,
  ErreurCombat,
  reagir,
  retournerCarte,
  surpriseEnAttente,
  tirerInitiative,
  vueCombatJoueurs,
  type Combat,
  type Combattant,
} from "../shared/combat.ts";

/** Pas de mélange : les cartes sortent dans l'ordre 1, 2, 3… (hasard(n) = n − 1). */
const sansMelange = (n: number) => n - 1;
const hasardReel = (n: number) => Math.floor(Math.random() * n);

function combattant(id: string, extra: Partial<Combattant> = {}): Combattant {
  return { id, type: "pj", joueurId: null, pionId: null, nom: id, nbCartes: 1, ps: null, surprise: false, ...extra };
}

function avec(...liste: Combattant[]): Combat {
  return { ...combatVide(), combattants: liste };
}

describe("Tirer l'initiative", () => {
  it("chacun reçoit des cartes différentes entre 1 et 10", () => {
    for (let essai = 0; essai < 50; essai++) {
      const c = tirerInitiative(avec(combattant("a"), combattant("b"), combattant("m", { nbCartes: 3 })), hasardReel);
      const valeurs = c.cartes.map((x) => x.valeur);
      assert.equal(new Set(valeurs).size, 5);
      assert.ok(valeurs.every((v) => v >= 1 && v <= 10));
      assert.equal(cartesDe(c, "m").length, 3);
    }
  });

  it("round 1, phase round, déplacements remis à zéro pour les PJ", () => {
    const c = tirerInitiative(avec(combattant("a"), combattant("g", { type: "pnj" })), sansMelange);
    assert.equal(c.round, 1);
    assert.equal(c.phase, "round");
    assert.deepEqual(c.mouvements, { a: { parcouru: 0, course: false, reaction: false } });
  });

  it("plus de 10 cartes : refusé avec un conseil", () => {
    assert.throws(() => tirerInitiative(avec(combattant("m", { nbCartes: 5 }), combattant("n", { nbCartes: 5 }), combattant("a")), sansMelange), /regroupe/);
  });

  it("aucun participant : refusé", () => {
    assert.throws(() => tirerInitiative(combatVide(), sansMelange), ErreurCombat);
  });

  it("c'est au plus petit numéro de jouer", () => {
    const c = tirerInitiative(avec(combattant("a"), combattant("b")), sansMelange);
    const premiere = carteCourante(c)!;
    assert.equal(premiere.valeur, Math.min(...c.cartes.map((x) => x.valeur)));
    const ensuite = carteCourante(retournerCarte(c, premiere.valeur))!;
    assert.ok(ensuite.valeur > premiere.valeur);
    assert.equal(carteCourante(retournerCarte(retournerCarte(c, premiere.valeur), ensuite.valeur)), null);
  });
});

describe("Surprise", () => {
  it("les attaquants qui surprennent gardent la carte choisie, les autres tirent le reste", () => {
    let c: Combat = { ...avec(combattant("a", { surprise: true }), combattant("b")), phase: "surprise" };
    assert.equal(surpriseEnAttente(c).length, 1);
    c = choisirCarteSurprise(c, "a", 1);
    assert.equal(surpriseEnAttente(c).length, 0);
    for (let essai = 0; essai < 20; essai++) {
      const t = tirerInitiative(c, hasardReel, c.choixSurprise);
      assert.equal(cartesDe(t, "a")[0].valeur, 1);
      assert.notEqual(cartesDe(t, "b")[0].valeur, 1);
    }
  });

  it("carte déjà prise, ou participant qui ne surprend pas : refusé", () => {
    let c: Combat = { ...avec(combattant("a", { surprise: true }), combattant("b", { surprise: true }), combattant("z")), phase: "surprise" };
    c = choisirCarteSurprise(c, "a", 3);
    assert.throws(() => choisirCarteSurprise(c, "b", 3), /déjà prise/);
    assert.throws(() => choisirCarteSurprise(c, "z", 4), ErreurCombat);
  });
});

describe("Attendre (règle optionnelle)", () => {
  /** a = 1, b = 2, c = 3, d = 4 */
  const base = () => tirerInitiative(avec(combattant("a"), combattant("b"), combattant("c"), combattant("d")), sansMelange);

  it("échanger avec une carte plus tardive : l'autre joue maintenant", () => {
    const c = attendre(base(), 3);
    assert.equal(cartesDe(c, "a")[0].valeur, 3);
    assert.equal(cartesDe(c, "c")[0].valeur, 1);
    assert.equal(carteCourante(c)!.combattantId, "c");
  });

  it("pas avec une carte déjà jouée, ni déjà obtenue en attendant", () => {
    let c = attendre(base(), 3); // a prend la 3, c joue en 1
    c = retournerCarte(c, 1); // c a joué ; tour de b (2)
    assert.deepEqual(cartesPourAttendre(c).map((x) => x.valeur), [4]); // pas la 3 (attendue)
    assert.throws(() => attendre(c, 3), ErreurCombat);
    assert.throws(() => attendre(c, 1), ErreurCombat);
  });
});

describe("Réaction et déplacement", () => {
  it("réagir retourne la carte et coupe le déplacement du round", () => {
    let c = tirerInitiative(avec(combattant("a"), combattant("b")), sansMelange);
    c = reagir(c, "b");
    assert.equal(cartesDe(c, "b")[0].jouee, true);
    assert.equal(deplacementRestant(c.mouvements.b, 10), 0);
    assert.throws(() => reagir(c, "b"), /déjà utilisée/);
  });

  it("déplacement restant : parcouru, puis course (×2)", () => {
    assert.equal(deplacementRestant({ parcouru: 4, course: false, reaction: false }, 10), 6);
    assert.equal(deplacementRestant({ parcouru: 14, course: true, reaction: false }, 10), 6);
    assert.equal(deplacementRestant({ parcouru: 12, course: false, reaction: false }, 10), 0);
    assert.equal(deplacementRestant(undefined, 10), null);
  });
});

describe("Ce que voient les joueurs", () => {
  it("ni les PS des PNJ, ni le nom d'un PNJ dont le pion est caché", () => {
    const c = avec(
      combattant("g", { type: "pnj", nom: "Gobelin", ps: { actuels: 3, max: 7 }, pionId: "p1" }),
      combattant("chef", { type: "pnj", nom: "Chef bandit", pionId: "p2" }),
    );
    const vue = vueCombatJoueurs(c, new Set(["p2"]))!;
    assert.equal(vue.combattants[0].ps, null);
    assert.equal(vue.combattants[0].nom, "Gobelin");
    assert.equal(vue.combattants[1].nom, "???");
  });
});
