// smejj.com — Werkstatt-Autopilot Station 1 (Sammeln): der Kern ohne Netz.
//
// Geprueft wird vor allem die eine Eigenschaft, an der ein Sammler zur
// Attrappe wird: Eine stumme Quelle darf NIE wie "nichts zu tun" aussehen.
import test from "node:test";
import assert from "node:assert/strict";

import { baueBacklog, alsMarkdown, STUFEN } from "../scripts/werkstatt/sammle-backlog.mjs";

const AMPEL_OK = {
  ok: true,
  vorfaelle: [
    { id: "brueckenwaechter", name: "06. Bruecken-Waechter", art: "rot", von: "2026-08-12T08:01:00.000Z", bis: null, grund: "Bruecke AUSGEFALLEN" },
    { id: "angelina-autopilot", name: "31. Angelina", art: "gelb", von: "2026-08-12T09:00:00.000Z", bis: null, grund: "Verspaetet" },
    { id: "codeberg-spiegel", name: "02. Spiegel", art: "rot", von: "2026-08-11T00:00:00.000Z", bis: "2026-08-11T01:00:00.000Z", grund: "behoben" }
  ],
  autopiloten: [
    { id: "deep-research", name: "08. Deep Research", ampel: "grau", ampelGrund: "Geplant — noch nicht eingebunden." },
    { id: "qualitaetsmessung", name: "01. Qualitaet", ampel: "gruen", ampelGrund: "puenktlich" }
  ]
};

test("Sammeln: echte Befunde werden nach Dringlichkeit sortiert", () => {
  const b = baueBacklog({
    ampel: AMPEL_OK,
    tests: { ok: true, rote: ["tests/rag-regelfragen.test.mjs"] },
    mails: { ok: true, gescheitert: 3, zeitraumTage: 14 }
  });

  assert.equal(b.stummeQuellen.length, 0);
  assert.deepEqual(b.gesammeltAus, ["Autopiloten-Ampel", "Pruefsuite", "Mail-Zustellprotokoll"]);

  // Reihenfolge: Ausfall (1) vor Regression (2) vor Verspaetung (3) vor
  // Zustellung (4) vor Ausbau (5).
  assert.deepEqual(b.aufgaben.map((a) => a.stufe), [
    STUFEN.AUSFALL, STUFEN.REGRESSION, STUFEN.VERSPAETUNG, STUFEN.ZUSTELLUNG, STUFEN.AUSBAU
  ]);
  assert.equal(b.aufgaben[0].betrifft, "brueckenwaechter");
  assert.equal(b.aufgaben[0].seit, "2026-08-12T08:01:00.000Z");
});

test("Sammeln: ein GESCHLOSSENER Vorfall ist keine Aufgabe mehr", () => {
  const b = baueBacklog({ ampel: AMPEL_OK });
  assert.equal(b.aufgaben.some((a) => a.betrifft === "codeberg-spiegel"), false,
    "was wieder laeuft, gehoert nicht ins Backlog");
});

test("Sammeln: gruene Autopiloten erzeugen keine Ausbau-Aufgabe", () => {
  const b = baueBacklog({ ampel: AMPEL_OK });
  const ausbau = b.aufgaben.filter((a) => a.stufe === STUFEN.AUSBAU).map((a) => a.betrifft);
  assert.deepEqual(ausbau, ["deep-research"]);
});

test("EHRLICHKEIT: eine stumme Quelle ist kein leeres Backlog", () => {
  // Der entscheidende Fall. Faellt die Ampel aus, darf der Bericht NICHT
  // aussehen wie "alles erledigt" — sonst ist der Sammler eine Attrappe.
  const b = baueBacklog({
    ampel: { ok: false, grund: "HTTP 503" },
    tests: { ok: false, grund: "nicht angefordert" },
    mails: { ok: false, grund: "Token fehlt" }
  });
  assert.equal(b.aufgaben.length, 0);
  assert.equal(b.stummeQuellen.length, 3);
  assert.equal(b.gesammeltAus.length, 0);

  const text = alsMarkdown(b, "2026-08-12T12:00:00.000Z");
  assert.ok(text.includes("STUMME QUELLEN"), "der Bericht muss den Ausfall benennen");
  assert.ok(text.includes("HTTP 503"), "der Grund gehoert in den Bericht");
  assert.ok(text.includes("ungeprueft, nicht erledigt"), "die Deutung muss dastehen");
  assert.equal(/Keine Aufgaben gefunden\.\s*$/.test(text), false,
    "ein leeres Backlog darf nicht das letzte Wort sein, wenn Quellen stumm waren");
});

test("Bericht: nennt die Quellen, aus denen wirklich gesammelt wurde", () => {
  const b = baueBacklog({ ampel: AMPEL_OK });
  const text = alsMarkdown(b, "2026-08-12T12:00:00.000Z");
  assert.ok(text.includes("Quellen, die geantwortet haben:** Autopiloten-Ampel"));
  assert.ok(text.includes("Ausfall: 06. Bruecken-Waechter"));
});
