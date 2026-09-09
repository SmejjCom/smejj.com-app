// Waechter fuer die MODELL-LISTE — die Substanz, nicht nur die Bytes.
//
// Betreiber-Auftrag 2026-09-10 im Wortlaut:
//   "Cline muss vollstaendig aus der App entfernt werden ... Im Modellbereich
//    duerfen nur noch diese Bereiche existieren: Unsere Modelle (smejj 1.3,
//    1.2, 1.1, zukuenftige smejj-Versionen automatisch ergaenzen) / Auto.
//    Die neueste und staerkste smejj-Version muss immer ganz oben stehen."
//
// Er loest den Auftrag vom 2026-08-23 ab ("Genau diese Liste ich will haben"),
// der eine lange Fremdkatalog-Liste schuetzte. Der Schutzgedanke bleibt, das
// Schutzgut ist ein anderes.
//
// WARUM DIESER WAECHTER NEBEN DER DATEISPERRE STEHT:
// scripts/check-modell-menue-lock.mjs vergleicht Hashes. Das meldet JEDE
// Aenderung — auch einen Kommentar — und sagt nichts darueber, ob die Liste
// noch stimmt. Hier wird das Gegenteil geprueft: was die Liste ausmacht, muss
// da sein, egal wie die Datei sonst umgebaut wird.
//
// Die vier Arten, wie diese Liste kaputtgehen kann — je eine Pruefung dagegen:
//   1. Ein Fremdanbieter kehrt zurueck, sei es auch nur als Adresse im Code.
//   2. Die Reihenfolge kippt: 1.10 landet unter 1.9, weil jemand Zeichenketten
//      vergleicht statt Zahlen. Faellt erst bei der zehnten Version auf.
//   3. Die Staffel wird wieder fest verdrahtet — dann ergaenzt sich keine
//      kuenftige Version mehr von selbst, und der Auftrag ist gebrochen.
//   4. Die Quelle wird geaendert, die ausgelieferte /assets/-Kopie nicht. Live
//      bleibt die alte Liste stehen (Memory: "Artefakt ersetzt NIE die Quelle").
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

// ---- Pruefungen als reine Funktionen, damit der TUEV sie fuettern kann -------

/** Steht im ausfuehrbaren Teil noch ein Fremdanbieter? Kommentare zaehlen nicht. */
export function fremdanbieterImCode(text) {
  const ohneKommentare = text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return /cline/i.test(ohneKommentare) && !/ALTER_CLINE_MODELL_KEY|smejj\.cline\.(model|status|katalog)/.test(ohneKommentare);
}

