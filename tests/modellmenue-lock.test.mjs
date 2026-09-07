// Waechter fuer die MODELL-LISTE — die Substanz, nicht nur die Bytes.
//
// Betreiber-Auftrag 2026-09-07 im Wortlaut (loest die Liste vom 2026-08-23 ab):
//   "Soll hier nur:
//      smejj 1.3 — Spezialfälle
//      smejj 1.2 — Komplex
//      smejj 1.1 — Alltag
//      smejj 1.0 — Standard
//      Auto — Automatisch
//    Genau so sein."
//
// Der Auftrag vom 2026-08-23 ("Genau diese Liste ich will haben und musst du
// sichern ...") gilt in seiner Form weiter: die Liste ist 100 % geschuetzt —
// nur ist "diese Liste" seit dem 07.09. die obige. Die schriftliche
// Bestaetigung fuer den Wechsel ist der Auftrag selbst.
//
// WARUM DIESER WAECHTER NEBEN DER DATEISPERRE STEHT:
// scripts/check-modell-menue-lock.mjs vergleicht Hashes. Das meldet JEDE
// Aenderung — auch einen Kommentar — und sagt nichts darueber, ob die Liste
// noch stimmt. Hier wird das Gegenteil geprueft: die fuenf Zeilen, ihr
// Wortlaut und ihre Reihenfolge muessen da sein, egal wie die Datei sonst
// umgebaut wird — und NICHTS darf dazukommen (kein Katalog-Nachbau mehr).
//
// Jede Pruefung hat eine GESUNDE und eine KAPUTTE Probe (Waechter-TUEV):
// ein Waechter, der nie ausschlaegt, schuetzt nichts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// fileURLToPath, NICHT .pathname: der Projektordner heisst
// "- smejj.com info/smejj.com App" — mit Leerzeichen, die .pathname als %20
// liefert. fs findet dann keine einzige Datei und der Waechter laeuft still leer.
const wurzel = fileURLToPath(new URL("../", import.meta.url));
const lies = (p) => readFileSync(wurzel + p, "utf8");

const CODE_MENUE = "public/code-modell-menue.js";

// Die fuenf Zeilen, Wort fuer Wort, in der Reihenfolge des Betreibers.
export const FUENF_ZEILEN = Object.freeze([
  "smejj 1.3 — Spezialfälle",
  "smejj 1.2 — Komplex",
  "smejj 1.1 — Alltag",
  "smejj 1.0 — Standard",
  "Auto — Automatisch"
]);

// ---- reine Pruefungen (auf Text, damit sich kaputte Proben einspeisen lassen)

/** Liest die vier Versionszeilen aus SMEJJ_VERSIONEN: [modell, rolle] je Zeile. */
export function versionsZeilen(text) {
  const start = text.indexOf("SMEJJ_VERSIONEN = Object.freeze([");
  if (start < 0) return [];
  const block = text.slice(start, text.indexOf("]);", start));
  return [...block.matchAll(/modell:\s*"([^"]+)",\s*rolle:\s*"([^"]+)"/g)].map((m) => `${m[1]} — ${m[2]}`);
}

/** Die Auto-Zeile: Rolle laut AUTO_ROLLE. */
export function autoZeile(text) {
  const m = text.match(/AUTO_ROLLE\s*=\s*"([^"]+)"/);
  return m ? `Auto — ${m[1]}` : null;
}

/** Baut die Zeile den Text genau so ("<modell> — <rolle>", Gedankenstrich)? */
export function zeilenTextIstWortgetreu(text) {
  return /return `\$\{modell\} — \$\{rolle\}`;/.test(text);
}

/** Kommt Auto NACH den vier Versionen? */
export function autoStehtZuletzt(text) {
  const versionen = text.indexOf("for (const v of SMEJJ_VERSIONEN)");
  const auto = text.indexOf('zeilenText("Auto", AUTO_ROLLE)');
  return versionen >= 0 && auto >= 0 && versionen < auto;
}

/** Holt das Menue noch irgendetwas beim Server? Seit 07.09. darf es das nicht. */
export function holtNochDenKatalog(text) {
  return /providers\/cline\//.test(text) || /baueGedaechtnis\(/.test(text) || /CLINE_KURZ/.test(text);
}

/** Ruft die Auto-Zeile /select? Das war nie erlaubt (Router waehlt beim Auftrag). */
export function autoRuftSelect(text) {
  const start = text.indexOf('zeilenText("Auto", AUTO_ROLLE)');
  if (start < 0) return true;
  return /providers\/cline\/select/.test(text.slice(start, start + 800));
}

// ---- die echte Datei ---------------------------------------------------------

test("die fuenf Zeilen stehen Wort fuer Wort und in der Reihenfolge des Betreibers", () => {
  const text = lies(CODE_MENUE);
  assert.deepEqual([...versionsZeilen(text), autoZeile(text)], [...FUENF_ZEILEN]);
});

test("die Zeile wird genau so gebaut: Name, Gedankenstrich, Rolle", () => {
  assert.ok(zeilenTextIstWortgetreu(lies(CODE_MENUE)), "zeilenText muss `${modell} — ${rolle}` liefern");
});

test("Auto steht zuletzt und ruft kein /select", () => {
  const text = lies(CODE_MENUE);
  assert.ok(autoStehtZuletzt(text), "Auto muss NACH den vier Versionen kommen (Auftrag 07.09.)");
  assert.ok(!autoRuftSelect(text), "Auto darf kein /select rufen — der Router waehlt beim Auftrag");
});

