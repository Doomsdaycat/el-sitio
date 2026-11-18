// Tests du brouillard de guerre. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ajouterTraits, casesDuPion, casesDuRectangle, modifierBrouillard, visibleDansBrouillard } from "../shared/brouillard.ts";

describe("Brouillard de guerre", () => {
  it("rectangle tracé dans n'importe quel sens", () => {
    assert.equal(casesDuRectangle({ col: 3, lig: 2 }, { col: 1, lig: 4 }).length, 9);
    assert.deepEqual(casesDuRectangle({ col: 5, lig: 5 }, { col: 5, lig: 5 }), [{ col: 5, lig: 5 }]);
  });

  it("révéler puis recouvrir, sans doublon", () => {
    let r = modifierBrouillard([], casesDuRectangle({ col: 0, lig: 0 }, { col: 1, lig: 1 }), true);
    r = modifierBrouillard(r, [{ col: 1, lig: 1 }, { col: 2, lig: 2 }], true);
    assert.deepEqual(r, ["0,0", "0,1", "1,0", "1,1", "2,2"]);
    assert.deepEqual(modifierBrouillard(r, [{ col: 1, lig: 1 }], false), ["0,0", "0,1", "1,0", "2,2"]);
  });

  it("un grand pion occupe toutes ses cases", () => {
    assert.equal(casesDuPion({ col: 2, lig: 2, taille: 3 }).length, 9);
  });

  it("illustration : les coups de pinceau s'ajoutent ; « tout » repart de zéro", () => {
    const a = { x: 10, y: 10, r: 5, reveler: true };
    const b = { x: 20, y: 20, r: 5, reveler: false };
    assert.deepEqual(ajouterTraits([a], [b]), [a, b]);
    assert.deepEqual(ajouterTraits([a, b], [{ tout: true, reveler: true }, a]), [{ tout: true, reveler: true }, a]);
  });

  it("pion visible s'il n'y a pas de brouillard, ou si une de ses cases est révélée", () => {
    const ogre = { col: 4, lig: 4, taille: 2 as const };
    assert.equal(visibleDansBrouillard(ogre, undefined), true);
    assert.equal(visibleDansBrouillard(ogre, { actif: false, reveles: [] }), true);
    assert.equal(visibleDansBrouillard(ogre, { actif: true, reveles: [] }), false);
    assert.equal(visibleDansBrouillard(ogre, { actif: true, reveles: ["5,5"] }), true);
    assert.equal(visibleDansBrouillard(ogre, { actif: true, reveles: ["6,6"] }), false);
  });
});
