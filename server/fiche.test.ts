// Tests des fiches de personnage. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appliquerModification,
  bonusDegats,
  chanceDeBase,
  deplacement,
  ErreurFiche,
  ficheVide,
  niveauCompetence,
  preparerJetFiche,
  psMax,
  pvMax,
  type Fiche,
  type ModificationFiche,
} from "../shared/fiche.ts";

const modifier = (f: Fiche, ...mods: ModificationFiche[]) =>
  mods.reduce((acc, m) => appliquerModification(acc, m, () => "e1"), f);

describe("Valeurs calculées (livre, chapitre 2)", () => {
  it("PS max = CON, PV max = VOL", () => {
    const f = modifier(ficheVide(1), { champ: "carac", carac: "CON", valeur: 14 }, { champ: "carac", carac: "VOL", valeur: 8 });
    assert.equal(psMax(f), 14);
    assert.equal(pvMax(f), 8);
  });

  it("chance de base : 3, 4, 5, 6, 7 selon la caractéristique", () => {
    assert.deepEqual([1, 5, 6, 8, 9, 12, 13, 15, 16, 18].map(chanceDeBase), [3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  });

  it("déplacement : famille puis AGI", () => {
    const avec = (famille: string, agi: number) =>
      deplacement(modifier(ficheVide(1), { champ: "famille", valeur: famille }, { champ: "carac", carac: "AGI", valeur: agi }));
    assert.equal(avec("humain", 10), 10);
    assert.equal(avec("humain", 6), 6);
    assert.equal(avec("nain", 8), 6);
    assert.equal(avec("lupin", 14), 14);
    assert.equal(avec("elfe", 16), 14);
    assert.equal(deplacement(ficheVide(1)), null);
  });

  it("bonus aux dégâts : rien jusqu'à 12, D4 de 13 à 16, D6 dès 17", () => {
    assert.deepEqual([12, 13, 16, 17, 18].map(bonusDegats), [null, "D4", "D4", "D6", "D6"]);
  });

  it("compétence sans niveau : chance de base de sa caractéristique", () => {
    const f = modifier(ficheVide(1), { champ: "carac", carac: "AGI", valeur: 16 });
    assert.deepEqual(niveauCompetence(f, "discretion"), { niveau: 7, base: true });
    const g = modifier(f, { champ: "competence", id: "discretion", valeur: 14 });
    assert.deepEqual(niveauCompetence(g, "discretion"), { niveau: 14, base: false });
    const h = modifier(g, { champ: "competence", id: "discretion", valeur: null });
    assert.deepEqual(niveauCompetence(h, "discretion"), { niveau: 7, base: true });
  });
});

describe("Modifications", () => {
  it("baisser la CON ramène les PS actuels au nouveau maximum", () => {
    const f = modifier(ficheVide(1), { champ: "carac", carac: "CON", valeur: 6 });
    assert.equal(f.psActuels, 6);
  });

  it("PS entre 0 et le maximum", () => {
    assert.equal(modifier(ficheVide(1), { champ: "ps", valeur: 0 }).psActuels, 0);
    assert.throws(() => modifier(ficheVide(1), { champ: "ps", valeur: 11 }), ErreurFiche);
    assert.throws(() => modifier(ficheVide(1), { champ: "pv", valeur: -1 }), ErreurFiche);
  });

  it("caractéristique de 1 à 18", () => {
    assert.throws(() => modifier(ficheVide(1), { champ: "carac", carac: "FOR", valeur: 19 }), ErreurFiche);
    assert.throws(() => modifier(ficheVide(1), { champ: "carac", carac: "FOR", valeur: 0 }), ErreurFiche);
    assert.throws(() => modifier(ficheVide(1), { champ: "carac", carac: "XYZ" as "FOR", valeur: 10 }), ErreurFiche);
  });

  it("états : cocher, décocher, ordre du livre, pas de doublon", () => {
    const f = modifier(
      ficheVide(1),
      { champ: "etat", etat: "effraye", actif: true },
      { champ: "etat", etat: "epuise", actif: true },
      { champ: "etat", etat: "epuise", actif: true },
    );
    assert.deepEqual(f.etats, ["epuise", "effraye"]);
    assert.deepEqual(modifier(f, { champ: "etat", etat: "epuise", actif: false }).etats, ["effraye"]);
  });

  it("famille, âge et textes refusent les valeurs inconnues ou trop longues", () => {
    assert.throws(() => modifier(ficheVide(1), { champ: "famille", valeur: "orque" }), ErreurFiche);
    assert.throws(() => modifier(ficheVide(1), { champ: "age", valeur: "Ancien" }), ErreurFiche);
    assert.throws(() => modifier(ficheVide(1), { champ: "texte", id: "notes", valeur: "x".repeat(5001) }), ErreurFiche);
    assert.throws(() => modifier(ficheVide(1), { champ: "nomPersonnage", valeur: "x".repeat(61) }), ErreurFiche);
  });

  it("nom nettoyé des espaces superflus", () => {
    assert.equal(modifier(ficheVide(1), { champ: "nomPersonnage", valeur: "  Brann   le  Rouge " }).nomPersonnage, "Brann le Rouge");
  });

  it("écoles de magie : ajouter, modifier, retirer", () => {
    let f = modifier(ficheVide(1), { champ: "ajouterEcole", nom: "Élémentalisme", niveau: 12 });
    assert.deepEqual(f.ecoles, [{ id: "e1", nom: "Élémentalisme", niveau: 12 }]);
    f = modifier(f, { champ: "ecole", id: "e1", nom: "Animisme", niveau: 10 });
    assert.equal(f.ecoles[0].nom, "Animisme");
    assert.throws(() => modifier(f, { champ: "ajouterEcole", nom: "  ", niveau: 5 }), ErreurFiche);
    assert.deepEqual(modifier(f, { champ: "retirerEcole", id: "e1" }).ecoles, []);
  });

  it("la fiche d'origine n'est jamais modifiée", () => {
    const f = ficheVide(1);
    modifier(f, { champ: "carac", carac: "FOR", valeur: 15 });
    assert.equal(f.caracs.FOR, 10);
  });

  it("modification inconnue refusée", () => {
    assert.throws(() => modifier(ficheVide(1), { champ: "pirate" } as unknown as ModificationFiche), ErreurFiche);
  });
});

describe("Jets depuis la fiche", () => {
  it("compétence : libellé, niveau, et fléau de l'état lié", () => {
    const f = modifier(
      ficheVide(1),
      { champ: "competence", id: "discretion", valeur: 13 },
      { champ: "etat", etat: "etourdi", actif: true },
    );
    assert.deepEqual(preparerJetFiche(f, { type: "competence", id: "discretion" }), {
      libelle: "Discrétion",
      valeur: 13,
      etat: "etourdi",
    });
    assert.equal(preparerJetFiche(f, { type: "competence", id: "perception" }).etat, null);
  });

  it("caractéristique : valeur de la carac", () => {
    const f = modifier(ficheVide(1), { champ: "carac", carac: "FOR", valeur: 15 }, { champ: "etat", etat: "epuise", actif: true });
    assert.deepEqual(preparerJetFiche(f, { type: "carac", carac: "FOR" }), { libelle: "Force (FOR)", valeur: 15, etat: "epuise" });
  });

  it("école de magie : son niveau, fléau si Furieux (INT)", () => {
    const f = modifier(ficheVide(1), { champ: "ajouterEcole", nom: "Mentalisme", niveau: 11 }, { champ: "etat", etat: "furieux", actif: true });
    assert.deepEqual(preparerJetFiche(f, { type: "ecole", id: "e1" }), { libelle: "Mentalisme", valeur: 11, etat: "furieux" });
  });
});