test("das Menue holt keinen Katalog mehr beim Server", () => {
  assert.ok(!holtNochDenKatalog(lies(CODE_MENUE)),
    "seit 07.09. hat das Menue fuenf feste Zeilen — Katalog-Modelle gehoeren in die Einstellungen");
});

test("die Umleitung alter Speicherwerte landet bei smejj 1.0", () => {
  // Wer noch "Ox Alpha" oder ein Katalog-Modell als Wahl im Browser hat, darf
  // nicht ins Leere zeigen — sonst zeigt das Menue nichts als gewaehlt an.
  const menue = lies(CODE_MENUE);
  // Altwahl "Auto ueber Cline" wird auf den eigenen Auto-Pfad gehoben ...
  assert.match(menue, /istCline && aktivesClineModell === AUTO_MARKE[\s\S]{0,160}setItem\(MODELL_KEY, AUTO_WAHL\)/,
    "die Migration alter Auto-Wahlen fehlt");
  // ... alles andere Unbekannte landet bei smejj 1.0, "Auto" bleibt gueltig.
  assert.match(menue, /wahl !== AUTO_WAHL && !istCline && !istSmejjVersion\(wahl\)[\s\S]{0,120}setItem\(MODELL_KEY, "smejj 1\.0"\)/,
    "die Umleitung unbekannter Werte fehlt");
});

test("Quelle und ausgelieferte Kopie sind byte-gleich", () => {
  // Live zaehlt /assets/. Laufen die beiden auseinander, aendert man die
  // Quelle und die Nutzer sehen weiter die alte Liste.
  const kopie = CODE_MENUE.replace("public/", "public/assets/");
  assert.equal(lies(CODE_MENUE), lies(kopie), `${CODE_MENUE} und ${kopie} weichen ab — Auslieferung nachziehen`);
});

test("die Betreiber-Anordnung steht im Code, nicht nur im Chat", () => {
  // Damit der naechste Umbau weiss, warum hier nichts vereinfacht werden darf.
  assert.match(lies("scripts/check-modell-menue-lock.mjs"), /Genau diese Liste ich will haben/);
  assert.match(lies("scripts/check-modell-menue-lock.mjs"), /Genau so sein/);
  assert.match(lies(CODE_MENUE), /Genau so sein/);
});

// ---- Waechter-TUEV: schlaegt er bei kaputten Proben ueberhaupt an? -----------

const GESUND = `
export const SMEJJ_VERSIONEN = Object.freeze([
  Object.freeze({ modell: "smejj 1.3", rolle: "Spezialfälle", hinweis: "x" }),
  Object.freeze({ modell: "smejj 1.2", rolle: "Komplex", hinweis: "x" }),
  Object.freeze({ modell: "smejj 1.1", rolle: "Alltag", hinweis: "x" }),
  Object.freeze({ modell: "smejj 1.0", rolle: "Standard", hinweis: "x" })
]);
export const AUTO_ROLLE = "Automatisch";
export function zeilenText(modell, rolle) {
  return \`\${modell} — \${rolle}\`;
}
for (const v of SMEJJ_VERSIONEN) { zeile(v); }
zeile({ titel: zeilenText("Auto", AUTO_ROLLE) });
`;

test("TUEV: kaputte Proben werden erkannt", () => {
  // 1. Eine Zeile umbenannt ("Komplex" -> "Schwer")
  assert.notDeepEqual(versionsZeilen(GESUND.replace('"Komplex"', '"Schwer"')), FUENF_ZEILEN.slice(0, 4));
  // 2. Reihenfolge gedreht
  const gedreht = GESUND.replace('"smejj 1.3", rolle: "Spezialfälle"', '"smejj 1.0", rolle: "Standard"')
    .replace(/"smejj 1\.0", rolle: "Standard" \}\)\n\]\);/, '"smejj 1.3", rolle: "Spezialfälle" })\n]);');
  assert.notDeepEqual(versionsZeilen(gedreht), FUENF_ZEILEN.slice(0, 4));
  // 3. Auto vor die Versionen gerutscht
  assert.ok(!autoStehtZuletzt('zeilenText("Auto", AUTO_ROLLE)\nfor (const v of SMEJJ_VERSIONEN) {}'));
  // 4. Doppelpunkt statt Gedankenstrich
  assert.ok(!zeilenTextIstWortgetreu("return `${modell}: ${rolle}`;"));
  // 5. Katalog-Nachbau wieder eingebaut
  assert.ok(holtNochDenKatalog(GESUND + '\nfetch(`${API}/api/providers/cline/models`)'));
  // 6. Auto ruft /select
  assert.ok(autoRuftSelect('zeilenText("Auto", AUTO_ROLLE)\nfetch("/api/providers/cline/select")'));
  // 7. Auto-Rolle geaendert
  assert.notEqual(autoZeile(GESUND.replace('"Automatisch"', '"Auto"')), FUENF_ZEILEN[4]);
});

test("TUEV: gesunde Proben bleiben gruen", () => {
  assert.deepEqual([...versionsZeilen(GESUND), autoZeile(GESUND)], [...FUENF_ZEILEN]);
  assert.ok(zeilenTextIstWortgetreu(GESUND));
  assert.ok(autoStehtZuletzt(GESUND));
  assert.ok(!holtNochDenKatalog(GESUND));
  assert.ok(!autoRuftSelect(GESUND));
});
