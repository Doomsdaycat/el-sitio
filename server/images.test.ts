// Tests de la reconnaissance des images. Lancer : npm run tester

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nomDepuisFichier, reconnaitreImage } from "./images-format.ts";

const octets = (...n: number[]) => Buffer.from(n);
const texte = (t: string) => Buffer.from(t, "latin1");

describe("Formats d'image (d'après le contenu, pas le nom)", () => {
  it("JPG, PNG, GIF et WebP reconnus", () => {
    assert.equal(reconnaitreImage(octets(0xff, 0xd8, 0xff, 0xe0, 0, 0))?.type, "image/jpeg");
    assert.equal(reconnaitreImage(octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.type, "image/png");
    assert.equal(reconnaitreImage(texte("GIF89a......"))?.type, "image/gif");
    assert.equal(reconnaitreImage(texte("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))?.type, "image/webp");
  });

  it("autres fichiers refusés (texte, page web, PDF, fichier vide)", () => {
    assert.equal(reconnaitreImage(texte("<html><script>")), null);
    assert.equal(reconnaitreImage(texte("%PDF-1.7")), null);
    assert.equal(reconnaitreImage(texte("RIFF\u0000\u0000\u0000\u0000WAVE")), null);
    assert.equal(reconnaitreImage(Buffer.alloc(0)), null);
  });
});

describe("Nom de l'image", () => {
  it("sans extension, espaces et tirets bas nettoyés", () => {
    assert.equal(nomDepuisFichier("taverne_du__dragon.jpg"), "taverne du dragon");
    assert.equal(nomDepuisFichier("  Carte des Brumes .PNG"), "Carte des Brumes");
  });
  it("nom vide : « Image » ; nom trop long : coupé", () => {
    assert.equal(nomDepuisFichier(".jpg"), "Image");
    assert.equal(nomDepuisFichier("x".repeat(100) + ".webp").length, 60);
  });
});
