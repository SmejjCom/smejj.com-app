// smejj.com — Regressionsschutz Geraetebefund 23.09.2026 (Betreiber, echtes iPhone 17 Pro Max,
// Apple-Testversion 4). Drei Fehler, jeder hier nachgestellt — faellt einer dieser Tests, ist der
// Befund zurueck. Schutz nach Betreiber-Auftrag Punkt 19/20: nicht ohne schriftliche Freigabe
// aendern, entfernen oder abschwaechen.
//   (1) Diktat + Sprachmodus: WebKit verweigert die Spracherkennung ("service-not-allowed"),
//       das Mikrofon ist frei -> das eigene Ohr uebernimmt, statt aufzugeben.
//   (2) Hier ist dein Bild: "?" — das angezeigte Bild haengt nach dem Speichern nicht am Netz.
//   (3) Code-Bereich: dunkle Flaeche oben — der Halter ist der einzige Scroller.
// Standalone: node --test tests/geraetebefund-2026-09-23.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDictation } from "../public/composer-dictation.js";
import { createServerEar } from "../public/voice-ear.js";
import { verdrahteOhrSolo } from "../public/voice-ohr-solo.js";
import {
  lagereMedienAus, rehydriereMedien, entwaessere, ADRESSE_ATTRIBUT,
  reaktionAufBildFehler, FEHLENDES_BILD, UNVOLLSTAENDIGES_BILD, LEERES_BILD
} from "../public/chat-medien.js";
import { REGELN } from "../public/mobil-dock.js";

class FakeRecognition {
  static alle = [];
  constructor() { this.laeuft = false; this.gestoppt = 0; this.abgebrochen = 0; FakeRecognition.alle.push(this); }
  start() { if (this.laeuft) throw new Error("InvalidStateError"); this.laeuft = true; }
  stop() { this.gestoppt += 1; }
  abort() { this.abgebrochen += 1; this.laeuft = false; }
  ergebnis(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
  ende() { this.laeuft = false; this.onend?.(); }
  fehler(error) { this.onerror?.({ error }); }
}

function diktat({ ohr }) {
  FakeRecognition.alle = [];
  const input = { value: "" };
  const toasts = [];
  const d = createDictation({
    getInput: () => input, notifyInputChanged: () => {}, showToast: (t) => toasts.push(t),
    RecognitionCtor: FakeRecognition, lang: "de-DE", speechSupported: () => true,
    setVisual: () => {}, serverOhr: ohr, warte: () => 0, uhr: () => 10_000
  });
  return { d, input, toasts, inst: () => FakeRecognition.alle };
}

function attrappenOhr(text = "hallo welt") {
  const ohr = { starts: 0, finishes: [], cancels: 0, aktiv: false,
    start() { ohr.starts += 1; ohr.aktiv = true; },
    nimmtAuf: () => ohr.aktiv,
    cancel() { ohr.cancels += 1; ohr.aktiv = false; },
    finish: async (optionen) => { ohr.finishes.push(optionen); ohr.aktiv = false; return text; } };
  return ohr;
}

test("(1) Diktat: service-not-allowed bei freiem Mikrofon -> Sitzung laeuft als Ohr weiter, Text kommt beim Stopp", async () => {
  const ohr = attrappenOhr("guten morgen");
  const { d, input, toasts, inst } = diktat({ ohr });
  d.toggle();
  inst()[0].fehler("service-not-allowed");
  assert.equal(d.isActive(), true, "das Diktat darf NICHT sofort enden");
  inst()[0].ende();
  assert.equal(inst().length, 1, "keine neue Web-Speech-Instanz im Ohr-Modus (sonst Endlosschleife)");
  assert.ok(!toasts.some((t) => /verweigert/.test(t)), "keine falsche Verweigerungs-Meldung");
  d.toggle();
  await new Promise((r) => setImmediate(r));
  assert.equal(input.value.trim(), "guten morgen");
  assert.equal(ohr.finishes[0]?.budgetMs, 30000, "reines Ohr wartet laenger auf den Text");
});

test("(1) Diktat: ist das Mikrofon selbst gesperrt (Ohr nimmt nicht auf), endet es sauber mit Hinweis", () => {
  const ohr = attrappenOhr();
  ohr.nimmtAuf = () => false;
  const { d, toasts, inst } = diktat({ ohr });
  d.toggle();
  inst()[0].fehler("not-allowed");
  assert.equal(d.isActive(), false);
  assert.ok(toasts.some((t) => /verweigert/.test(t)));
});

test("(1) Diktat-Stresstest: 12x Start -> sprechen -> Stopp -> Start, jedes Mal Text, nie haengend", async () => {
  const { d, input, inst } = diktat({ ohr: attrappenOhr("") });
  for (let runde = 1; runde <= 12; runde += 1) {
    d.toggle();
    assert.equal(d.isActive(), true, `Runde ${runde}: Start`);
    const rec = inst().at(-1);
    assert.equal(rec.laeuft, true, `Runde ${runde}: Erkennung laeuft`);
    rec.ergebnis(`wort${runde}`);
    d.toggle();
    assert.equal(d.isActive(), false, `Runde ${runde}: Stopp`);
    rec.ende();
  }
  await new Promise((r) => setImmediate(r));
  for (let runde = 1; runde <= 12; runde += 1) assert.match(input.value, new RegExp(`wort${runde}\\b`));
});

test("(1) Sprachmodus: Wache uebernimmt bei service-not-allowed aufs eigene Ohr und gibt das Parallel-Ohr frei", () => {
  const altNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } });
  try {
    const rufe = [];
    const state = { voiceRecognition: null, ohrSoloAktiv: false, voiceFailStreak: 0 };
    const solo = verdrahteOhrSolo({
      createServerEar: () => ({ start() {}, cancel() {}, finish: async () => "" }),
      url: "x", state, earAlive: () => true, earCancel: () => rufe.push("earCancel"),
      setStatus() {}, setTranskript() {}, senden() {}, fallback: (t) => rufe.push("fallback:" + t),
      stopInterrupt() {}, stopBarge() {}, hoerenNeu: () => rufe.push("hoerenNeu")
    });
    const recognition = { abort: () => rufe.push("abort") };
    state.voiceRecognition = recognition;
    const w = solo.bewache(recognition, { taubMs: 60_000 });
    assert.equal(w.fehler("service-not-allowed"), true, "uebernommen");
    assert.equal(state.voiceRecognition, null, "alte Erkennung abgeloest (onend ignoriert sie)");
    assert.equal(state.ohrSoloAktiv, true);
    assert.deepEqual(rufe, ["abort", "earCancel", "hoerenNeu"]);
    assert.equal(solo.bewache(recognition, { taubMs: 60_000 }).fehler("network"), false, "andere Fehler: unveraendert");
  } finally {
    if (altNavigator) Object.defineProperty(globalThis, "navigator", altNavigator); else delete globalThis.navigator;
  }
});

