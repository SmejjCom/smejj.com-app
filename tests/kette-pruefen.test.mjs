// Waechter-TUEV fuer die Verbindungs-Landkarte: kranke UND gesunde Proben.
//
// Der Anlass (2026-09-08): der Codeberg-Spiegel lief drei Tage lang jeden Tag
// rot ("Secret CODEBERG_TOKEN fehlt — es wurde NICHTS gesichert"), und
// niemand hat es bemerkt. Die Landkarte soll genau solche stillen Risse
// melden. Ein Waechter, der nur gesunde Proben gesehen hat, faellt aber
// zuverlaessig erst dann aus, wenn er gebraucht wird — darum steht hier beides.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bewertePagesAdressen,
  bewerteHealth,
  bewerteRueckstand
} from "../scripts/diagnose/kette-pruefen.mjs";

test("GESUND: alle vier GitHub-Pages-Adressen", () => {
  assert.equal(
    bewertePagesAdressen(["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"]),
    "gruen"
  );
});

test("GESUND: Pages liefert nicht immer alle vier — zwei genuegen", () => {
  // Sonst schlaegt die Landkarte je nach Anschluss zufaellig an, und ein
  // Waechter mit Fehlalarmen wird nach dem dritten Mal weggeklickt.
  assert.equal(bewertePagesAdressen(["185.199.108.153", "185.199.111.153"]), "gruen");
});

test("KRANK: die Domain zeigt woanders hin", () => {
  // Genau der Fall, in dem smejj.com fuer alle Besucher weg waere.
  assert.equal(bewertePagesAdressen(["76.76.21.21"]), "rot");
  assert.equal(bewertePagesAdressen([]), "rot");
});

test("KRANK: eine einzige Pages-Adresse reicht nicht als Beweis", () => {
  assert.equal(bewertePagesAdressen(["185.199.108.153"]), "rot");
});

test("GESUND: Control-Server meldet ok", () => {
  assert.equal(bewerteHealth(200, { ok: true, activeModelId: "glm-5-2" }), "gruen");
});

test("KRANK: 200, aber ok=false — der Server lebt und arbeitet trotzdem nicht", () => {
  assert.equal(bewerteHealth(200, { ok: false }), "rot");
});

test("KRANK: 502/404 vom Weg zum Control-Server", () => {
  assert.equal(bewerteHealth(502, null), "rot");
  assert.equal(bewerteHealth(404, {}), "rot");
});

test("KRANK: HTML statt JSON — Antwort kommt von der falschen Stelle", () => {
  // So sah es aus, als /api/health auf smejj.com die statische 404-Seite traf:
  // HTTP 200, aber kein Server dahinter.
  assert.equal(bewerteHealth(200, null), "rot");
});

test("GESUND: kein Zweig im Rueckstand", () => {
  assert.equal(bewerteRueckstand([]), "gruen");
});

test("KRANK: EIN zurueckliegender Zweig genuegt fuer rot", () => {
  // Eine Sicherung, die 39 von 40 Zweigen hat, ist keine Sicherung — und
  // genau so sah der Spiegel am 08.09. aus, bevor er nachgezogen wurde.
  assert.equal(bewerteRueckstand(["feature/design-v11 (122 Commits)"]), "rot");
});
