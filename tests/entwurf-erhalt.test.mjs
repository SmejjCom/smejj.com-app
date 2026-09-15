// Entwurf im Eingabefeld ueberlebt Neuladen (15.09.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { leseEntwurf, schreibeEntwurf, ENTWURF_SCHLUESSEL } from "../public/entwurf-erhalt.js";

const speicher = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test("schreiben, lesen, leer loescht, 24 h verfallen", () => {
  const s = speicher();
  schreibeEntwurf(s, "Hallo Welt", 1000);
  assert.equal(leseEntwurf(s, 2000), "Hallo Welt");
  assert.equal(leseEntwurf(s, 1000 + 24 * 3600 * 1000 + 1), "", "verfallen");
  schreibeEntwurf(s, "   ", 3000);
  assert.equal(s.m.has(ENTWURF_SCHLUESSEL), false);
  s.setItem(ENTWURF_SCHLUESSEL, "{kaputt");
  assert.equal(leseEntwurf(s), "");
});

test("eingebunden, vorab gespeichert und beim Abmelden entfernt", () => {
  assert.match(fs.readFileSync("public/bedarf-nachladen.js", "utf8"), /import\("\.\/entwurf-erhalt\.js\?v=1"\)/);
  assert.doesNotMatch(fs.readFileSync("public/index.html", "utf8"), /entwurf-erhalt\.js/, "nicht im Startgewicht");
  assert.match(fs.readFileSync("public/sw.js", "utf8"), /"\/assets\/entwurf-erhalt\.js",/);
  assert.match(fs.readFileSync("public/profile-dock-menu.js", "utf8"), /localStorage\.removeItem\("smejj\.entwurf\.v1"\)/);
});
