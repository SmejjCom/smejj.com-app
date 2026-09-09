// smejj.com — "Auto" waehlt ein PROFIL, kein fremdes Modell.
//
// Diese Datei pruefte bis 2026-09-10 den alten Weg: waehleModell() gab eine
// feste Fremd-ID zurueck (cline-pass/minimax-m3 …) und sorgeFuerModell()
// setzte sie mit einem eigenen Rundlauf POST /api/providers/cline/select.
// Der Betreiber hat den Anbieter abgeschafft ("Cline muss vollstaendig aus der
// App entfernt werden"), und mit ihm faellt dieser ganze Weg weg.
//
// Was jetzt geprueft wird, ist die eigentliche Zusage: der Client entscheidet
// nur noch, WELCHE ART Aufgabe vorliegt — die Modellwahl trifft der Server,
// der als Einziger weiss, was gerade laeuft.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { AUTO_MODELL_ID, AUTO_WAHL, autoAktiv, autoAnfrage, waehleProfil } from "../public/ai/modellRouter.js";

test("eine kurze Alltagsfrage bekommt das schnelle Profil", () => {
  assert.equal(waehleProfil("Wie spaet ist es in Tokio?").profil, "fast");
});

test("eine Programmieraufgabe bekommt das Code-Profil", () => {
  assert.equal(waehleProfil("Schreib mir eine JavaScript Funktion, die ein Array sortiert.").profil, "coding");
  assert.equal(waehleProfil("```js\\nconst a = 1;\\n```").profil, "coding");
});

test("Umfang macht eine Aufgabe schwer, nicht Vokabular", () => {
  // NACHGEMESSEN 2026-08-17 mit 19 echten Testfaellen: 13 von 14 Modellen
  // loesten alle 19, das schnellste in 8 s gegen 12 s beim teuersten. Ein Wort
  // wie "Architektur" rechtfertigt also kein teures Modell — angehaengte
  // Dateien und sehr lange Auftraege schon.
  assert.equal(waehleProfil("Was macht das hier?", { dateien: 1 }).grund, "viel-kontext");
  assert.equal(waehleProfil("x".repeat(4001)).grund, "viel-kontext");
  for (const probe of [
    "Erklaer mir die Architektur von Microservices.",
    "Wie plane ich eine Migration?",
    "Worauf muss ich bei Security achten?"
  ]) assert.notEqual(waehleProfil(probe).grund, "viel-kontext", probe);
});

test("Auto ist nur aktiv, wenn der Nutzer Auto gewaehlt hat", () => {
  const speicher = new Map();
  const fake = { getItem: (k) => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v) };
  assert.equal(autoAktiv(fake), false, "ohne Wahl keine Automatik");
  fake.setItem("smejj.model.selected.v2", "smejj 1.2");
  assert.equal(autoAktiv(fake), false, "eine Stufe ist keine Automatik");
  fake.setItem("smejj.model.selected.v2", AUTO_WAHL);
  assert.equal(autoAktiv(fake), true);
});

test("DIE MANUELLE WAHL SCHLAEGT DIE AUTOMATIK — autoAnfrage haelt sich raus", () => {
  const speicher = new Map([["smejj.model.selected.v2", "smejj 1.3"]]);
  const fake = { getItem: (k) => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v) };
  assert.equal(autoAnfrage("Schreib eine Funktion.", {}, fake), null);
});

test("bei Auto reist die serverseitige Auto-Kennung mit, keine Anbieter-ID", () => {
  const speicher = new Map([["smejj.model.selected.v2", AUTO_WAHL]]);
  const fake = { getItem: (k) => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v) };
  const anfrage = autoAnfrage("Schreib eine JavaScript Funktion.", {}, fake);
  assert.equal(anfrage.model, AUTO_MODELL_ID, "genau der Wert, den modelRegistry.js erkennt");
  assert.equal(anfrage.profil, "coding");
});

test("kein Fremdanbieter mehr im Modul — auch nicht als Adresse", () => {
  // Der eigentliche Auftrag: "Entferne Cline aus ... Routing, Konfiguration,
  // Model Registry, API-Auswahl, Fallbacks". Ein uebersehener fetch auf
  // /api/providers/cline waere genau die Sorte Rest, die spaeter niemand mehr
  // findet. Kommentare duerfen den Umbau erklaeren, Code nicht.
  const quelle = readFileSync(new URL("../public/ai/modellRouter.js", import.meta.url), "utf8");
  const ohneKommentare = quelle.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(ohneKommentare, /cline/i, "kein Cline im ausfuehrbaren Teil");
  assert.doesNotMatch(ohneKommentare, /providers\//, "kein Anbieter-Endpunkt mehr");
});
