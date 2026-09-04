// smejj.com — Zwei Reiter im API-Bereich (Betreiber-Beschluss 2026-09-04, Plan Punkt 1).
//
// Warum ein eigener Test: Der Umbau nimmt der Flaeche ihren alten Filter weg
// (Typ-Chips im Formular, Filter-Chips ueber der Liste) und ersetzt ihn durch
// den Reiter. Bleibt irgendwo ein Rest stehen — ein `zustand.typ`, ein
// `data-ac="filter"` —, dann zeigt die Liste wieder beides gemischt oder das
// Formular erzeugt die falsche Art Schluessel. Beides waere von aussen nicht
// sofort zu sehen, aber genau der Zustand, ueber den sich der Betreiber
// beschwert hat.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const publicDir = path.resolve("public");
const surface = fs.readFileSync(path.join(publicDir, "api-center-surface.js"), "utf8");
const css = fs.readFileSync(path.join(publicDir, "api-center-surface.css"), "utf8");

test("Es gibt genau zwei Reiter, smejj ist offen, beide sind Tabs", () => {
  const knoepfe = [...surface.matchAll(/data-ac="reiter" data-reiter="([a-z]+)" aria-selected="(true|false)"/g)];
  assert.equal(knoepfe.length, 2, "erwartet genau zwei Reiter-Knoepfe");
  assert.deepEqual(knoepfe.map((m) => m[1]), ["smejj", "anbieter"]);
  assert.deepEqual(knoepfe.map((m) => m[2]), ["true", "false"], "smejj ist beim Oeffnen aktiv");
  assert.match(surface, /role="tablist"/);
  assert.match(surface, /t\("Meine smejj-Schlüssel"\)/);
  assert.match(surface, /t\("Eigene Anbieter"\)/);
});

test("Der alte Misch-Filter ist restlos weg — sonst stuenden beide Arten wieder nebeneinander", () => {
  assert.doesNotMatch(surface, /zustand\.typ/, "zustand.typ ist durch zustand.reiter ersetzt");
  assert.doesNotMatch(surface, /data-ac="filter"/, "Filter-Chips ueber der Liste entfallen");
  assert.doesNotMatch(surface, /data-ac="typ"/, "Typ-Chips im Formular entfallen");
  assert.doesNotMatch(surface, /function typWahl/);
  assert.doesNotMatch(surface, /function filterWahl/);
  assert.doesNotMatch(surface, /ac-cell-typ/, "die Typ-Spalte entfaellt mit dem Reiter");
});