/** Kommt die Staffel aus Daten — oder ist sie wieder Zeile fuer Zeile gebaut? */
export function staffelAusDaten(text) {
  return /export const SMEJJ_STAFFEL\s*=\s*\[/.test(text)
    && /for \(const eintrag of nachVersionAbsteigend\(SMEJJ_STAFFEL\)\)/.test(text);
}

/** Wird nach Zahl sortiert (1.10 vor 1.9) oder nach Zeichen? */
export function sortiertNachZahl(nachVersionAbsteigend) {
  const probe = [
    { titel: "smejj 1.9" }, { titel: "smejj 1.10" }, { titel: "smejj 1.2" }, { titel: "smejj 2.0" }
  ];
  return nachVersionAbsteigend(probe).map((e) => e.titel).join(" ") === "smejj 2.0 smejj 1.10 smejj 1.9 smejj 1.2";
}

/** Genau zwei Bereiche, in dieser Reihenfolge: unsere Modelle, dann Auto. */
export function zweiBereiche(text) {
  const unsere = text.indexOf('kopf.textContent = "Unsere Modelle"');
  const automatisch = text.indexOf('TRENNER.textContent = "Automatisch"');
  const auto = text.indexOf('titel: "Auto"');
  return unsere > 0 && automatisch > unsere && auto > automatisch;
}

// ---- die echten Dateien ------------------------------------------------------

test("kein Fremdanbieter mehr im ausfuehrbaren Teil des Menues", () => {
  assert.equal(fremdanbieterImCode(lies(CODE_MENUE)), false,
    "Cline darf nur noch in Kommentaren und in der Aufraeum-Migration vorkommen");
});

test("das Menue braucht kein Netz — die Liste steht als Daten drin", () => {
  const text = lies(CODE_MENUE);
  assert.ok(staffelAusDaten(text), "SMEJJ_STAFFEL fehlt oder wird nicht durchlaufen");
  assert.doesNotMatch(text, /fetch\(/, "ein Menue, das laedt, kann halb ankommen");
});

test("die neueste Version steht oben — auch bei zweistelligen Nummern", async () => {
  const { nachVersionAbsteigend, SMEJJ_STAFFEL } = await import("../public/code-modell-menue.js");
  assert.ok(sortiertNachZahl(nachVersionAbsteigend),
    "1.10 muss ueber 1.9 stehen — Zeichenvergleich macht genau das falsch");
  assert.equal(nachVersionAbsteigend(SMEJJ_STAFFEL)[0].titel, "smejj 1.3", "aktuell hoechste Version");
});

test("genau zwei Bereiche: Unsere Modelle, dann Auto", () => {
  assert.ok(zweiBereiche(lies(CODE_MENUE)),
    "Betreiber 2026-09-10: 'Im Modellbereich duerfen nur noch diese Bereiche existieren'");
});

test("jede Stufe traegt eine eigene Spur — sonst ist das Menue eine Attrappe", async () => {
  const { SMEJJ_STAFFEL } = await import("../public/code-modell-menue.js");
  const spuren = SMEJJ_STAFFEL.map((e) => e.stufe);
  assert.equal(new Set(spuren).size, spuren.length, `doppelte Spur: ${spuren.join(", ")}`);
  for (const eintrag of SMEJJ_STAFFEL) assert.ok(eintrag.hinweis, `${eintrag.titel} ohne Erklaerung`);
});

test("Quelle und ausgelieferte Kopie sind byte-gleich", () => {
  // Live zaehlt /assets/. Laufen die beiden auseinander, aendert man die
  // Quelle und die Nutzer sehen weiter die alte Liste.
  const kopie = CODE_MENUE.replace("public/", "public/assets/");
  assert.equal(lies(CODE_MENUE), lies(kopie), `${CODE_MENUE} und ${kopie} weichen ab — Auslieferung nachziehen`);
});

test("die Betreiber-Anordnung steht im Code, nicht nur im Chat", () => {
  // Damit der naechste Umbau weiss, warum hier nichts dazukommen darf.
  assert.match(lies("scripts/check-modell-menue-lock.mjs"), /duerfen nur noch diese Bereiche existieren/);
});

// ---- Waechter-TUEV: schlaegt er bei kaputten Proben ueberhaupt an? -----------

test("TUEV: kaputte Proben werden erkannt", () => {
  assert.equal(fremdanbieterImCode('const x = fetch("/api/providers/cline/models");'), true,
    "ein zurueckgekehrter Fremdanbieter muss auffallen");
  assert.equal(staffelAusDaten('stufenZeile({ titel: "smejj 1.3" });\nstufenZeile({ titel: "smejj 1.2" });'), false,
    "eine wieder fest verdrahtete Staffel muss auffallen");
  assert.equal(sortiertNachZahl((l) => [...l].sort((a, b) => String(b.titel).localeCompare(String(a.titel)))), false,
    "Zeichenvergleich muss auffallen — er stellt 1.9 ueber 1.10");
  assert.equal(zweiBereiche('kopf.textContent = "Unsere Modelle"; titel: "Auto"'), false,
    "ein fehlender Trenner muss auffallen");
});

test("TUEV: gesunde Proben bleiben gruen", () => {
  assert.equal(fremdanbieterImCode("// frueher lief das ueber Cline\nconst x = 1;"), false,
    "ein erklaerender Kommentar darf nicht ausschlagen");
  assert.equal(staffelAusDaten(
    "export const SMEJJ_STAFFEL = [];\nfor (const eintrag of nachVersionAbsteigend(SMEJJ_STAFFEL)) stufenZeile(eintrag);"
  ), true);
});
