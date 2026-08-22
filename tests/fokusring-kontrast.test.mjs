// smejj.com — Fokusringe muessen SICHTBAR sein, nicht nur vorhanden.
//
// DER BEFUND, DER DIESEN WAECHTER AUSGELOEST HAT (2026-08-22):
// In konto-formulare.test.mjs stand die Zusicherung "der Fokusring ist in
// BEIDEN Schemata sichtbar" — geprueft wurde dafuer `outline: 2px solid
// #2dd4bf`. Ein Farbwert, festgenagelt als Zeichenkette. Nachgerechnet
// erreichte genau dieser Wert gegen den hellen Grund 1.86, gefordert sind
// 3.0. Tastaturnutzer im hellen Schema hatten seit jeher keinen sichtbaren
// Ring, und der gruene Haken behauptete das Gegenteil.
//
// Beim Nachsehen zeigte sich, dass es kein Einzelfall war:
//   app-surfaces.css  rgba(255,255,255,0.09) auf #fdfdfb -> ~1.0
//                     (weiss auf weiss, buchstaeblich unsichtbar)
//   design-v11-views  #32f6ea               auf #fdfdfb -> 1.33
// Das helle Schema gilt fuer JEDE premium-view (app-surfaces.css:627),
// nicht nur fuer Einstellungen und Konto.
//
// Dieser Waechter pinnt darum keinen Wert, sondern RECHNET. Ein Test, der
// eine Eigenschaft im Namen fuehrt ("sichtbar"), muss sie messen — sonst
// prueft er die Schreibweise und nicht die Sache.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// WCAG 2.1, relative Luminanz. Schwelle fuer Nicht-Text (Fokusringe,
// Umrandungen, Bedienelemente): 3.0.
const SCHWELLE = 3.0;