test("Die Liste zeigt nur den offenen Reiter, mit eigenen Spalten je Art", () => {
  assert.match(surface, /function reiterEintraege\(zustand\) \{\s*return alleEintraege\(zustand\)\.filter\(\(e\) => e\.art === zustand\.reiter\);/);
  assert.match(surface, /const eintraege = reiterEintraege\(zustand\);/);
  // Spaltenkoepfe werden je Reiter gesetzt, nicht fest ins Markup geschrieben.
  assert.match(surface, /\[data-ac-cols\]"\)\.innerHTML = zustand\.reiter === "smejj"/);
  assert.match(surface, /t\("Läuft ab"\)/);
  assert.match(surface, /t\("Modell"\)/);
});

test("Verbinden steht oben im smejj-Reiter und verschwindet beim Anbieter-Reiter", () => {
  assert.match(surface, /<section class="ac-verbinden" data-ac-verbinden>/);
  assert.match(surface, /\[data-ac-verbinden\]"\)\.hidden = zustand\.reiter !== "smejj"/);
  // Der frühere Ausklapp-Kasten heisst jetzt nur noch "Preise".
  assert.doesNotMatch(surface, /Verbinden & Preise/);
  assert.match(surface, /<summary>\$\{t\("Preise"\)\}<\/summary>/);
  // Die Basis-URL steht genau einmal als Feld und einmal im curl-Beispiel —
  // beim Verschieben nach oben darf keine zweite Kopie unten stehen bleiben.
  assert.equal((surface.match(/data-ac-basis-url>/g) || []).length, 1);
  assert.equal((surface.match(/data-ac-basis-url-2>/g) || []).length, 1);
});

test("Formular und Absenden folgen dem Reiter — keine zweite Wahl mehr", () => {
  assert.match(surface, /function formularFuerReiter\(root, zustand\)/);
  assert.match(surface, /if \(zustand\.reiter === "smejj"\) return erzeugeSmejjSchluessel\(root, zustand\);/);
  // Reiterwechsel schliesst ein halb ausgefuelltes Formular.
  assert.match(surface, /function reiterWahl[\s\S]{0,400}oeffneFormular\(root, false, zustand\)/);
  assert.match(surface, /function reiterWahl[\s\S]{0,400}zeichneListe\(root, zustand\)/);
});

test("CSS: Reiter sind 44 px hoch (Touch), aktiver Reiter ist markiert, Raster je Reiter", () => {
  assert.match(css, /\.ac-reiter-knopf \{[^}]*min-height: 44px/);
  assert.match(css, /\.ac-reiter-knopf\[aria-selected="true"\]/);
  assert.match(css, /\.ac-verbinden\[hidden\] \{ display: none; \}/);
  const raster = [...css.matchAll(/grid-template-columns: ([^;]+);/g)].map((m) => m[1]);
  const spalten = raster.map((r) => (r.match(/minmax/g) || []).length + (r.includes("44px") ? 1 : 0));
  assert.ok(spalten.includes(5), "smejj-Reiter: 5 Spalten");
  assert.ok(spalten.includes(4), "Anbieter-Reiter: 4 Spalten");
});

test("Alle neuen Texte sind in allen 14 Sprachen uebersetzt", async () => {
  const codes = [...fs.readFileSync(path.join(publicDir, "language-options.js"), "utf8").matchAll(/\["([a-z]{2})",/g)]
    .map((m) => m[1]).filter((code) => code !== "de");
  const texte = ["Meine smejj-Schlüssel", "Eigene Anbieter",
    "Noch kein Anbieter verbunden. Hinterlege einen eigenen API-Key für den Chat."];
  for (const code of codes) {
    const messages = (await import(pathToFileURL(path.join(publicDir, "i18n", `${code}.js`)).href)).default;
    for (const text of texte) {
      assert.equal(typeof messages[text], "string", `${code}.js: fehlt "${text}"`);
      assert.ok(messages[text].trim(), `${code}.js: leer fuer "${text}"`);
    }
    // Und die weiter benutzten Texte duerfen beim Aufraeumen nicht mitgegangen sein.
    for (const bleibt of ["Läuft ab", "Schlüssel erstellen und verwalten.", "Nach Name oder Schlüssel suchen …"]) {
      assert.equal(typeof messages[bleibt], "string", `${code}.js: "${bleibt}" wurde faelschlich entfernt`);
    }
  }
});

test("Widerrufene und abgelaufene Schluessel zeigen kein Ablaufdatum-Versprechen (Live-Befund 2026-09-04)", () => {
  // In der Ablauf-Spalte stand bei widerrufenen Zeilen "Unbefristet" — das liest
  // sich wie eine Zusage, obwohl der Schluessel gar nicht mehr gilt.
  assert.match(surface, /function ablaufText\(eintrag\) \{\s*if \(eintrag\.widerrufen \|\| eintrag\.abgelaufen\) return "—";/);
  assert.match(surface, /ac-cell-ablauf">\$\{ablaufText\(eintrag\)\}/);
});

test("Guthaben-Leiste ist gestaltet: nebeneinander, schmale Trenner, Aufladen als Knopf (Live-Befund 2026-09-04)", () => {
  // Fuer .ac-stats gab es KEINE Regel — live standen die drei Bloecke
  // untereinander und die Trenner liefen als 720-px-Balken quer durch die Seite.
  assert.match(css, /\.ac-stats \{[^}]*display: flex/);
  assert.match(css, /\.ac-stats\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.ac-stat-block \{[^}]*flex-direction: column/);
  assert.match(css, /\.ac-stat-label \{[^}]*text-transform: uppercase/);
  assert.match(css, /\.ac-stat-value \{[^}]*font-weight: 700/);
  // Der Trenner braucht eine feste Hoehe, sonst wird er zum Balken.
  assert.match(css, /\.ac-stat-divider \{[^}]*width: 1px;[^}]*height: 34px/);
  // "Aufladen" ist ein Knopf mit Flaeche, kein nackter Text.
  assert.match(css, /\.ac-stat-link \{[^}]*min-height: 32px/);
  assert.match(css, /\.ac-stat-link\[hidden\] \{ display: none; \}/);
  // Jede Klasse aus dem Markup hat auch eine Regel — sonst faellt wieder
  // etwas ungestaltet durch.
  for (const klasse of ["ac-stats", "ac-stat-block", "ac-stat-label", "ac-stat-value", "ac-stat-link", "ac-stat-divider"]) {
    assert.ok(surface.includes(`class="${klasse}`), `${klasse} fehlt im Markup`);
    assert.ok(css.includes(`.${klasse}`), `${klasse} hat keine Stil-Regel`);
  }
});
