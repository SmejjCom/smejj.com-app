// smejj.com — Unit-Tests fuer die Sprachen-Sicht.
//
// Kern: "fehlt" und "unuebersetzt" sind zwei verschiedene Luecken. Die zweite
// sieht im Code vollstaendig aus — der Schluessel steht da, aber der Wert ist
// noch der deutsche Quelltext. Ohne diese Ansicht faellt das praktisch nie auf.
//
// Ausfuehren: node --test control-server/src/admin/opsSprachen.test.js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { __leereSprachCache, sprachUebersicht } from "./opsSprachen.js";

async function i18n(dateien) {
  const verzeichnis = await fs.mkdtemp(path.join(os.tmpdir(), "smejj-i18n-"));
  for (const [name, inhalt] of Object.entries(dateien)) {
    await fs.writeFile(path.join(verzeichnis, name), inhalt);
  }
  return verzeichnis;
}

const sprachdatei = (tabelle) => `export default ${JSON.stringify(tabelle, null, 2)};\n`;

test("NUR \"FEHLT\" IST EIN MANGEL — WORTGLEICH IST OFT RICHTIG", async () => {
  __leereSprachCache();
  const verzeichnis = await i18n({
    "fr.js": sprachdatei({ "Einstellungen": "Paramètres", "Sprache": "Langue", "Konto": "Compte" }),
    // "Konto" fehlt ganz; "Sprache" steht da, ist aber noch deutsch.
    "it.js": sprachdatei({ "Einstellungen": "Impostazioni", "Sprache": "Sprache" })
  });
  const e = await sprachUebersicht({ verzeichnis, frisch: true });

  const it = e.liste.find((s) => s.code === "it");
  assert.equal(it.fehlend, 1, "Konto fehlt vollstaendig — das ist ein Mangel");
  assert.equal(it.wortgleich, 1, "Sprache entspricht dem Quelltext — nur ein Hinweis");
  assert.deepEqual(it.beispieleFehlend, ["Konto"]);
  assert.deepEqual(it.beispieleWortgleich, ["Sprache"]);

  const fr = e.liste.find((s) => s.code === "fr");
  assert.equal(fr.fehlend, 0);
  assert.equal(fr.wortgleich, 0);

  // Live gefunden: "Free-safe", "System", "Maximal" heissen in vielen Sprachen
  // genau so. Wuerde das als Luecke zaehlen, waeren alle 14 Sprachen rot — ein
  // Bildschirm, der korrekte Uebersetzungen als Mangel meldet, wird ignoriert.
  assert.equal(e.mitLuecken, 1, "nur Italienisch hat eine echte Luecke");
  assert.equal(e.vollstaendig, 1, "Franzoesisch ist vollstaendig");
  assert.equal(e.mitWortgleichem, 1, "getrennt gefuehrt, nicht als Mangel");
  assert.equal(e.wortgleichHinweis.includes("NICHT als Luecke"), true);
});

test("die schlechteste Abdeckung steht oben", async () => {
  __leereSprachCache();
  const verzeichnis = await i18n({
    "fr.js": sprachdatei({ a: "A", b: "B", c: "C" }),
    "it.js": sprachdatei({ a: "A" }),
    "es.js": sprachdatei({ a: "A", b: "B" })
  });
  const e = await sprachUebersicht({ verzeichnis, frisch: true });
  assert.deepEqual(e.liste.map((s) => s.code), ["it", "es", "fr"]);
  assert.equal(e.liste[0].abdeckungProzent < e.liste[2].abdeckungProzent, true);
});

test("ui.js ist die Laufzeit, keine Sprache", async () => {
  __leereSprachCache();
  const verzeichnis = await i18n({
    "ui.js": "export function t(x) { return x; }\n",
    "fr.js": sprachdatei({ a: "A" })
  });
  const e = await sprachUebersicht({ verzeichnis, frisch: true });
  assert.equal(e.sprachen, 1);
  assert.equal(e.liste[0].code, "fr");
});

test("eine kaputte Sprachdatei kippt die Uebersicht nicht", async () => {
  __leereSprachCache();
  const verzeichnis = await i18n({
    "fr.js": sprachdatei({ a: "A" }),
    "xx.js": "export default 42;\n"
  });
  const e = await sprachUebersicht({ verzeichnis, frisch: true });
  assert.equal(e.ok, true);
  assert.equal(e.sprachen, 1);
  assert.equal(e.nichtLesbar.length, 1);
  assert.equal(e.nichtLesbar[0].code, "xx");
});

test("die Bezugsgroesse wird ausdruecklich genannt", async () => {
  __leereSprachCache();
  const verzeichnis = await i18n({ "fr.js": sprachdatei({ a: "A" }) });
  const e = await sprachUebersicht({ verzeichnis, frisch: true });
  assert.equal(e.quellsprache, "Deutsch");
  assert.equal(e.hinweis.includes("Vereinigung aller Sprachdateien"), true);
  assert.equal(e.hinweis.includes("faellt hier nicht auf"), true,
    "was keine Sprache kennt, wird hier nicht sichtbar — das gehoert gesagt");
});

test("ein fehlendes Verzeichnis wird gemeldet, nicht als leer ausgelegt", async () => {
  __leereSprachCache();
  const e = await sprachUebersicht({ verzeichnis: "/gibt/es/nicht", frisch: true });
  assert.equal(e.ok, false);
  assert.equal(Array.isArray(e.sprachen), true);
});
