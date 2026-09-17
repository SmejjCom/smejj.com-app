// smejj.com — Diktat: Start -> Stopp -> Start -> Stopp beliebig oft (Betreiber-Befund
// iPhone-PWA 17.09.2026: "nach Stoppen und erneutem Starten wird Sprache teilweise
// nicht mehr geschrieben"). Attrappe der Web-Speech-Erkennung, kein Mikrofon, kein Netz.
// Standalone: node --test tests/composer-dictation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createDictation } from "../public/composer-dictation.js";

/** Attrappe: jede Instanz merkt sich ihren Zustand; der Test feuert die Ereignisse. */
class FakeRecognition {
  static alle = [];
  constructor() {
    this.gestartet = 0;
    this.gestoppt = 0;
    this.abgebrochen = 0;
    this.laeuft = false;
    this.wirftBeimStart = false;
    FakeRecognition.alle.push(this);
  }
  start() {
    if (this.laeuft || this.wirftBeimStart) throw new Error("InvalidStateError");
    this.laeuft = true;
    this.gestartet += 1;
  }
  stop() { this.gestoppt += 1; }
  abort() { this.abgebrochen += 1; this.laeuft = false; }
  // Ergebnis-Ereignis wie im Browser: die GANZE Liste der Instanz.
  ergebnis(liste) {
    const results = liste.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ resultIndex: 0, results });
  }
  ende() { this.laeuft = false; this.onend?.(); }
  fehler(error) { this.onerror?.({ error }); }
}

function bau({ ohr = null, textVorher = "" } = {}) {
  FakeRecognition.alle = [];
  const input = { value: textVorher };
  const sichtbar = [];
  const toasts = [];
  const wecker = [];
  let jetzt = 10_000;
  const d = createDictation({
    getInput: () => input,
    notifyInputChanged: () => {},
    showToast: (t) => toasts.push(t),
    RecognitionCtor: FakeRecognition,
    lang: "de-DE",
    speechSupported: () => true,
    setVisual: (an) => sichtbar.push(an),
    serverOhr: ohr,
    warte: (fn, ms) => { wecker.push({ fn, ms }); return wecker.length; },
    uhr: () => jetzt
  });
  const tick = (ms) => { jetzt += ms; };
  const weckerAb = () => { const w = wecker.splice(0); for (const { fn } of w) fn(); };
  return { d, input, sichtbar, toasts, wecker, weckerAb, tick, inst: () => FakeRecognition.alle };
}

test("Grundlauf: Zwischenergebnis, finales Ergebnis, Stopp — Text steht im Feld", () => {
  const { d, input, sichtbar, inst } = bau();
  d.toggle();
  assert.equal(inst().length, 1);
  assert.equal(sichtbar.at(-1), true);
  inst()[0].ergebnis([["wie ist das", false]]);
  assert.equal(input.value, "wie ist das");
  inst()[0].ergebnis([["wie ist das Wetter", true]]);
  assert.equal(input.value, "wie ist das Wetter ");
  d.toggle();
  assert.equal(sichtbar.at(-1), false);
  assert.equal(inst()[0].gestoppt, 1, "stop() statt abort(): das letzte Stueck darf nachkommen");
  assert.equal(d.isActive(), false);
});

test("FEHLER (1) nachgestellt: das onend der alten Instanz feuert erst NACH dem Neustart — sie darf nicht wieder anlaufen und die neue Sitzung nicht abwuergen", () => {
  const { d, input, sichtbar, tick, inst } = bau();
  d.toggle();
  inst()[0].ergebnis([["erster Satz", true]]);
  d.toggle(); // Stopp
  tick(500);
  d.toggle(); // sofort wieder Start — die alte Instanz hat ihr onend noch nicht gemeldet
  assert.equal(inst().length, 2, "neue Sitzung = frische Instanz");
  assert.equal(inst()[0].abgebrochen, 1, "Nachzuegler wird hart beendet, damit er das Feld nicht ueberschreibt");
  inst()[0].ende(); // spaetes onend der ALTEN Instanz
  assert.equal(inst()[0].gestartet, 1, "alte Instanz wird NICHT neu gestartet");
  assert.equal(d.isActive(), true, "die neue Sitzung lebt weiter");
  assert.equal(sichtbar.at(-1), true, "Mikrofon bleibt in Logofarbe");
  inst()[1].ergebnis([["zweiter Satz", true]]);
  assert.equal(input.value, "erster Satz zweiter Satz ");
});

test("FEHLER (2) nachgestellt: WebKit meldet nach einer Pause die ganze Liste erneut (resultIndex 0) — keine Dopplung, kein Verlust", () => {
  const { d, input, tick, inst } = bau();
  d.toggle();
  const a = inst()[0];
  a.ergebnis([["hallo", false]]);
  a.ergebnis([["hallo Welt", false]]);
  a.ergebnis([["hallo Welt", true]]);
  a.ergebnis([["hallo Welt", true], ["wie", false]]);
  assert.equal(input.value, "hallo Welt wie");
  a.ergebnis([["hallo Welt", true], ["wie geht es", true]]);
  assert.equal(input.value, "hallo Welt wie geht es ");
  // Sprechpause: Instanz endet, frische Instanz beginnt mit leerer Liste
  tick(3000);
  a.ende();
  assert.equal(inst().length, 2, "nach der Pause eine FRISCHE Instanz");
  const b = inst()[1];
  assert.equal(b.gestartet, 1);
  b.ergebnis([["dir", false]]);
  assert.equal(input.value, "hallo Welt wie geht es dir");
  b.ergebnis([["dir heute", true]]);
  assert.equal(input.value, "hallo Welt wie geht es dir heute ");
  d.toggle();
});

