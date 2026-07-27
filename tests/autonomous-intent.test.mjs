// smejj.com — Regressionstest fuer die Absichtserkennung im Startfeld.
//
// Kernzusage: Ein Auftrag im Startfeld darf die Startseite niemals verlassen.
// Der Befund vom 27.07.2026 ("geh browser iMild.com teste ob alles fehlerfrei ist?"
// sprang auf /automation) ist hier fest verdrahtet und darf nicht wiederkehren.

import test from "node:test";
import assert from "node:assert/strict";
import { classifyAutonomousRequest, routeAutonomousRequest } from "../public/autonomous-intent.js";

const REPORTED_TASK = "geh browser iMild.com teste ob alles fehlerfrei ist?";

function runRoute(task) {
  const calls = { goToView: [], events: [] };
  const eventTarget = new EventTarget();
  eventTarget.addEventListener("smejj:browser-request", (event) => calls.events.push(["browser", event.detail]));
  eventTarget.addEventListener("smejj:autonomous-request", (event) => calls.events.push(["autonomous", event.detail]));
  const result = routeAutonomousRequest({
    task,
    output: { textContent: "" },
    goToView: (view) => calls.goToView.push(view),
    eventTarget
  });
  return { result, ...calls };
}

test("gemeldeter Auftrag wechselt die Ansicht nicht mehr", () => {
  const { result, goToView } = runRoute(REPORTED_TASK);
  assert.equal(result, false, "muss false liefern, damit app.js im Gespraechsfaden antwortet");
  assert.deepEqual(goToView, [], "kein Ansichtswechsel auf der Startseite");
});

test("Adresse ohne Schema wird erkannt und oeffnet die Browser-Leiste", () => {
  const { events } = runRoute(REPORTED_TASK);
  assert.deepEqual(events.map(([name]) => name), ["browser"]);
  assert.equal(events[0][1].url, "https://imild.com/");
  assert.equal(events[0][1].task, REPORTED_TASK);
});

test("autonomer Lauf startet nicht von selbst", () => {
  const { events } = runRoute("teste die Seite bis alles funktioniert");
  assert.deepEqual(events, [], "ohne Klick darf kein autonomer Lauf ausgeloest werden");
});

test("Klassifizierung des gemeldeten Auftrags bleibt korrekt", () => {
  const request = classifyAutonomousRequest(REPORTED_TASK);
  assert.ok(request);
  assert.equal(request.executionMode, "analyze");
  assert.equal(request.uiChange, true);
  assert.equal(request.previewUrl, "https://imild.com/");
});

test("vollstaendige Adressen bleiben unveraendert nutzbar", () => {
  assert.equal(classifyAutonomousRequest("pruefe die Seite https://smejj.com/automation").previewUrl, "https://smejj.com/automation");
  assert.equal(classifyAutonomousRequest("pruefe die Seite http://smejj.com/status").previewUrl, "https://smejj.com/status", "http wird auf https gehoben");
});

test("Zugangsdaten in der Adresse werden abgewiesen", () => {
  assert.equal(classifyAutonomousRequest("oeffne die Seite https://user:pass@smejj.com").previewUrl, "");
});

test("Dateinamen und Satzreste gelten nicht als Web-Ziel", () => {
  const cases = [
    "pruefe die Datei app.js auf Fehler",
    "lies die Datei index.html im Repo",
    "teste das Modell smejj 1.0 im Browser",
    "teste die Seite morgen.Danach berichte mir"
  ];
  for (const task of cases) {
    const request = classifyAutonomousRequest(task);
    assert.ok(request, `Auftrag sollte erkannt werden: ${task}`);
    assert.equal(request.previewUrl, "", `darf kein Web-Ziel sein: ${task}`);
  }
});

test("gewoehnliche Fragen bleiben normale Chat-Anfragen", () => {
  assert.equal(classifyAutonomousRequest("wie spaet ist es"), null);
  assert.equal(classifyAutonomousRequest("hallo"), null);
  assert.equal(runRoute("wie spaet ist es").result, false);
});
