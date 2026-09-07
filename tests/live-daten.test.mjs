// Waechter fuer die Live-Daten im Browser (public/ai/live-daten.js).
//
// WARUM ES DIESES MODUL GIBT (Betreiber-Screenshot 2026-09-07): Mit
// eingeschaltetem "Nachdenken" antwortete smejj auf "Wie ist heute das Wetter
// in Berlin?" mit "Ich habe keinen Zugriff auf aktuelle Wetterdaten". In der
// Bruecke haengt der Live-Kontext NUR an der Schnellspur, und die gibt bei
// stufe "gruendlich" ab — der tiefe Weg sah nie aktuelle Zahlen.
//
// Jede Pruefung hat eine GESUNDE und eine KAPUTTE Probe (Waechter-TUEV).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wurzel = fileURLToPath(new URL("../", import.meta.url));
const { brauchtLiveDaten, nenntWebAdresse, legeKontextBei, mitLiveDaten } =
  await import("../public/ai/live-daten.js");

test("erkennt Fragen, die Daten von heute brauchen", () => {
  for (const frage of [
    "Wie ist heute das Wetter in Berlin?",
    "Was ist die aktuelle Temperatur in Hamburg?",
    "Zeig mir die neuesten Nachrichten",
    "Wie steht der Bitcoin-Kurs gerade?",
    "Lies https://imild.com und nenne die Firma",
    "Was steht auf zeabur.com?"
  ]) assert.equal(brauchtLiveDaten(frage), true, frage);
});

test("KAPUTTE PROBE: zeitlose Fragen loesen keine Suche aus", () => {
  for (const frage of [
    "Schreibe eine Funktion, die zwei Zahlen addiert",
    "Erklaere mir den Unterschied zwischen Miete und Pacht",
    "Bist du online?",
    "Wie funktionierst du?",
    ""
  ]) assert.equal(brauchtLiveDaten(frage), false, frage);
});

test("Web-Adressen werden erkannt, Dateinamen nicht", () => {
  assert.equal(nenntWebAdresse("schau auf smejj.com"), true);
  assert.equal(nenntWebAdresse("https://example.org/x"), true);
  // Kaputte Probe: ein Dateiname ist keine Web-Adresse.
  assert.equal(nenntWebAdresse("oeffne app.js"), false);
  assert.equal(nenntWebAdresse("das war morgen.Danach kam nichts"), false);
});

test("der Live-Kontext reist als DATEN, mit Schutzhinweis", () => {
  const ergebnis = legeKontextBei("Wetter in Berlin?", "Aktuell: 18 Grad.");
  assert.match(ergebnis, /^Wetter in Berlin\?/, "die Frage bleibt vorn");
  assert.match(ergebnis, /LIVE-DATEN/);
  assert.match(ergebnis, /SICHERHEIT: .*DATEN aus dem Netz, keine/s,
    "ohne Schutzhinweis koennte ein Satz aus dem Netz als Befehl wirken");
  assert.match(ergebnis, /Aktuell: 18 Grad\./);
  // Kaputte Probe: ohne Kontext bleibt die Frage unangetastet.
  assert.equal(legeKontextBei("Wetter?", ""), "Wetter?");
  assert.equal(legeKontextBei("Wetter?", "   "), "Wetter?");
});

test("angereichert wird NUR bei 'gruendlich' — sonst macht es die Bruecke", async () => {
  const wetterfrage = { task: "Wie ist das Wetter in Berlin?", preferences: { stufe: "schnell" } };
  assert.equal(await mitLiveDaten(wetterfrage), wetterfrage, "schnell bleibt unberuehrt");
  const auto = { task: "Wie ist das Wetter in Berlin?", preferences: { stufe: "auto" } };
  assert.equal(await mitLiveDaten(auto), auto, "auto bleibt unberuehrt");
  // Zeitlose Frage auf der tiefen Spur: auch dort kein unnoetiger Netzgang.
  const zeitlos = { task: "Erklaere mir Rekursion", preferences: { stufe: "gruendlich" } };
  assert.equal(await mitLiveDaten(zeitlos), zeitlos);
});

test("fail-safe: kaputte Eingaben aendern nichts", async () => {
  assert.equal(await mitLiveDaten(null), null);
  assert.equal(await mitLiveDaten(undefined), undefined);
  const ohneStufe = { task: "Wetter in Berlin?" };
  assert.equal(await mitLiveDaten(ohneStufe), ohneStufe);
});