test("(1) Sprachmodus-Quelle: onerror fragt ZUERST die Wache, Barge-in schweigt im Ohr-Modus", () => {
  const q = fs.readFileSync("public/composer-tools.js", "utf8");
  assert.match(q, /if \(taubwache\.fehler\(event\.error\)\) return;/);
  assert.match(q, /earCancel: \(\) => serverEar\.cancel\(\)/);
  assert.match(q, /state\.voiceFallback \|\| state\.ohrSoloAktiv\) return;/);
});

test("(1) Kein haengendes Mikrofon: cancel() waehrend getUserMedia wartet gibt das Mikrofon sofort frei", async () => {
  const altNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const altRecorder = globalThis.MediaRecorder;
  let freigeben;
  const gestoppt = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: () => new Promise((r) => { freigeben = () => r({ getTracks: () => [{ stop: () => gestoppt.push(1) }] }); })
  } } });
  globalThis.MediaRecorder = class { static isTypeSupported() { return true; } constructor() { this.state = "inactive"; } start() { this.state = "recording"; } stop() { this.state = "inactive"; } };
  try {
    const ohr = createServerEar({ url: "https://x.example/ohr" });
    const laeuft = ohr.start();
    assert.equal(ohr.nimmtAuf(), true, "startet gerade");
    ohr.start(); // zweiter Start waehrend des ersten: darf kein zweites Mikrofon holen
    ohr.cancel();
    freigeben();
    await laeuft;
    assert.equal(gestoppt.length, 1, "das spaet gelieferte Mikrofon wurde sofort gestoppt");
    assert.equal(ohr.nimmtAuf(), false);
  } finally {
    if (altNavigator) Object.defineProperty(globalThis, "navigator", altNavigator); else delete globalThis.navigator;
    globalThis.MediaRecorder = altRecorder;
  }
});

function bildKnoten(src) {
  const el = { tagName: "IMG", attribute: { src },
    getAttribute: (n) => (Object.hasOwn(el.attribute, n) ? el.attribute[n] : null),
    setAttribute: (n, w) => { el.attribute[n] = String(w); },
    removeAttribute: (n) => { delete el.attribute[n]; } };
  return { el, querySelectorAll: (wahl) => {
    if (wahl === 'img[src^="data:image/"]') return String(el.getAttribute("src")).startsWith("data:image/") ? [el] : [];
    if (wahl === "img, video" || wahl === `[${ADRESSE_ATTRIBUT}]`) return wahl === "img, video" || el.getAttribute(ADRESSE_ATTRIBUT) !== null ? [el] : [];
    return [];
  } };
}

