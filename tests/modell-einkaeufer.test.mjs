// smejj.com — Modell-Einkäufer (Nr. 34): die EMPFEHLUNGS-REGEL ist der
// Prüfgegenstand. Ein Einkäufer, der bei jedem Windhauch das Modell wechseln
// will, richtet mehr Schaden an als einer, der gar nicht misst: jeder
// Wechsel verändert Verhalten, Prompts und Kosten.
import test from "node:test";
import assert from "node:assert/strict";

import {
  PROBEN,
  sseZuText,
  messeModell,
  bewerteEinkauf,
  laufModellEinkauf
} from "../control-server/src/autopilots/modellEinkaeufer.js";

const messung = (modell, treffer, medianMs) => ({ modell, treffer, gesamt: 6, medianMs, einzel: [] });

test("Gleichstand gehoert dem Amtsinhaber — kein Wechsel ohne echten Vorsprung", () => {
  const u = bewerteEinkauf([messung("champ", 5, 900), messung("neu", 5, 800)], "champ");
  assert.equal(u.empfehlung, null, "12 % schneller ist kein Grund fuer einen Modellwechsel");
  assert.match(u.meldung, /champ bleibt vorn/);
});

test("MEHR Treffer schlagen den Amtsinhaber", () => {
  const u = bewerteEinkauf([messung("champ", 4, 500), messung("neu", 6, 1500)], "champ");
  assert.equal(u.empfehlung, "neu", "Qualitaet schlaegt Geschwindigkeit");
  assert.match(u.meldung, /EMPFEHLUNG: Wechsel zu neu/);
});

test("Gleich gut und DEUTLICH schneller (<=60 %) rechtfertigt den Wechsel", () => {
  const u = bewerteEinkauf([messung("champ", 5, 2000), messung("neu", 5, 1000)], "champ");
  assert.equal(u.empfehlung, "neu");
});

test("Die Meldung traegt die Zahlen ALLER Modelle — nachpruefbar, nicht nur ein Urteil", () => {
  const u = bewerteEinkauf([messung("a", 6, 700), messung("b", 3, 400)], "a");
  assert.match(u.meldung, /a 6\/6 700ms/);
  assert.match(u.meldung, /b 3\/6 400ms/);
});

test("sseZuText setzt den Bruecken-Strom korrekt zusammen und ignoriert Muell", () => {
  const roh = [
    'data: {"choices":[{"delta":{"content":"Can"}}]}',
    "event: status",
    'data: {"choices":[{"delta":{"content":"berra"}}]}',
    "data: [DONE]"
  ].join("\n");
  assert.equal(sseZuText(roh), "Canberra");
});

test("Jede Probe erkennt richtige und falsche Antworten", () => {
  const richtige = {
    wissen: "Canberra", rechnen: "391",
    code: "function summe(a, b) { return a + b; }",
    logik: "Carl", deutsch: "Häuser", disziplin: '{"bereit": true}'
  };
  for (const p of PROBEN) {
    assert.equal(p.pruefe(richtige[p.id]), true, `${p.id}: richtige Antwort abgelehnt`);
    assert.equal(p.pruefe("Ich bin ein Sprachmodell und kann dazu nichts sagen."), false,
      `${p.id}: Ausweich-Antwort faelschlich akzeptiert`);
  }
});

test("messeModell: HTTP-Fehler und leere Antworten sind KEIN Treffer", async () => {
  const kaputt = await messeModell("x", {
    token: "t",
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" })
  });
  assert.equal(kaputt.treffer, 0);
  assert.equal(kaputt.einzel[0].grund, "HTTP 503");

  const leer = await messeModell("x", {
    token: "t",
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "data: [DONE]" })
  });
  assert.equal(leer.treffer, 0);
  assert.equal(leer.einzel[0].grund, "leere Antwort");
});

test("laufModellEinkauf: ohne Secret ehrlich rot; Voll-Ausfall der Kette ebenfalls", async () => {
  const ohne = await laufModellEinkauf({ env: {} });
  assert.equal(ohne.ok, false);
  assert.match(ohne.meldung, /SMEJJ_SESSION_SECRET/);

  const tot = await laufModellEinkauf({
    env: { SMEJJ_SESSION_SECRET: "geheim-lang-genug-fuer-die-probe" },
    holeModelle: async () => ({ modelle: ["a", "b"], champion: "a" }),
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" })
  });
  assert.equal(tot.ok, false, "wenn KEIN Modell eine Probe schafft, ist die Kette kaputt — nicht die Modelle");
  assert.match(tot.meldung, /Kette prüfen/);
});