export function kontrast(vorne, hinten) {
  const luminanz = (hex) => {
    const c = hex.replace("#", "");
    const k = [0, 2, 4]
      .map((i) => parseInt(c.substr(i, 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
  };
  const [hell, dunkel] = [luminanz(vorne), luminanz(hinten)].sort((a, b) => b - a);
  return (hell + 0.05) / (dunkel + 0.05);
}

// Die Gruende, gegen die gemessen wird. Beide aus den CSS-Quellen belegt:
// hell = app-surfaces.css:627 (rgba(255,255,255,.78) ueber #f7f7f4),
// dunkel = app-surfaces.css:430 (--premium-surface #101216).
const GRUND_HELL = "#fdfdfb";
const GRUND_DUNKEL = "#101216";

// Jede Stelle, an der ein Schema seinen Fokuston selbst setzt.
const FOKUS_VARIABLEN = [
  { datei: "public/design-v11-views.css", name: "--v11-fokus" },
  { datei: "public/account-privacy.css", name: "--konto-fokus" },
  { datei: "public/settings-surface.css", name: "--set-fokus" }
];

test("die Rechnung selbst stimmt — gegen bekannte Werte gepruefft", () => {
  // Ohne diese Probe koennte die Formel falsch sein und alles durchwinken.
  assert.ok(kontrast("#000000", "#ffffff") > 20, "Schwarz auf Weiss ist maximal");
  assert.ok(kontrast("#ffffff", "#ffffff") < 1.1, "Weiss auf Weiss ist minimal");
  // Die zwei real gemessenen Faelle von 2026-08-22:
  assert.ok(kontrast("#2dd4bf", "#fbfbf9") < SCHWELLE, "der alte Konto-Ton faellt durch");
  assert.ok(kontrast("#32f6ea", GRUND_HELL) < SCHWELLE, "der V11-Akzent faellt auf Hell durch");
  assert.ok(kontrast("#0c6b5e", GRUND_HELL) >= SCHWELLE, "der gewaehlte Ersatz traegt");
  assert.ok(kontrast("#32f6ea", GRUND_DUNKEL) >= SCHWELLE, "auf Dunkel traegt der Akzent");
});

test("jedes Schema setzt seinen Fokuston selbst", () => {
  // Faellt eine der beiden Fassungen weg, erbt das Schema still den Wert
  // des anderen — genau so entstand der unsichtbare Ring.
  for (const { datei, name } of FOKUS_VARIABLEN) {
    const css = fs.readFileSync(datei, "utf8");
    const treffer = [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
    assert.ok(treffer.length >= 2,
      `${name} in ${datei}: braucht einen Wert je Schema, gefunden ${treffer.length}`);
  }
});

test("der HELLE Fokuston traegt ueberall — nachgerechnet, nicht behauptet", () => {
  const gemessen = [];
  for (const { datei, name } of FOKUS_VARIABLEN) {
    const css = fs.readFileSync(datei, "utf8");
    for (const m of css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, "g"))) {
      const wert = m[1];
      const k = kontrast(wert, GRUND_HELL);
      gemessen.push({ datei, name, wert, kontrast: Number(k.toFixed(2)) });
      assert.ok(k >= SCHWELLE,
        `${name} = ${wert} (${datei}): Kontrast ${k.toFixed(2)} auf hellem Grund, gefordert ${SCHWELLE}`);
    }
  }
  // Ein Waechter, der nichts findet, prueft nichts.
  assert.ok(gemessen.length >= 3,
    `es muessen feste helle Fokustoene messbar sein, gefunden: ${gemessen.length}`);
});

test("kein Fokusring haengt an einer fast durchsichtigen weissen Linie", () => {
  // rgba(255,255,255,0.09) war der Ausgangswert in app-surfaces.css: auf
  // dem hellen Grund praktisch unsichtbar. Diese Datei steht im Start-Lock
  // und wird nicht geaendert — stattdessen muss design-v11-views.css den
  // Fall ueberschreiben. Genau das haelt dieser Test fest.
  const v11 = fs.readFileSync("public/design-v11-views.css", "utf8");
  assert.match(v11, /\.view\.premium-view input:focus[\s\S]{0,200}var\(--v11-fokus\)/,
    "die Eingabefelder muessen den geprueften Fokuston nehmen");
});

// ---------------------------------------------------------------------------
// Das Browser-Panel: geprueft, in Ordnung — und gegen den Tag abgesichert,
// an dem sich das aendert.
//
// Gemessen am 2026-08-22: die vier Fokusringe in browser-pane-chrome.css
// (rgba(159,231,212,.8/.9)) liegen auf dem Panelgrund #090a0c und erreichen
// 11.38 bzw. 9.15 — muehelos ueber der Schwelle. Sie sind KEIN Problem,
// weil das Panel zur Shell gehoert und keine helle Fassung hat.
//
// Genau daraus entsteht aber die Falle. In app-surfaces.css steht der
// Beleg, dass sie schon einmal zugeschnappt ist: .glass-icon und
// .split-icon gehoeren ebenfalls zur Shell, "erben deren Farbschema nicht"
// und blieben im hellen Schema "hell auf hell (Kontrast 1.03:1, praktisch
// unsichtbar)". Wer dem Panel eines Tages ein helles Schema gibt, holt
// sich denselben Fehler zurueck: auf hellem Grund faellt der Ring auf 1.39.
const PANEL_RING = "#9fe7d4"; // rgba(159, 231, 212, …)

test("die Panel-Fokusringe tragen auf dem dunklen Panelgrund", () => {
  assert.ok(kontrast(PANEL_RING, "#090a0c") >= SCHWELLE,
    "auf dem Panelgrund muessen die Ringe tragen");
});

test("bekommt das Panel je ein helles Schema, muessen die Ringe mitziehen", () => {
  // Der Waechter schlaegt an, SOBALD jemand browser-pane-chrome.css eine
  // light-Regel gibt, ohne die Ringe anzupassen. Solange es keine gibt,
  // ist nichts zu tun — und der Test sagt genau das.
  const css = fs.readFileSync("public/browser-pane-chrome.css", "utf8");
  const hatHellesSchema = /\[data-settings-theme="light"\]|prefers-color-scheme:\s*light/.test(css);
  if (!hatHellesSchema) {
    assert.ok(kontrast(PANEL_RING, "#fdfdfb") < SCHWELLE,
      "Sicherung: der Ring faellt auf Hell durch — genau darum darf das Panel kein helles Schema haben, ohne die Ringe mitzuziehen");
    return;
  }
  assert.fail(
    "browser-pane-chrome.css hat jetzt ein helles Schema. Die vier Fokusringe " +
    "stehen auf rgba(159,231,212,…) und erreichen auf hellem Grund nur 1.39 " +
    "(gefordert 3.0) — sie brauchen eine Variable je Schema, wie --v11-fokus.");
});

