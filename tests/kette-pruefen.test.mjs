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
  bewerteSicherung,
  bewerteE2Sicherung,
  bewerteSaladLauf
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

// --- der dritte Sicherungsort: IDrive e2 -----------------------------------

test("GESUND: der Code liegt in e2 — frisch abgelegt oder schon da", () => {
  assert.equal(bewerteE2Sicherung("39 Zweige gespiegelt; e2: Code-Sicherung: 8.6 MB nach e2 gelegt (…)."), "gruen");
  assert.equal(bewerteE2Sicherung("39 Zweige gespiegelt; e2: Code-Sicherung: heutiger Stand liegt bereits in e2 (2)."), "gruen");
});

test("KRANK: der e2-Schritt ist still ausgefallen", () => {
  // Genau so sah es aus, als launchd node nicht fand: Codeberg gruen, e2 tot,
  // Gesamtlauf Exit 0. Ohne eigene Zeile faellt das niemandem auf.
  assert.equal(bewerteE2Sicherung("39 Zweige gespiegelt; e2: node: command not found"), "rot");
  assert.equal(bewerteE2Sicherung("39 Zweige gespiegelt; e2: Code konnte nicht ausgepackt werden"), "rot");
  assert.equal(bewerteE2Sicherung("39 Zweige gespiegelt; e2: Code-Sicherung fehlgeschlagen: timeout"), "rot");
});

test("NICHT MESSBAR: aeltere Meldung ohne e2-Teil, und fehlender Zugang", () => {
  // Eine Meldung aus der Zeit vor dem e2-Schritt darf keinen Fehlalarm geben.
  assert.equal(bewerteE2Sicherung("39 Zweige und alle Marken gespiegelt"), "grau");
  assert.equal(bewerteE2Sicherung(""), "grau");
  assert.equal(bewerteE2Sicherung("e2: Code-Sicherung: kein e2-Zugang gesetzt (lokal)"), "grau");
});

// --- Salad: der einzige Posten, der WAEHREND er laeuft Geld kostet ---------

const vorStd = (h) => new Date(JETZT - h * 3600 * 1000).toISOString();

test("GESUND: nichts laeuft — keine laufenden Kosten", () => {
  const g = [{ name: "smejj-training", status: "stopped" }, { name: "con-job", status: "stopped" }];
  assert.equal(bewerteSaladLauf(g, JETZT).zustand, "gruen");
});

test("GESUND: ein Training laeuft seit zwei Stunden — dafuer ist Salad da", () => {
  // Die Lage am 08.09.: smejj-training lief legitim. Ein Waechter, der jeden
  // laufenden Worker anschwaerzt, macht Salad unbenutzbar.
  const g = [{ name: "smejj-training", status: "running", start: vorStd(2), neustart: "never" }];
  const u = bewerteSaladLauf(g, JETZT);
  assert.equal(u.zustand, "gruen");
  assert.match(u.text, /smejj-training/);
});

test("KRANK: ein Worker laeuft seit Tagen — vergessen und teuer", () => {
  const g = [{ name: "smejj-llm-qwen3", status: "running", start: vorStd(50), neustart: "never" }];
  const u = bewerteSaladLauf(g, JETZT);
  assert.equal(u.zustand, "rot");
  assert.match(u.text, /KOSTEN/);
});

test("KRANK: die Kostenschleife — die Gruppe startet sich selbst neu", () => {
  // Am 07.09. gemessen: Salad startete fertige Jobs wieder und wieder. Bei
  // restart_policy "always" endet das nie von selbst.
  const g = [{ name: "smejj-lora-trainer-batch", status: "running", start: vorStd(1), neustart: "always" }];
  const u = bewerteSaladLauf(g, JETZT);
  assert.equal(u.zustand, "rot");
  assert.match(u.text, /startet sich selbst neu/);
});

test("GESUND: knapp unter der Frist bleibt gruen", () => {
  // 12 Stunden sind bewusst grosszuegig: Trainings laufen lange, und ein
  // Fehlalarm hier wuerde die ganze Zeile entwerten.
  const g = [{ name: "smejj-training", status: "running", start: vorStd(11), neustart: "never" }];
  assert.equal(bewerteSaladLauf(g, JETZT).zustand, "gruen");
});

test("KRANK: fehlende Startzeit macht eine Schleifen-Gruppe nicht harmlos", () => {
  const g = [{ name: "x", status: "running", neustart: "on_failure" }];
  assert.equal(bewerteSaladLauf(g, JETZT).zustand, "rot");
});

test("KRANK: kaputter Zeitstempel gilt nicht als frisch", () => {
  // Sonst rettet ein beschaedigtes zustand.json die Meldung auf grau, obwohl
  // seit Wochen nichts gesichert wurde.
  assert.equal(bewerteSicherung("fehler", { ergebnis: "ok", stand: "gestern" }, JETZT), "rot");
  assert.equal(bewerteSicherung("fehler", { ergebnis: "ok" }, JETZT), "rot");
});
