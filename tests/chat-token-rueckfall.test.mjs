// Pruefer: der Chat verliert die Anmeldung nicht mehr beim Browser-Neustart.
//
// DER BEFUND (2026-08-22, im Chatverlauf des Betreibers gefunden):
//   "wie ist Wetter morgen in Berlin"
//     -> "Bitte zuerst anmelden und Cline unter Einstellungen → Modelle verbinden."
//   "bist du bescheuert ich bin angemeldet wenn ich nicht angemeldet
//    kann ich dich nicht nutzen"
//     -> dieselbe Abfuhr
//   "warum redest du mit mir nicht mehr ich frage nach du sagst du nichts"
//     -> dieselbe Abfuhr
//
// ZWEI Fehler steckten darin, und beide sind hier festgehalten:
//
// 1. Der Chat las NUR sessionStorage. Das Fach stirbt mit dem Browserfenster
//    und wird erst wieder gefuellt, nachdem auth-gate.js den Server gefragt
//    hat — ein Netzaufruf. In diesem Zeitfenster ging jede Frage ins Leere,
//    obwohl die Anmeldung in Ordnung war. Das dauerhafte Fach traegt dasselbe
//    Token und ist sofort da.
//
// 2. Die Meldung nannte ZWEI Ursachen ("anmelden UND Cline verbinden"),
//    geprueft wurde nur EINE. Der Betreiber hat daraufhin bei Cline gesucht,
//    wo nichts kaputt war. Ohne Token weiss der Chat ueber den Anbieter gar
//    nichts — also darf er darueber auch nichts behaupten.
//
// Betreiber-Freigabe fuer die Start-Lock-Datei liegt vor (2026-08-22).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUELLE = readFileSync(join(WURZEL, "public", "ai", "chatClient.js"), "utf8");

// Den Helfer aus der Quelle holen und mit gestellten Faechern laufen lassen.
// So wird die ECHTE Funktion gemessen, nicht eine nachgebaute.
function ladeHelfer({ sitzung = null, dauerhaft = null, sitzungWirft = false } = {}) {
  const anfang = QUELLE.indexOf("function holeZugriffsToken()");
  const ende = QUELLE.indexOf("\n}", anfang) + 2;
  const koerper = QUELLE.slice(anfang, ende);
  const sessionStorage = {
    getItem: () => { if (sitzungWirft) throw new Error("Speicher gesperrt"); return sitzung; }
  };
  const localStorage = { getItem: () => dauerhaft };
  // eslint-disable-next-line no-new-func
  return new Function("sessionStorage", "localStorage", `
    const API_TOKEN_KEY = "smejj.apiToken.v1";
    const AUTH_TOKEN_KEY = "smejj.auth.accessToken.v1";
    ${koerper}
    return holeZugriffsToken();
  `)(sessionStorage, localStorage);
}

test("das eigene Fach hat Vorrang", () => {
  assert.equal(ladeHelfer({ sitzung: "aus-der-sitzung", dauerhaft: "dauerhaft" }), "aus-der-sitzung");
});

test("DER BEFUND: leeres Sitzungsfach greift auf das dauerhafte zurueck", () => {
  // Genau der Fall nach einem Browser-Neustart.
  assert.equal(ladeHelfer({ sitzung: null, dauerhaft: "dauerhaft" }), "dauerhaft");
});

test("gar kein Token bleibt gar kein Token", () => {
  assert.equal(ladeHelfer({ sitzung: null, dauerhaft: null }), "");
});

test("gesperrter Sitzungsspeicher wirft nicht, sondern nimmt das dauerhafte Fach", () => {
  assert.equal(ladeHelfer({ sitzungWirft: true, dauerhaft: "dauerhaft" }), "dauerhaft");
});

test("die Meldung nennt NUR die Anmeldung — nicht den Anbieter", () => {
  // Ohne Token weiss der Chat ueber Cline/BYOK nichts.
  const anfang = QUELLE.indexOf("function nichtAngemeldetText()");
  const text = QUELLE.slice(anfang, QUELLE.indexOf("\n}", anfang));
  assert.match(text, /Anmeldung ist abgelaufen/);
  assert.ok(!/Cline/i.test(text), "die Meldung nennt wieder Cline");
  assert.ok(!/Anbieter/i.test(text), "die Meldung nennt wieder den Anbieter");
  assert.ok(!/Modelle verbinden/i.test(text), "die Meldung schickt den Nutzer wieder in die Einstellungen");
});

test("BEIDE Chat-Wege benutzen den Rueckfall — keiner liest mehr direkt", () => {
  // Cline und BYOK-Anbieter hatten dieselbe Zeile; wird nur einer umgestellt,
  // bleibt der andere still kaputt.
  const direkt = (QUELLE.match(/sessionStorage\.getItem\(API_TOKEN_KEY\)/g) || []).length;
  assert.equal(direkt, 1, "ausser im Helfer selbst darf niemand mehr direkt lesen");
  const ueberHelfer = (QUELLE.match(/holeZugriffsToken\(\)/g) || []).length;
  assert.ok(ueberHelfer >= 3, `nur ${ueberHelfer} Stellen nutzen den Helfer (Definition + zwei Wege erwartet)`);
});

test("die alte irrefuehrende Meldung steht nirgends mehr", () => {
  assert.ok(
    !QUELLE.includes("Bitte zuerst anmelden und"),
    "die Meldung mit den zwei Ursachen steht noch in der Datei"
  );
});