test("(2) Frisch erzeugtes Bild: nach Auslagern + Speichern steht wieder das Bild da — OHNE einen Netzabruf", async () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const k = bildKnoten(dataUrl);
  await lagereMedienAus(k, { basis: "https://api.example/api/chat-medien", hochladen: async () => "0eaa6f1acb2f435a3ba681c233e75667ff69e8d9.png" });
  assert.match(k.el.getAttribute("src"), /\/api\/chat-medien\?id=/, "der Schnappschuss bekommt die kurze Adresse");
  const netz = [];
  await rehydriereMedien(k, { holen: async (a) => { netz.push(a); return null; }, adressenHolen: async (ids) => { netz.push(ids); return null; } });
  assert.equal(k.el.getAttribute("src"), dataUrl, "Anzeige zurueck — nicht das kaputte Bildsymbol");
  assert.deepEqual(netz, [], "kein Netz noetig (LTE-Aussetzer koennen das Bild nicht mehr kaputt machen)");
  // Naechster Speicherzyklus: wieder kurze Adresse im Schnappschuss, wieder ohne Netz zurueck.
  entwaessere(k);
  assert.match(k.el.getAttribute("src"), /\/api\/chat-medien\?id=/);
  await rehydriereMedien(k, { holen: async () => null, adressenHolen: async () => null });
  assert.equal(k.el.getAttribute("src"), dataUrl);
});

test("(2) Nie das kaputte '?': jeder Bildfehler bekommt eine Reaktion", () => {
  assert.equal(reaktionAufBildFehler("data:image/png;base64,iVBORw0KGgoAAA", null), "ersatz");
  assert.equal(reaktionAufBildFehler("https://api.smejj.com/api/chat-medien?id=a.png", null), "neu");
  assert.equal(reaktionAufBildFehler("https://api.smejj.com/medium/" + "x".repeat(70), "https://api.smejj.com/api/chat-medien?id=a.png"), "neu");
  for (const platzhalter of [FEHLENDES_BILD, UNVOLLSTAENDIGES_BILD, LEERES_BILD]) assert.equal(reaktionAufBildFehler(platzhalter, null), "", "Platzhalter nie erneut ersetzen (Schleife)");
  const q = fs.readFileSync("public/chat-medien.js", "utf8");
  assert.match(q, /document\.addEventListener\("error",[\s\S]{0,900}\}, true\);/, "Fehler in der Einfangphase");
  assert.match(q, /!MIT_FEHLERHOERER\.has\(bild\)/, "Schleifenschutz");
  assert.match(q, /signal: zeitgrenze\(\)/, "Netzabrufe mit Zeitgrenze");
});

test("(3) Code-Bereich: Halter ist der einzige Scroller, keine Linie, kein Kopfrand", () => {
  assert.match(REGELN, /body #code #codeLogHalter #startLog\.start-log\{overflow:visible;border-top:0;flex:0 0 auto;min-height:auto\}/);
  assert.match(REGELN, /body #code\.view\.is-active\.is-active\{padding-top:0\}/);
  assert.match(REGELN, /body #code #codeLogHalter\.code-log-halter\{overflow-y:auto/);
  // Oben kein Hintergrund: V15 blendet den Kopfglas-Streifen am Handy ueberall aus.
  const v15 = fs.readFileSync("public/design-v15-transparent-chat.css", "utf8");
  assert.match(v15, /\.mobil-kopfglas\.mobil-kopfglas\.mobil-kopfglas \{\s*display: none !important;/);
});

test("(4) Nach Neustart keine zweite, leere Aktionsleiste: der Arbeitsschritte-Eintrag behaelt .chat-schritte", () => {
  const q = fs.readFileSync("public/chat-store.js", "utf8");
  assert.match(q, /node\.classList\.contains\("chat-schritte"\) \? \{ art: "schritte" \} : \{\}/, "Speichern merkt die Art");
  assert.match(q, /node\.classList\.add\("chat-schritte"\);/, "Wiederherstellen setzt die Klasse");
  const quelle = q.match(/const SCHRITTE_HTML = (\/.+\/);/)?.[1];
  assert.ok(quelle, "Erkennung fuer Altbestand vorhanden");
  const SCHRITTE_HTML = new Function(`return ${quelle}`)();
  // Altbestand (gemessen im Simulator-Speicher): Faltzeile oder Schrittgruppe am Anfang.
  assert.ok(SCHRITTE_HTML.test('<details class="chat-schritte-falte"><summary class="chat-schritte-titel">Arbeitsschritte: 1 Schritt</summary>'));
  assert.ok(SCHRITTE_HTML.test('<div class="chat-schritte-falte chat-schritt-gruppe" data-gruppe="true">'));
  assert.ok(SCHRITTE_HTML.test('<details class="chat-schritte-falte chat-denken" data-denken="true">'));
  // Echte Antworten bleiben Antworten (behalten ihre Leiste).
  for (const antwort of ['<p>Hier ist dein Bild:</p><p><img class="chat-image" src="x"></p>', "<pre><code>print(1)</code></pre>", "<p>Die Hauptstadt ist <strong>Paris</strong>.</p>", ""]) {
    assert.equal(SCHRITTE_HTML.test(antwort), false, antwort);
  }
  const aktionen = fs.readFileSync("public/chat-actions.js", "utf8");
  assert.match(aktionen, /entry\.classList\.contains\("chat-schritte"\)[^\n]*continue;/, "keine Leiste fuer Schritte");
});
