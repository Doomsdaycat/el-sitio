// Moteur de dés de Dragonbane. Tous les tirages se font ici, sur le serveur.

import { randomInt } from "node:crypto";
import {
  BONUS_MAX,
  FORMULE_MAX,
  VALEUR_MAX,
  VALEUR_MIN,
  type ResultatCompetence,
  type ResultatLibre,
  type TermeFormule,
} from "../shared/jets.ts";

/** Tire un dé à `faces` faces (de 1 à faces). Remplaçable dans les tests. */
export type Tirage = (faces: number) => number;

export const tirageSur: Tirage = (faces) => randomInt(1, faces + 1);

export class ErreurJet extends Error {}

/**
 * Jet de compétence ou de caractéristique.
 * - On lance 1D20, plus 1D20 par faveur ou fléau restant après compensation.
 * - Faveurs : on garde le plus petit. Fléaux : le plus grand.
 * - 1 naturel = dragon (réussite) ; 20 naturel = démon (toujours un échec).
 * - Réussite si le dé gardé est inférieur ou égal à la valeur.
 */
export function jetCompetence(
  demande: { valeur: number; faveurs: number; fleaux: number },
  tirage: Tirage = tirageSur,
): ResultatCompetence {
  const { valeur, faveurs, fleaux } = demande;
  if (!Number.isInteger(valeur) || valeur < VALEUR_MIN || valeur > VALEUR_MAX) {
    throw new ErreurJet(`La valeur doit être un nombre entier de ${VALEUR_MIN} à ${VALEUR_MAX}.`);
  }
  for (const n of [faveurs, fleaux]) {
    if (!Number.isInteger(n) || n < 0 || n > BONUS_MAX) {
      throw new ErreurJet(`Faveurs et fléaux : de 0 à ${BONUS_MAX}.`);
    }
  }

  // Chaque faveur annule un fléau, et inversement.
  const net = faveurs - fleaux;
  const des = Array.from({ length: 1 + Math.abs(net) }, () => tirage(20));

  let indexGarde = 0;
  des.forEach((de, i) => {
    if (net > 0 && de < des[indexGarde]) indexGarde = i;
    if (net < 0 && de > des[indexGarde]) indexGarde = i;
  });
  const garde = des[indexGarde];
  const dragon = garde === 1;
  const demon = garde === 20;

  return {
    type: "competence",
    valeur,
    faveurs,
    fleaux,
    des,
    indexGarde,
    garde,
    reussi: !demon && garde <= valeur,
    dragon,
    demon,
  };
}

const FACES_AUTORISEES = new Set([3, 4, 6, 8, 10, 12, 20, 100]);
const NOMBRE_MAX_PAR_TERME = 20;
const TERMES_MAX = 10;
const FIXE_MAX = 100;

/**
 * Jet libre : « 2D6+3 », « 1D8+1D4 », « 1d10-1 », « D3 »…
 * La formule renvoyée écrit toujours le nombre de dés : « D4 » devient « 1D4 ».
 * Un D3 est un D6 divisé par deux, arrondi au supérieur (règle du livre).
 */
export function jetLibre(formuleBrute: string, tirage: Tirage = tirageSur): ResultatLibre {
  if (typeof formuleBrute !== "string") throw new ErreurJet("Formule manquante.");
  const formule = formuleBrute.replace(/\s+/g, "").toUpperCase();
  if (formule === "") throw new ErreurJet("Écris une formule, par exemple 2D6+3.");
  if (formule.length > FORMULE_MAX) throw new ErreurJet("Formule trop longue.");
  if (!/^[+-]?(\d*D\d+|\d+)([+-](\d*D\d+|\d+))*$/.test(formule)) {
    throw new ErreurJet("Formule non comprise. Exemples : 2D6+3, 1D8+1D4, 1D3.");
  }

  const morceaux = formule.match(/[+-]?(\d*D\d+|\d+)/g) ?? [];
  if (morceaux.length > TERMES_MAX) throw new ErreurJet("Trop de termes dans la formule.");

  const termes: TermeFormule[] = morceaux.map((morceau) => {
    const signe: 1 | -1 = morceau.startsWith("-") ? -1 : 1;
    const corps = morceau.replace(/^[+-]/, "");
    const de = corps.match(/^(\d*)D(\d+)$/);

    if (!de) {
      const fixe = Number(corps);
      if (fixe > FIXE_MAX) throw new ErreurJet(`Nombre trop grand (${FIXE_MAX} au plus).`);
      return { signe, nombre: 0, faces: 0, des: [], fixe, sousTotal: signe * fixe };
    }

    const nombre = de[1] === "" ? 1 : Number(de[1]);
    const faces = Number(de[2]);
    if (nombre < 1 || nombre > NOMBRE_MAX_PAR_TERME) {
      throw new ErreurJet(`De 1 à ${NOMBRE_MAX_PAR_TERME} dés par terme.`);
    }
    if (!FACES_AUTORISEES.has(faces)) {
      throw new ErreurJet(
        `Dé 1D${faces} inconnu. Dés possibles : 1D3, 1D4, 1D6, 1D8, 1D10, 1D12, 1D20, 1D100.`,
      );
    }
    const des = Array.from({ length: nombre }, () =>
      faces === 3 ? Math.ceil(tirage(6) / 2) : tirage(faces),
    );
    const somme = des.reduce((a, b) => a + b, 0);
    return { signe, nombre, faces, des, fixe: 0, sousTotal: signe * somme };
  });

  return {
    type: "libre",
    formule: termes
      .map((t, i) => {
        const signe = t.signe < 0 ? "-" : i > 0 ? "+" : "";
        return signe + (t.nombre === 0 ? String(t.fixe) : `${t.nombre}D${t.faces}`);
      })
      .join(""),
    termes,
    total: termes.reduce((a, t) => a + t.sousTotal, 0),
  };
}
