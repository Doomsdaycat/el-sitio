// Tests des jets en opposition. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  oppositionPermetDeForcer,
  resoudreOpposition,
  type EntreeJournal,
  type ResultatCompetence,
} from "../shared/jets.ts";

/** Un résultat de jet : dé gardé et valeur visée. */
function r(garde: number, valeur: number): ResultatCompetence {
  return {
    type: "competence",
    valeur,
    faveurs: 0,
    fleaux: 0,
    des: [garde],
    indexGarde: 0,
    garde,
    reussi: garde !== 20 && garde <= valeur,
    dragon: garde === 1,
    demon: garde === 20,
  };
}

describe("Opposition normale (quelqu'un agit)", () => {
  it("celui qui agit rate : il échoue, quel que soit l'adversaire", () => {
    assert.equal(resoudreOpposition(r(15, 10), r(18, 10), false), "opposant");
  });
  it("il réussit et l'adversaire rate : il l'emporte", () => {
    assert.equal(resoudreOpposition(r(8, 10), r(15, 10), false), "actif");
  });
  it("les deux réussissent : le plus petit dé l'emporte", () => {
    assert.equal(resoudreOpposition(r(4, 10), r(7, 10), false), "actif");
    assert.equal(resoudreOpposition(r(7, 10), r(4, 10), false), "opposant");
  });
  it("les deux réussissent avec le même dé : celui qui agit l'emporte", () => {
    assert.equal(resoudreOpposition(r(6, 10), r(6, 12), false), "actif");
  });
  it("démon de celui qui agit : échec", () => {
    assert.equal(resoudreOpposition(r(20, 20), r(19, 10), false), "opposant");
  });
});

describe("Opposition ouverte (bras de fer, poison…)", () => {
  it("les deux ratent : on relance", () => {
    assert.equal(resoudreOpposition(r(15, 10), r(18, 10), true), "egalite");
  });
  it("un seul réussit : il l'emporte", () => {
    assert.equal(resoudreOpposition(r(15, 10), r(3, 10), true), "opposant");
    assert.equal(resoudreOpposition(r(3, 10), r(15, 10), true), "actif");
  });
  it("les deux réussissent avec le même dé : on relance", () => {
    assert.equal(resoudreOpposition(r(6, 10), r(6, 12), true), "egalite");
  });
  it("les deux réussissent : le plus petit dé l'emporte", () => {
    assert.equal(resoudreOpposition(r(5, 10), r(2, 10), true), "opposant");
  });
});

describe("Forcer la chance en opposition", () => {
  const base = {
    id: 1,
    auteurId: 2,
    auteurNom: "Alix",
    auteurRole: "joueur" as const,
    creeLe: "",
    libelle: null,
    pourId: null,
    pourNom: null,
    secret: false,
    revele: false,
    resultat: r(15, 10),
    forceDe: null,
    etat: null,
    dejaForce: false,
    opposeA: null,
    ouverte: false,
  } satisfies EntreeJournal;
  const opposant = (ouverte: boolean): EntreeJournal => ({ ...base, id: 2, opposeA: 1, ouverte });

  it("celui qui agit peut forcer tant que l'adversaire n'a pas lancé", () => {
    assert.equal(oppositionPermetDeForcer(base, undefined), true);
  });
  it("…mais plus après le jet de l'adversaire", () => {
    assert.equal(oppositionPermetDeForcer(base, opposant(false)), false);
  });
  it("l'adversaire, qui ne fait que réagir, ne peut pas forcer", () => {
    assert.equal(oppositionPermetDeForcer(opposant(false), undefined), false);
  });
  it("en opposition ouverte, chacun peut forcer", () => {
    assert.equal(oppositionPermetDeForcer(base, opposant(true)), true);
    assert.equal(oppositionPermetDeForcer(opposant(true), undefined), true);
  });
});
