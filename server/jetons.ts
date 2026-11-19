// Jetons d'invitation : la fin des liens (/jeu/<jeton>), qui sert de clé d'entrée.
// Format court et lisible : trois groupes de 4 caractères (« k7m2-qx9p-4hdt »), en minuscules
// et chiffres, sans les signes qui se confondent (0, o, 1, l, i). 31^12 ≈ 8 × 10^17
// combinaisons : impossible à deviner, même en essayant des milliers de liens par seconde.

import { randomInt } from "node:crypto";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export const FORMAT_JETON = /^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/;

export function nouveauJeton(): string {
  const groupe = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${groupe()}-${groupe()}-${groupe()}`;
}