test("Start -> Stopp -> Start -> Stopp viermal hintereinander: jede Runde schreibt, nichts geht verloren", () => {
  const { d, input, tick, inst } = bau();
  const erwartet = [];
  for (let runde = 1; runde <= 4; runde += 1) {
    d.toggle();
    const rec = inst().at(-1);
    assert.equal(rec.gestartet, 1, `Runde ${runde}: frische Instanz laeuft`);
    rec.ergebnis([[`Satz ${runde}`, false]]);
    rec.ergebnis([[`Satz ${runde}`, true]]);
    erwartet.push(`Satz ${runde}`);
    assert.equal(input.value, `${erwartet.join(" ")} `);
    d.toggle();
    tick(400);
    rec.ende(); // onend nach dem Stopp — harmlos
    assert.equal(rec.gestartet, 1, `Runde ${runde}: kein Neustart nach dem Stopp`);
  }
  assert.equal(inst().length, 4);
  assert.equal(d.isActive(), false);
});

test("spaetes finales Ergebnis NACH dem Stopp-Klick wird noch geschrieben", () => {
  const { d, input, inst } = bau();
  d.toggle();
  inst()[0].ergebnis([["bis gleich", false]]);
  d.toggle();
  inst()[0].ergebnis([["bis gleich", true]]);
  assert.equal(input.value, "bis gleich ");
  inst()[0].ende();
  assert.equal(inst().length, 1, "nach dem Stopp keine neue Instanz");
});

test("Text im Feld vor dem Diktat bleibt stehen, das Diktat haengt sich an", () => {
  const { d, input, inst } = bau({ textVorher: "Notiz:  " });
  d.toggle();
  inst()[0].ergebnis([["Milch kaufen", true]]);
  assert.equal(input.value, "Notiz: Milch kaufen ");
});

test("Sicherheitsnetz: stirbt die Erkennung fuenfmal sofort, endet die Sitzung sauber (Mikrofon aus) statt heiss zu schleifen", () => {
  const { d, sichtbar, weckerAb, tick, inst } = bau();
  d.toggle();
  for (let i = 0; i < 5; i += 1) {
    tick(50);
    inst().at(-1).ende();
    weckerAb();
  }
  assert.equal(d.isActive(), false);
  assert.equal(sichtbar.at(-1), false);
  assert.ok(inst().length <= 6, `hoechstens 6 Instanzen, waren ${inst().length}`);
});

test("start() wirft (Vorgaenger noch belegt): ein spaeterer Versuch, dann laeuft es", () => {
  const { d, weckerAb, inst } = bau();
  FakeRecognition.prototype.wirftBeimStart = true;
  d.toggle();
  FakeRecognition.prototype.wirftBeimStart = false;
  assert.equal(d.isActive(), true);
  weckerAb();
  assert.equal(inst().at(-1).gestartet, 1);
  d.toggle();
});

test("Mikrofon verweigert: Sitzung endet mit Hinweis", () => {
  const { d, toasts, sichtbar, inst } = bau();
  d.toggle();
  inst()[0].fehler("not-allowed");
  assert.equal(d.isActive(), false);
  assert.equal(sichtbar.at(-1), false);
  assert.match(toasts[0], /Mikrofon-Zugriff verweigert/);
});

test("Ohr-Rueckfall: Web-Speech taub -> Ohr-Text landet im Feld; Web-Speech lieferte -> Aufnahme verworfen", async () => {
  const ohr = { starts: 0, cancels: 0, finishes: 0, start() { this.starts += 1; }, cancel() { this.cancels += 1; }, finish() { this.finishes += 1; return Promise.resolve(" Ohr hoerte dies "); } };
  const { d, input, inst } = bau({ ohr });
  d.toggle();
  d.toggle();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ohr.finishes, 1);
  assert.equal(input.value, "Ohr hoerte dies ");
  d.toggle();
  inst().at(-1).ergebnis([["gehoert", true]]);
  d.toggle();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ohr.cancels, 1, "mit Web-Speech-Text wird die Aufnahme verworfen");
  assert.equal(input.value, "Ohr hoerte dies gehoert ");
});

test("Ohr-Text kommt erst, als die naechste Sitzung schon laeuft: er rueckt davor, nichts wird ueberschrieben", async () => {
  let loese;
  const ohr = { start() {}, cancel() {}, finish() { return new Promise((r) => { loese = r; }); } };
  const { d, input, inst } = bau({ ohr });
  d.toggle();
  d.toggle(); // taub -> Ohr gefragt
  d.toggle(); // neue Sitzung
  inst().at(-1).ergebnis([["neu", false]]);
  loese("alt");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(input.value, "alt neu");
  inst().at(-1).ergebnis([["neu und fertig", true]]);
  assert.equal(input.value, "alt neu und fertig ");
  d.toggle();
});
