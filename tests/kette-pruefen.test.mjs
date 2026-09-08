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
  bewerteRueckstand,
  bewerteSicherung
} from "../scripts/diagnose/kette-pruefen.mjs";

const JETZT = Date.parse("2026-09-08T13:00:00Z");
const vorStunden = (h) => new Date(JETZT - h * 3600 * 1000).toISOString();

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

// --- die taegliche Sicherung: zwei Wege, EIN Urteil ------------------------

test("GESUND: die Action laeuft — dann ist der Ersatzweg egal", () => {
  assert.equal(bewerteSicherung("erfolg", null, JETZT), "gruen");
});

test("LAGE 08.09.: Action rot, Mac-Termin frisch — grau, nicht rot", () => {
  // Der Code IST gesichert. Wer hier stur die Action bewertet, zeigt dauerhaft
  // Rot, und an dauerndes Rot gewoehnt man sich — bis man den echten Ausfall
  // ebenfalls uebersieht.
  assert.equal(
    bewerteSicherung("fehler", { ergebnis: "ok", stand: vorStunden(2) }, JETZT),
    "grau"
  );
});

test("LAGE 08.09.: grau, NICHT gruen — der Mac muss dafuer laufen", () => {
  // Der Vorbehalt darf nicht unsichtbar werden, sonst haelt man einen
  // Ersatzweg fuer einen Dauerzustand.
  assert.notEqual(
    bewerteSicherung("fehler", { ergebnis: "ok", stand: vorStunden(2) }, JETZT),
    "gruen"
  );
});

test("KRANK: Mac war zwei Tage aus — ueberfaellig ist rot", () => {
  assert.equal(
    bewerteSicherung("fehler", { ergebnis: "ok", stand: vorStunden(48) }, JETZT),
    "rot"
  );
});

test("GESUND: 30 Stunden liegen noch in der Frist (zugeklappter Mac)", () => {
  // Die Reserve faengt eine Nacht ohne Strom ab, ohne einen Ausfall zu
  // verschweigen. Zu knapp bemessene Fristen erzeugen Fehlalarme.
  assert.equal(
    bewerteSicherung("fehler", { ergebnis: "ok", stand: vorStunden(30) }, JETZT),
    "grau"
  );
});

test("KRANK: beide Wege tot — NICHTS sichert mehr", () => {
  assert.equal(bewerteSicherung("fehler", null, JETZT), "rot");
  assert.equal(
    bewerteSicherung("fehler", { ergebnis: "fehler", stand: vorStunden(1) }, JETZT),
    "rot"
  );
});

test("KRANK: kaputter Zeitstempel gilt nicht als frisch", () => {
  // Sonst rettet ein beschaedigtes zustand.json die Meldung auf grau, obwohl
  // seit Wochen nichts gesichert wurde.
  assert.equal(bewerteSicherung("fehler", { ergebnis: "ok", stand: "gestern" }, JETZT), "rot");
  assert.equal(bewerteSicherung("fehler", { ergebnis: "ok" }, JETZT), "rot");
});
