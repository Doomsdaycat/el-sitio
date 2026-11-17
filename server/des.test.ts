// Tests des règles de dés. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErreurJet, jetCompetence, jetLibre, type Tirage } from "./des.ts";

/** Tirage truqué : renvoie les valeurs données, dans l'ordre. */
function truque(...valeurs: number[]): Tirage {
  let i = 0;
  return () => {
    if (i >= valeurs.length) throw new Error("Plus de valeurs truquées");
    return valeurs[i++];
  };
}

const jet = (valeur: number, faveurs: number, fleaux: number, ...des: number[]) =>
  jetCompetence({ valeur, faveurs, fleaux }, truque(...des));

describe("Jet de compétence (1D20 sous la valeur)", () => {
  it("réussit si le dé est inférieur ou égal à la valeur", () => {
    assert.equal(jet(12, 0, 0, 12).reussi, true);
    assert.equal(jet(12, 0, 0, 5).reussi, true);
  });

  it("échoue si le dé dépasse la valeur", () => {
    assert.equal(jet(12, 0, 0, 13).reussi, false);
  });

  it("1 naturel : dragon, réussite", () => {
    const r = jet(3, 0, 0, 1);
    assert.equal(r.dragon, true);
    assert.equal(r.reussi, true);
  });

  it("20 naturel : démon, échec même avec une valeur de 20", () => {
    const r = jet(20, 0, 0, 20);
    assert.equal(r.demon, true);
    assert.equal(r.reussi, false);
  });

  it("19 avec une valeur de 20 : réussite ordinaire", () => {
    const r = jet(20, 0, 0, 19);
    assert.equal(r.reussi, true);
    assert.equal(r.demon, false);
  });
});

describe("Faveurs et fléaux", () => {
  it("une faveur : deux D20, on garde le plus petit", () => {
    const r = jet(10, 1, 0, 15, 7);
    assert.deepEqual(r.des, [15, 7]);
    assert.equal(r.garde, 7);
    assert.equal(r.indexGarde, 1);
    assert.equal(r.reussi, true);
  });

  it("un fléau : deux D20, on garde le plus grand", () => {
    const r = jet(10, 0, 1, 15, 7);
    assert.equal(r.garde, 15);
    assert.equal(r.reussi, false);
  });

  it("plusieurs faveurs : un D20 de plus par faveur", () => {
    const r = jet(10, 3, 0, 18, 12, 4, 16);
    assert.equal(r.des.length, 4);
    assert.equal(r.garde, 4);
  });

  it("une faveur et un fléau s'annulent : un seul D20", () => {
    const r = jet(10, 1, 1, 14);
    assert.deepEqual(r.des, [14]);
  });

  it("deux faveurs et un fléau : comme une faveur", () => {
    const r = jet(10, 2, 1, 14, 3);
    assert.equal(r.des.length, 2);
    assert.equal(r.garde, 3);
  });

  it("faveur avec un 1 parmi les dés : dragon", () => {
    assert.equal(jet(10, 1, 0, 1, 20).dragon, true);
  });

  it("faveur : un 20 écarté n'est pas un démon", () => {
    const r = jet(10, 1, 0, 20, 5);
    assert.equal(r.demon, false);
    assert.equal(r.reussi, true);
  });

  it("fléau avec un 20 parmi les dés : démon", () => {
    assert.equal(jet(10, 0, 1, 3, 20).demon, true);
  });

  it("fléau : un 1 écarté n'est pas un dragon", () => {
    assert.equal(jet(10, 0, 1, 1, 8).dragon, false);
  });
});

describe("Validation des demandes", () => {
  it("refuse une valeur hors de 1 à 20", () => {
    assert.throws(() => jet(0, 0, 0, 5), ErreurJet);
    assert.throws(() => jet(21, 0, 0, 5), ErreurJet);
    assert.throws(() => jet(7.5, 0, 0, 5), ErreurJet);
  });

  it("refuse trop de faveurs ou un nombre négatif", () => {
    assert.throws(() => jet(10, 6, 0, 5), ErreurJet);
    assert.throws(() => jet(10, -1, 0, 5), ErreurJet);
  });
});

describe("Jets libres", () => {
  it("2D6+3", () => {
    const r = jetLibre("2D6+3", truque(4, 2));
    assert.equal(r.total, 9);
    assert.equal(r.formule, "2D6+3");
  });

  it("D8+D4, minuscules et espaces acceptés ; affiché 1D8+1D4", () => {
    const r = jetLibre(" d8 + d4 ", truque(5, 3));
    assert.equal(r.total, 8);
    assert.equal(r.formule, "1D8+1D4");
  });

  it("formule affichée avec le nombre de dés, signes conservés", () => {
    assert.equal(jetLibre("-D3+2D6-1", truque(4, 1, 1)).formule, "-1D3+2D6-1");
  });

  it("soustraction", () => {
    assert.equal(jetLibre("1D10-2", truque(1)).total, -1);
  });

  it("D3 = D6 divisé par deux, arrondi au supérieur", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((d6) => jetLibre("D3", truque(d6)).total),
      [1, 1, 2, 2, 3, 3],
    );
  });

  it("refuse les formules incomprises ou excessives", () => {
    for (const f of ["", "abc", "2D", "D7", "D6++2", "50D6", "D6+1000", "2*D6"]) {
      assert.throws(() => jetLibre(f, truque(1, 1, 1)), ErreurJet, f);
    }
  });
});

describe("Hasard réel", () => {
  it("les D20 tombent tous entre 1 et 20, et chaque face sort", () => {
    const vus = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const r = jetCompetence({ valeur: 10, faveurs: 0, fleaux: 0 });
      assert.ok(r.garde >= 1 && r.garde <= 20);
      vus.add(r.garde);
    }
    assert.equal(vus.size, 20);
  });
});
