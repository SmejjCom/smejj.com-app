// smejj.com — Tests der AI-Evolution-Ansicht (Modul AE).
//
// Warum es diesen Test gibt: Das Cockpit-Backend lieferte einmal erfundene
// Konstanten, und der Test schrieb sie fest (Befund 2026-08-13). Dieser Test
// prüft deshalb genau das Gegenteil: dass eine FEHLENDE Zahl auch als fehlend
// erscheint — und nie als 0 oder 100 %.
//
// views-stage10.js ist ein Browser-Skript (IIFE auf window) und wird in eine
// kleine Bühne geladen statt importiert — dasselbe Muster wie views.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { evolutionDashboard } from "../src/admin/opsEvolution.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));

function ansicht() {
  const buehne = {};
  buehne.window = buehne;
  buehne.adminApi = {
    escapeHtml: (wert) => String(wert == null ? "" : wert)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    zeit: () => "14.08.2026 09:00",
    dauer: (s) => `${s} s`
  };
  vm.createContext(buehne);
  for (const datei of ["views.js", "views-stage10.js"]) {
    vm.runInContext(fs.readFileSync(path.join(HIER, datei), "utf8"), buehne);
  }
  return buehne.adminViewsStage10;
}

test("AE: die Seite entsteht aus den ECHTEN Backend-Daten", () => {
  const html = ansicht().evolution(evolutionDashboard({}));
  assert.ok(html.includes("AI Evolution Engine"));
  assert.ok(html.includes("Evolution-Score"));
  assert.ok(html.includes("Abdeckung"));
});

test("AE: eine fehlende Zahl erscheint als Lücke, nie als 0", () => {
  // Frischer Prozess: es wurde noch keine KI-Aktion gemeldet, die Abdeckung
  // ist null. Genau dann darf die Seite keine Prozentzahl behaupten.
  const daten = evolutionDashboard({});
  const html = ansicht().evolution(daten);
  if (daten.system.abdeckung === null) {
    assert.ok(html.includes("Noch keine KI-Aktion gemessen"), "die Lücke muss benannt werden");
    assert.ok(!html.includes("0 % der KI-Aktionen werden geprüft"), "null darf nicht als 0 % erscheinen");
  }
  assert.ok(html.includes("nicht gemessen —"), "die Aufgaben-Ablage fehlt noch und muss als Lücke dastehen");
});

test("AE: der Konkurrenz-Stand wird als handgepflegt ausgewiesen", () => {
  const html = ansicht().evolution(evolutionDashboard({}));
  assert.ok(html.includes("handgepflegt"), "eine gepflegte Liste darf nie wie eine Messung aussehen");
});

test("AE: alle neun Abnahme-Kriterien stehen auf der Seite", () => {
  const daten = evolutionDashboard({});
  const html = ansicht().evolution(daten);
  assert.equal(daten.abnahme.kriterien.length, 9);
  for (const k of daten.abnahme.kriterien) assert.ok(html.includes(k.id), `Kriterium ${k.id} fehlt in der Ansicht`);
});

test("AE: kein style-Attribut (die eigene CSP verbietet sie)", () => {
  const html = ansicht().evolution(evolutionDashboard({}));
  assert.ok(!/\sstyle="/.test(html));
});

test("AE: eine Verbesserung mit Betreiber-Freigabe wird als solche gezeigt", () => {
  const daten = evolutionDashboard({});
  const html = ansicht().evolution(daten);
  if (daten.verbesserungen.wichtigste.some((v) => v.freigabe === "betreiber")) {
    assert.ok(html.includes("Betreiber entscheidet"));
  }
});
