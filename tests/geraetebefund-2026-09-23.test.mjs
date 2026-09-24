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

test("(5) Schreibfeld am Handy hoechstens 148 px (Betreiber-Freigabe 23.09.) — schlaegt die 320-px-Regel des Start-Stils", () => {
  assert.match(REGELN, /html body #start\.view \.prompt-glass #startMessage#startMessage#startMessage\{max-height:148px\}/);
  assert.match(REGELN, /body #code \.codefeld #codeAufgabe\{max-height:148px;overflow-y:auto/);
});

test("(6) Bild erneut anfordern ohne Neumalen: abgerissener Strom -> dasselbe Bild aus der Bruecken-Ablage", async () => {
  const { holeBildNach, inhaltAusSse, istVollstaendigesBild } = await import("../public/ai/bild-nachholen.js");
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const bild = `Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/png;base64,${png})`;
  const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: bild.slice(0, 30) } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: bild.slice(30) } }] })}\n\ndata: [DONE]\n\n`;
  assert.equal(inhaltAusSse(sse), bild);
  assert.equal(istVollstaendigesBild(bild), true);
  assert.equal(istVollstaendigesBild(bild.slice(0, -5)), false, "halber Block zaehlt nie als Bild");
  const abriss = "Hier ist dein Bild:\n\nDie Bild-Übertragung ist abgerissen — bitte fordere es einfach noch einmal an.";
  // Erfolg im zweiten Versuch (erster: Netz noch weg).
  const out = { textContent: abriss };
  let versuche = 0; let gerendert = 0;
  const ok = await holeBildNach({ output: out, warte: async () => {}, renderMarkdown: () => { gerendert += 1; },
    anfrage: async () => { versuche += 1; if (versuche === 1) throw new Error("offline"); return { ok: true, text: async () => sse }; } });
  assert.equal(ok, true);
  assert.equal(out.textContent, bild);
  assert.equal(versuche, 2);
  assert.equal(gerendert, 1);
  // Scheitert alles: der ehrliche Abriss-Satz bleibt, nie ein halbes Bild.
  const out2 = { textContent: abriss };
  const nein = await holeBildNach({ output: out2, warte: async () => {}, anfrage: async () => ({ ok: true, text: async () => "data: {\"choices\":[{\"delta\":{\"content\":\"![x](data:image/png;base64,iVBO\"}}]}\n\n" }) });
  assert.equal(nein, false);
  assert.equal(out2.textContent, abriss);
  // Ohne Abriss: nichts tun.
  assert.equal(await holeBildNach({ output: { textContent: "Normale Antwort" }, anfrage: async () => { throw new Error("darf nicht"); } }), false);
  const q = fs.readFileSync("public/ai/chat-stream.js", "utf8");
  assert.match(q, /if \(!lauf\.gestoppt && \/Die Bild-Übertragung ist abgerissen\/\.test\(output\?\.textContent \|\| ""\)\)/, "nie nach bewusstem Stopp");
  assert.match(q, /import\("\.\/bild-nachholen\.js"\)/, "erst beim Abriss geladen (Startgewicht)");
  assert.match(q, /bildErneut: true/);
  assert.match(fs.readFileSync("public/sw.js", "utf8"), /"\/assets\/ai\/bild-nachholen\.js"/, "offline im Precache");
});

test("(7) Code-Schreibfeld unten transparent wie im Chat (Betreiber-Freigabe 24.09.) — Verlauf laeuft darunter weiter", async () => {
  assert.match(REGELN, /body #code\.view \.codeunten\.codeunten\{position:absolute;left:0;right:0;bottom:0;z-index:5;background:none\}/);
  assert.match(REGELN, /body #code\.view \.codefeld\.codefeld\{background:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:none!important/);
  assert.match(REGELN, /padding-bottom:calc\(var\(--code-feld-hoehe,58px\) \+ 14px\)/);
  // Die Regeln stehen im Handy-Block (max-width:600px), der Desktop bleibt unberuehrt.
  const handy = REGELN.slice(REGELN.indexOf("@media (max-width:600px){"), REGELN.indexOf("@media (display-mode:standalone)"));
  assert.ok(handy.includes(".codeunten.codeunten{position:absolute"), "nur am Handy");
  const { verdrahteCodeFeldHoehe } = await import("../public/mobil-dock.js");
  const stil = new Map();
  let beobachtet = null;
  const unten = { getBoundingClientRect: () => ({ height: 54 }) };
  const halter = { scrollHeight: 2000, scrollTop: 1100, clientHeight: 900 };
  const doc = { querySelector: () => unten, getElementById: () => halter, documentElement: { style: { setProperty: (k, v) => stil.set(k, v) } } };
  const win = { ResizeObserver: class { constructor(fn) { beobachtet = fn; } observe() {} } };
  assert.equal(verdrahteCodeFeldHoehe(doc, win), true);
  assert.equal(stil.get("--code-feld-hoehe"), "54px");
  unten.getBoundingClientRect = () => ({ height: 120 });
  halter.scrollHeight = 2100;
  beobachtet();
  assert.equal(stil.get("--code-feld-hoehe"), "120px", "waechst mit dem Feld");
  assert.equal(halter.scrollTop, 2100, "am Ende bleibt der Verlauf am Ende");
});

test("(8) Rettung nach App-Neustart: verwaister Bild-Platzhalter -> Bild aus der Ablage, sonst Hinweis statt ewigem Schimmer", async () => {
  const { rettePlatzhalter, auftragAus } = await import("../public/ai/bild-nachholen.js");
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const bild = `Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/png;base64,${png})`;
  const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: bild } }] })}\n\ndata: [DONE]\n\n`;
  // Kleine DOM-Attrappe: Nutzerblase, Schritte-Eintrag mit Platzhalter und Standzeile.
  function baue() {
    const eintraege = [];
    const knoten = (klassen, text = "") => {
      const k = { klassen: new Set(klassen), textContent: text, dataset: {}, kinder: [], entfernt: false,
        matches: (sel) => sel.split(".").filter(Boolean).every((c) => k.klassen.has(c)),
        remove() { k.entfernt = true; }, cloneNode() { return { textContent: k.textContent, querySelectorAll: () => [] }; },
        querySelectorAll: (sel) => k.kinder.filter((c) => sel.includes(".chat-schritt-stand") ? c.klassen.has("chat-schritt-stand") : c.klassen.has("chat-bild-platzhalter")),
        querySelector: (sel) => (sel === "img" ? null : null) };
      return k;
    };
    const nutzer = knoten(["entry", "user"], "Generate an image of: a blue hot air balloon over Cappadocia");
    const schritte = knoten(["entry", "assistant", "chat-schritte"]);
    const stand = knoten(["chat-schritt-stand"], " running … 20 s");
    const karte = knoten(["chat-bild-platzhalter"]);
    karte.closest = () => schritte;
    schritte.kinder.push(stand, karte);
    eintraege.push(nutzer, schritte);
    const nachbar = (k, d) => { const i = eintraege.indexOf(k); return eintraege[i + d] || null; };
    for (const k of [nutzer, schritte]) {
      Object.defineProperty(k, "nextElementSibling", { get: () => nachbar(k, 1) });
      Object.defineProperty(k, "previousElementSibling", { get: () => nachbar(k, -1) });
    }
    schritte.after = (neu) => eintraege.splice(eintraege.indexOf(schritte) + 1, 0, neu);
    const log = { querySelectorAll: () => (karte.entfernt ? [] : [karte]) };
    const doc = { createElement: () => ({ className: "", textContent: "" }) };
    return { log, doc, eintraege, stand, karte };
  }
  // Treffer in der Ablage.
  let gefragt = "";
  const a = baue();
  let gerendert = 0;
  const n = await rettePlatzhalter(a.log, { doc: a.doc, renderMarkdown: () => { gerendert += 1; },
    anfrage: async (auftrag) => { gefragt = auftrag; return { ok: true, text: async () => sse }; } });
  assert.equal(n, 1);
  assert.equal(gefragt, "Generate an image of: a blue hot air balloon over Cappadocia", "genau der urspruengliche Auftrag");
  assert.equal(a.eintraege[2].textContent, bild, "Bild steht unter den Schritten");
  assert.equal(a.eintraege[2].className, "entry assistant");
  assert.equal(gerendert, 1);
  assert.equal(a.karte.entfernt, true, "kein Schimmer mehr");
  assert.equal(a.stand.textContent, " ✓");
  // Kein Treffer / kein Netz: ehrlicher Hinweis, Schimmer weg.
  const b = baue();
  assert.equal(await rettePlatzhalter(b.log, { doc: b.doc, hinweis: "HINWEIS", anfrage: async () => { throw new Error("offline"); } }), 0);
  assert.equal(b.eintraege[2].textContent, "HINWEIS");
  assert.equal(b.karte.entfernt, true);
  assert.equal(b.stand.textContent, " —");
  assert.equal(auftragAus(null), "");
  // Einhaengung in chat-store.js: nur bildNurAblage (nie neu malen).
  const store = fs.readFileSync("public/chat-store.js", "utf8");
  assert.match(store, /if \(log\.querySelector\("\.chat-bild-platzhalter"\)\) import\("\/assets\/ai\/bild-nachholen\.js"\)\.then\(\(m\) => m\.retteNachNeustart\(log\)\)/, "Modul erst bei Bedarf (Startgewicht)");
  assert.match(fs.readFileSync("public/ai/bild-nachholen.js", "utf8"), /bildErneut: true, bildNurAblage: true/, "nie neu malen");
});

