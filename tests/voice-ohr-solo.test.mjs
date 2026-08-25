// smejj.com — Wächter für den Ohr-Solo-Modus der Sprachwelle (25.08.).
//
// BEFUND: Chromes SpeechRecognition war im Betreiber-Chrome komplett taub —
// sofortiges onend, nie onstart, nie onerror. Der Sprachmodus landete nach
// drei stillen Fehlversuchen im "Frage unten eintippen"-Fallback, obwohl das
// eigene Ohr (Bridge -> Groq) gesund war. Seitdem übernimmt das Ohr SOLO.
// Geprüft mit BEIDEN Proben je Zusage: was anschlagen muss, schlägt an —
// was still bleiben muss, bleibt still.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSoloAutomat, rmsPegel, createOhrSolo } from "../public/voice-ohr-solo.js";

test("Automat: Sprache und anhaltende Stille ergeben 'ende' (gesunde Kette)", () => {
  const automat = createSoloAutomat({ warmupMs: 100, minSprechMs: 200, stilleMs: 1000 });
  let t = 0;
  for (; t < 200; t += 50) assert.equal(automat.sample(0.005, t), null, "Warmlauf/Ruhe bleibt still");
  let sprichtGesehen = false;
  for (; t < 600; t += 50) { if (automat.sample(0.2, t) === "spricht") sprichtGesehen = true; }
  assert.equal(sprichtGesehen, true, "anhaltende Sprache muss als 'spricht' gemeldet werden");
  let ende = null;
  for (; t < 2200 && !ende; t += 50) { const s = automat.sample(0.004, t); if (s === "ende") ende = t; }
  assert.ok(ende, "nach der Stille muss 'ende' kommen");
});

test("Automat: reines Grundrauschen loest NIE ein Ende aus, nur das Zeitlimit", () => {
  const automat = createSoloAutomat({ warmupMs: 100, maxMs: 5000 });
  let stand = null;
  for (let t = 0; t <= 6000; t += 50) {
    stand = automat.sample(0.004 + (t % 3) * 0.0005, t);
    assert.notEqual(stand, "ende", "ohne Sprache gibt es kein Sprech-Ende");
    if (stand === "zeitlimit") break;
  }
  assert.equal(stand, "zeitlimit");
});

test("Automat: ein kurzer Knacks unter minSprechMs zaehlt nicht als Sprache", () => {
  const automat = createSoloAutomat({ warmupMs: 100, minSprechMs: 300, stilleMs: 800 });
  let t = 0;
  for (; t < 200; t += 50) automat.sample(0.005, t);
  assert.equal(automat.sample(0.3, t), null, "einzelner lauter Tick ist keine Sprache");
  t += 50;
  for (; t < 3000; t += 50) {
    assert.notEqual(automat.sample(0.005, t), "ende", "nach einem Knacks darf kein Ende kommen");
  }
});

test("rmsPegel: Stille ist ~0, Vollausschlag ist ~1", () => {
  assert.equal(rmsPegel(new Uint8Array(64).fill(128)), 0);
  const laut = new Uint8Array(64);
  for (let i = 0; i < laut.length; i += 1) laut[i] = i % 2 ? 255 : 1;
  assert.ok(rmsPegel(laut) > 0.9);
});

test("createOhrSolo: leeres Transkript stoesst die naechste Runde an, Text wird gesendet", async () => {
  // Ohne echtes Audio: der Automat wird ersetzt, das Ohr ist eine Attrappe.
  const ereignisse = [];
  // Node 24: navigator ist ein getter-only-Global — per defineProperty ersetzen.
  const altNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } });
  globalThis.window = { AudioContext: function () {
    this.createMediaStreamSource = () => ({ connect: () => {} });
    this.createAnalyser = () => ({ fftSize: 8, getByteTimeDomainData: () => {}, connect: () => {} });
    this.close = () => {};
  } };
  const macheAutomat = (staende) => () => ({ sample: () => staende.shift() || null });
  const ear = {
    start: async () => ereignisse.push("start"),
    cancel: () => ereignisse.push("cancel"),
    finish: async () => (ereignisse.push("finish"), ereignisse.filter((e) => e === "finish").length === 1 ? "" : "wie spaet ist es")
  };
  const solo = createOhrSolo({
    ear,
    automatFactory: macheAutomat(["spricht", "ende"]),
    taktMs: 5,
    aufTranskript: (t) => ereignisse.push("transkript:" + t),
    aufLeer: () => ereignisse.push("leer"),
    aufFehler: (f) => ereignisse.push("fehler:" + f)
  });
  await solo.start();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(ereignisse.slice(0, 3), ["start", "finish", "leer"], "leeres Transkript -> aufLeer (Host startet neu)");
  const solo2 = createOhrSolo({
    ear,
    automatFactory: macheAutomat(["ende"]),
    taktMs: 5,
    aufTranskript: (t) => ereignisse.push("transkript:" + t),
    aufLeer: () => ereignisse.push("leer"),
    aufFehler: (f) => ereignisse.push("fehler:" + f)
  });
  await solo2.start();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(ereignisse.includes("transkript:wie spaet ist es"), "Text geht an aufTranskript");
  if (altNavigator) Object.defineProperty(globalThis, "navigator", altNavigator);
  delete globalThis.window;
});

test("Anschluss: composer-tools verdrahtet das Solo-Ohr an den drei Stellen", () => {
  const quelle = fs.readFileSync("public/composer-tools.js", "utf8");
  assert.match(quelle, /import \{ verdrahteOhrSolo \} from "\.\/voice-ohr-solo\.js\?v=1"/);
  assert.match(quelle, /if \(state\.ohrSoloAktiv\) return ohrSolo\.hoeren\(\)/, "voiceModeListen hat die Weiche");
  assert.match(quelle, /if \(ohrSolo\.aktivieren\(\)\) return;/, "FailStreak-Zweig versucht erst Solo");
  assert.match(quelle, /if \(!ohrSolo\.aktivieren\(\)\) enterVoiceFallback\(/, "start-catch versucht erst Solo");
  assert.match(quelle, /ohrSolo\.stop\(\)/, "Schliessen/Mute stoppt die Solo-Runde");
  const sw = fs.readFileSync("public/sw.js", "utf8");
  assert.match(sw, /"\/assets\/voice-ohr-solo\.js"/, "Modul steht im Precache — offline sonst tot");
});
