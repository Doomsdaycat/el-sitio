// Tests des distances et de la grille. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { caseSous, coinCase, distanceCases, distanceMetres, normaliserDecalage } from "../shared/carte.ts";

describe("Distances sur la grille (1 case = 2 m, diagonale = 2 m)", () => {
  it("tout droit", () => {
    assert.equal(distanceMetres({ col: 0, lig: 0 }, { col: 5, lig: 0 }), 10);
  });
  it("en diagonale : 3 cases = 6 m", () => {
    assert.equal(distanceMetres({ col: 2, lig: 2 }, { col: 5, lig: 5 }), 6);
  });
  it("mélange : la plus grande des deux distances", () => {
    assert.equal(distanceCases({ col: 0, lig: 0 }, { col: 4, lig: 2 }), 4);
  });
  it("case adjacente en diagonale : à 2 m (corps à corps possible)", () => {
    assert.equal(distanceMetres({ col: 3, lig: 3 }, { col: 4, lig: 4 }), 2);
  });
  it("même case : 0 m", () => {
    assert.equal(distanceMetres({ col: 1, lig: 1 }, { col: 1, lig: 1 }), 0);
  });
});

describe("Grille posée sur l'image", () => {
  const g = { taille: 50, decalageX: 10, decalageY: 20, visible: true };
  it("point → case, en tenant compte du décalage", () => {
    assert.deepEqual(caseSous(10, 20, g), { col: 0, lig: 0 });
    assert.deepEqual(caseSous(59, 69, g), { col: 0, lig: 0 });
    assert.deepEqual(caseSous(60, 70, g), { col: 1, lig: 1 });
    assert.deepEqual(caseSous(5, 5, g), { col: -1, lig: -1 });
  });
  it("case → coin", () => {
    assert.deepEqual(coinCase({ col: 2, lig: 3 }, g), { x: 110, y: 170 });
  });
  it("décalage ramené entre 0 et la taille d'une case", () => {
    assert.equal(normaliserDecalage(75, 50), 25);
    assert.equal(normaliserDecalage(-10, 50), 40);
  });
});