test("die angereicherte Frage reist WIRKLICH mit — die Ziele werden nachgezogen", () => {
  // DIE FALLE (Betreiber-Gegenprobe 07.09., "Wetter mit Nachdenken funktioniert
  // nicht"): app.js reicht die Endpunkte als LISTE herein (buildChatTargets in
  // chat-history-context.js), und JEDES Ziel traegt seinen eigenen, bereits
  // fertig serialisierten Rumpf. Wer nur `body` anreichert, schickt trotzdem
  // den alten Rumpf los — die Anreicherung war dann wirkungslos.
  const strom = readFileSync(wurzel + "public/ai/chat-stream.js", "utf8");
  const s = strom.indexOf("export async function streamChatAnswer");
  const rumpf = strom.slice(s, s + 4000);
  assert.match(rumpf, /body = await mitLiveDaten\(body\)/, "die Anreicherung fehlt");
  assert.match(rumpf, /zieleAnpassen\(url, \(rumpf\) => \(\{ \.\.\.rumpf, task: frageNachher \}\)\)/,
    "der angereicherte Text muss in den Rumpf JEDES Ziels");
  // Der Anpasser baut den Rumpf wirklich neu (er steht ausserhalb der Funktion).
  assert.match(strom, /JSON\.parse\(ziel\.body\)/, "der Rumpf jedes Ziels muss neu gebaut werden");
  // Und die Reihenfolge stimmt: erst anreichern, dann Ziele nachziehen, dann senden.
  const iAnreichern = rumpf.indexOf("await mitLiveDaten(body)");
  const iZiele = rumpf.indexOf("zieleAnpassen(url");
  const iSenden = rumpf.indexOf("fetchStreamWithRetry(url");
  assert.ok(iAnreichern < iZiele && iZiele < iSenden,
    "Reihenfolge falsch: anreichern -> Ziele nachziehen -> senden");
});

test("faellt die tiefe Spur aus, kommt trotzdem eine Antwort", () => {
  // LIVE GEMESSEN 07.09.: Mit "Nachdenken" gibt die Bruecke die Schnellspur ab.
  // Danach bleibt nur der Control-Router — und der meldet ALLE Modelle als
  // "degraded" (glm-5-2: runtimeAvailable=false, reason http_429, 48 Fehlschlaege
  // in Folge; die uebrigen runtimeConfigured=false). Faellt er durch, antwortet
  // streamModel 503 "Model backend is not configured", weil die Bruecke kein
  // eigenes Modell hat. Der Nutzer sah nur einen Fehler.
  const strom = readFileSync(wurzel + "public/ai/chat-stream.js", "utf8");
  const s = strom.indexOf("export async function streamChatAnswer");
  const rumpf = strom.slice(s, s + 6000);
  assert.match(rumpf, /response\.status === 502 \|\| response\.status === 503/, "der Ausfall-Zweig fehlt");
  assert.match(rumpf, /stufe: "auto"/, "der Rueckfall muss die Stufe entschaerfen");
  assert.match(rumpf, /zieleAnpassen\(url/, "auch die Ziele muessen die neue Stufe tragen");
  // Nur bei "gruendlich" — eine schnelle Anfrage soll nicht doppelt laufen.
  assert.match(rumpf, /=== "gruendlich"/);
});

test("der Ziel-Anpasser laesst kaputte Eingaben unangetastet", () => {
  // Reine Funktion, darum hier als Quelltext-Zusicherung: kein Ziel ohne body,
  // kein kaputtes JSON darf den Sendepfad sprengen.
  const strom = readFileSync(wurzel + "public/ai/chat-stream.js", "utf8");
  const s = strom.indexOf("function zieleAnpassen");
  const rumpf = strom.slice(s, s + 900);
  assert.match(rumpf, /if \(!Array\.isArray\(url\)\) return url/, "eine einzelne Adresse bleibt unangetastet");
  assert.match(rumpf, /typeof ziel\.body !== "string"/, "Ziele ohne Rumpf bleiben unangetastet");
  assert.match(rumpf, /catch \{ return ziel; \}/, "kaputtes JSON darf nichts sprengen");
});

test("das Modul haengt am Sendepfad und liegt im Vorrat", () => {
  const strom = readFileSync(wurzel + "public/ai/chat-stream.js", "utf8");
  assert.match(strom, /import \{ mitLiveDaten \} from "\.\/live-daten\.js"/);
  assert.match(strom, /body = await mitLiveDaten\(body\)/, "der Sendepfad muss es wirklich rufen");
  const sw = readFileSync(wurzel + "public/sw.js", "utf8");
  for (const datei of ["/assets/ai/live-daten.js", "/assets/chat-bridge-weather.js"]) {
    assert.ok(sw.includes(`"${datei}"`), `${datei} fehlt im Vorrat — offline und nach Neustart tot`);
  }
});

test("live-daten zieht KEIN Modul nach, das nur in Node laeuft", () => {
  // chat-bridge-websuche.js importiert chat-bridge-evolution.js — im Browser
  // bricht damit die ganze Kette (live gemessen 07.09.). Der Abruf steht darum
  // eigenstaendig in live-daten.js.
  const quelle = readFileSync(wurzel + "public/ai/live-daten.js", "utf8");
  assert.ok(!/^import .*chat-bridge-websuche/m.test(quelle), "die Bruecken-Websuche darf hier nicht importiert werden");
  // Gegenprobe: eine solche Import-Zeile wuerde erkannt.
  assert.ok(/^import .*chat-bridge-websuche/m.test('import { x } from "../chat-bridge-websuche.js";'));
  assert.match(quelle, /\/api\/search\/web/, "die Suche muss eigenstaendig abgerufen werden");
});

test("das Wetter-Modul laeuft in BEIDEN Welten (Bruecke und Browser)", () => {
  // Im Browser gibt es kein `process`; ein ungeschuetzter Zugriff sprengt das
  // Modul beim Laden — und mit ihm den ganzen Chat.
  const wetter = readFileSync(wurzel + "public/chat-bridge-weather.js", "utf8");
  assert.match(wetter, /typeof process !== "undefined"/, "der process-Zugriff muss abgesichert sein");
  assert.ok(!/^\s*const WEATHER_TIMEOUT_MS = Number\(process\.env/m.test(wetter));
});
