// smejj.com — Unit-Tests fuer die Modell-Sicht.
//
// Kern: "eingeschaltet", "eingerichtet" und "erreichbar" sind drei
// verschiedene Fragen. Ein Modell, das eingeschaltet und eingerichtet ist und
// trotzdem schweigt, ist der interessante Fall — und muss oben stehen.
//
// Ausfuehren: node --test control-server/src/admin/opsModelle.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { modellUebersicht } from "./opsModelle.js";

test("die drei Fragen bleiben getrennt", () => {
  const e = modellUebersicht({ env: {} });
  for (const m of e.modelle) {
    assert.equal(typeof m.aktiv, "boolean");
    assert.equal(typeof m.eingerichtet, "boolean");
    assert.equal(typeof m.erreichbar, "boolean");
  }
  assert.equal(e.aktiv <= e.total, true);
  assert.equal(e.erreichbar <= e.total, true);
});

test("das stumme Modell steht oben — die Betreiberin soll den Ausfall nicht suchen muessen", () => {
  // Gesundheitsdaten werden hereingereicht, damit der Test nicht vom
  // Prozesszustand abhaengt.
  const e = modellUebersicht({ env: {}, gesundheit: {} });
  const rang = (m) => {
    if (m.aktiv && m.eingerichtet && !m.erreichbar) return 0;
    if (m.aktiv && !m.eingerichtet) return 1;
    if (m.aktiv) return 2;
    return 3;
  };
  const raenge = e.modelle.map(rang);
  const sortiert = [...raenge].sort((a, b) => a - b);
  assert.deepEqual(raenge, sortiert, "auffaellige zuerst");
});

test("der Fehlertext bleibt draussen — er kann Teile einer Anfrage enthalten", () => {
  // Die Registry reicht in `health.reason` den Fehlerwortlaut durch. Ein Modell
  // zitiert im Fehlerfall gern die Anfrage; auf einem Betriebsbildschirm, an
  // dem jede Adminrolle sitzen darf, hat das nichts zu suchen.
  const e = modellUebersicht({
    env: {},
    gesundheit: {
      "glm-5-2": {
        status: "unavailable",
        available: false,
        consecutiveFailures: 3,
        checkedAt: "2026-07-28T12:00:00.000Z",
        reason: "Anfrage abgelehnt: 'Baue mir eine Rechnungsverwaltung'"
      }
    }
  });
  const text = JSON.stringify(e);
  assert.equal(text.includes("Rechnungsverwaltung"), false, "kein Fehlerwortlaut in der Antwort");
  assert.equal(text.includes("reason"), false, "auch das Feld selbst wird nicht durchgereicht");
  const glm = e.modelle.find((m) => m.id === "glm-5-2");
  assert.equal(glm.fehlschlaegeInFolge, 3, "die Anzahl ist der Betriebswert, der zaehlt");
  assert.equal(glm.gesundheitsstand, "unavailable");
  assert.equal(glm.zuletztGeprueftAm, "2026-07-28T12:00:00.000Z");
});

test("nach Anbietern gruppiert, groesste Gruppe zuerst", () => {
  const e = modellUebersicht({ env: {}, gesundheit: {} });
  assert.equal(Array.isArray(e.anbieter), true);
  for (let i = 1; i < e.anbieter.length; i += 1) {
    assert.equal(e.anbieter[i - 1].total >= e.anbieter[i].total, true);
  }
  const summe = e.anbieter.reduce((s, a) => s + a.total, 0);
  assert.equal(summe, e.total, "kein Modell faellt bei der Gruppierung heraus");
});