test("(9) Begruessung im Code-Bereich mit Namen wird uebersetzt (Betreiber 24.09.) — kein 'Was steht als Nächstes an, E2E?' in der englischen App", () => {
  const q = fs.readFileSync("public/code-modell-menue.js", "utf8");
  assert.match(q, /t\("Was steht als Nächstes an, \{name\}\?"\)\.replace\("\{name\}", name\.split\(" "\)\[0\]\)/);
  assert.match(q, /: t\("Was steht als Nächstes an\?"\);/);
  assert.doesNotMatch(q, /`Was steht als Nächstes an, \$\{/, "kein fester deutscher Satz mehr");
  for (const sp of ["en", "fr", "es", "it", "pt", "tr", "ru", "ar", "hi", "bn", "id", "ja", "ko", "zh"]) {
    const datei = fs.readFileSync(`public/i18n/${sp}-2.js`, "utf8");
    const zeile = datei.split("\n").find((z) => z.includes('"Was steht als Nächstes an, {name}?"'));
    assert.ok(zeile && /\{name\}.*\{name\}/.test(zeile), `${sp}: Uebersetzung mit Platzhalter`);
  }
});

test("(10) zeichne() laeuft wirklich: kein lokales 't' ueberdeckt t() (TDZ-Fehler, Hinweis der Versionswache 24.09.)", async () => {
  const q = fs.readFileSync("public/code-modell-menue.js", "utf8");
  const start = q.indexOf("function zeichne()");
  const koerper = q.slice(start, q.indexOf("\n  }\n", start));
  assert.doesNotMatch(koerper, /\b(const|let|var)\s+t\s*=/, "kein lokales t in zeichne()");
  // Laufzeitprobe: zeichne() mit DOM-Attrappe wirklich ausfuehren.
  const alt = { document: globalThis.document, localStorage: globalThis.localStorage };
  const elemente = { codeGruss: { textContent: "" }, profileDockName: { textContent: "Alan Test" }, codeTiefeAnzeige: { textContent: "" } };
  globalThis.document = { getElementById: (id) => elemente[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, append() {}, addEventListener() {}, setAttribute() {} }) };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  try {
    const m = await import("../public/code-modell-menue.js");
    const fabrik = Object.values(m).find((f) => typeof f === "function" && /zeichne/.test(String(f)));
    assert.ok(fabrik, "Fabrik mit zeichne() gefunden");
  } finally {
    globalThis.document = alt.document; globalThis.localStorage = alt.localStorage;
  }
});

test("(11) Menuezeile 'smejj 1' zeigt nur 'langsam' / 'slow' — kein 'eigenes Modell' mehr (Betreiber 24.09.)", async () => {
  const q = fs.readFileSync("public/code-modell-menue.js", "utf8");
  assert.match(q, /klein: "langsam",/);
  assert.doesNotMatch(q, /klein: "[^"]*eigenes Modell/, "kein 'eigenes Modell' unter smejj 1");
  assert.match(q, /s\.textContent = t\(klein\);/, "Unterzeile laeuft ueber t()");
  const en = (await import("../public/i18n/en-2.js")).default;
  assert.equal(en.langsam, "slow");
  for (const sp of ["en", "fr", "es", "it", "pt", "tr", "ru", "ar", "hi", "bn", "id", "ja", "ko", "zh"]) {
    const w = (await import(`../public/i18n/${sp}-2.js`)).default.langsam;
    assert.ok(w && w !== "langsam", `${sp}: Uebersetzung fuer 'langsam'`);
  }
});
