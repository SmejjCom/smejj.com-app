// smejj.com — alte Admin-Adressen zeigen wieder auf die echte Konsole.
//
// BEFUND 2026-09-04 (Betreiber: "alte Admin-Kopien aufraeumen"): Zwei Stellen
// im Frontend trugen eine alte Konsolen-Huelle, die das Spiegel-Skript nie
// angefasst hat, weil keine Seite sie registriert — /admin/uebersicht/ (die am
// 23.08. aufgeloeste Startseite) und /assets/admin/** (eine vollstaendige Kopie
// aus der Salad-Zeit).
//
// Sie waren NICHT harmlos: ihre index.html laedt die Skripte ueber absolute
// Pfade aus /admin/, also die AKTUELLEN Dateien mit der ALTEN Liste — ohne
// schiene.js, ohne die Stufen 11-13, ohne defer, ohne das Markup fuer
// Logo-Knopf und Zieh-Griff. Wer so ein Lesezeichen oeffnete, bekam eine halbe
// Konsole, die zaeh laedt und deren linke Schiene sich nicht bedienen laesst.
//
// Statt einer zweiten gepflegten Kopie (die frueher oder spaeter wieder
// auseinanderlaeuft) schreibt das Spiegel-Skript dort jetzt Wegweiser.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spiegeln } from "../scripts/deploy/sync_admin_console_pages.mjs";

/** Ein Klon-Gerippe mit genau den Altlasten, die es wirklich gab. */
function klonAttrappe() {
  const wurzel = mkdtempSync(path.join(tmpdir(), "smejj-klon-"));
  for (const p of ["admin/uebersicht", "assets/admin", "assets/admin/autopiloten", "assets/admin/uebersicht"]) {
    mkdirSync(path.join(wurzel, p), { recursive: true });
    writeFileSync(path.join(wurzel, p, "index.html"), '<script src="/admin/console.js"></script>');
  }
  return wurzel;
}

test("die alten Adressen bekommen einen Wegweiser auf die echte Seite", () => {
  const wurzel = klonAttrappe();
  const ergebnis = spiegeln(wurzel);
  assert.ok(ergebnis.altlasten.length >= 4, `nur ${ergebnis.altlasten.length} Altlasten behandelt`);

  const lies = (p) => readFileSync(path.join(wurzel, p, "index.html"), "utf8");
  // Eine Seite, die es heute noch gibt, zeigt auf ihre Seite.
  assert.match(lies("assets/admin/autopiloten"), /url=\/admin\/autopiloten\//);
  // Eine Seite, die es nicht mehr gibt, zeigt auf die Startseite.
  assert.match(lies("admin/uebersicht"), /url=\/admin\/">/);
  assert.match(lies("assets/admin/uebersicht"), /url=\/admin\/">/);
  // Die Wurzel der Kopie ebenfalls.
  assert.match(lies("assets/admin"), /url=\/admin\/">/);
});

test("der Wegweiser traegt auch ohne JavaScript und ohne Inline-Skript", () => {
  const wurzel = klonAttrappe();
  spiegeln(wurzel);
  const html = readFileSync(path.join(wurzel, "admin/uebersicht/index.html"), "utf8");
  // Die CSP der Konsole verbietet Inline-Skripte — ein <script> waere wirkungslos.
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<meta http-equiv="refresh"/);
  // Und ein echter Link, falls die Weiterleitung nicht greift.
  assert.match(html, /<a href="\/admin\/">/);
  assert.match(html, /noindex, nofollow/);
});

test("die alte Konsolen-Kette ist dort verschwunden", () => {
  const wurzel = klonAttrappe();
  spiegeln(wurzel);
  for (const p of ["admin/uebersicht", "assets/admin", "assets/admin/autopiloten"]) {
    const html = readFileSync(path.join(wurzel, p, "index.html"), "utf8");
    assert.doesNotMatch(html, /src="\/admin\/console\.js"/,
      `${p} laedt weiterhin die Konsole — dann ist es wieder eine halbe Kopie`);
  }
});

test("--pruefen meldet die Altlasten, schreibt aber nichts", () => {
  const wurzel = klonAttrappe();
  const vorher = readFileSync(path.join(wurzel, "admin/uebersicht/index.html"), "utf8");
  const ergebnis = spiegeln(wurzel, { pruefen: true });
  assert.ok(ergebnis.altlasten.length >= 4);
  assert.equal(readFileSync(path.join(wurzel, "admin/uebersicht/index.html"), "utf8"), vorher);
});

test("ein zweiter Lauf schreibt nichts mehr — der Wegweiser ist stabil", () => {
  const wurzel = klonAttrappe();
  spiegeln(wurzel);
  assert.deepEqual(spiegeln(wurzel).altlasten, [], "der Spiegel darf nicht bei jedem Lauf dieselben Dateien neu schreiben");
});
