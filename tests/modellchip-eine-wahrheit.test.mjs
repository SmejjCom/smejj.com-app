// smejj.com — der Modell-Chip und der Haken im Menue duerfen nicht
// widersprechen, und "Nachdenken" darf die Wahl "Auto" nicht aufheben.
//
// ZWEI FEHLER, live auf smejj.com gemessen am 2026-09-11:
//
// 1. Wer "smejj 1.0" waehlte, bekam einen Chip mit "smejj 1.1". Der Speicher war
//    richtig (Modell 1.0, Stufe schnell), nur die Anzeige log. Ursache: app.js
//    beschriftete den Chip bei "smejj 1.0" aus state.settings.stufe — einem
//    Wert, den das neue Menue gar nicht in app.js hineinschreibt. Das Ereignis
//    smejj:model-selected traegt die Stufe mit; app.js warf sie weg.
//
// 2. Wer "Auto" gewaehlt hatte und einmal "Nachdenken" drueckte, verlor die
//    Automatik STILL: die Pille klickte in das alte, nie geoeffnete Menue
//    ([data-stufe]), und dieser Weg setzt die Modellwahl zwangsweise auf
//    "smejj 1.0". Der Chip zeigte danach "smejj 1.2", der Haken stand auf 1.0,
//    und das Auto-Routing des Servers war abgeschaltet, ohne dass es jemand
//    sah.
//
// Beides ist dieselbe Krankheit: ZWEI QUELLEN fuer eine Wahl. Diese Probe
// bewacht, dass es bei einer bleibt — und zwar an der SACHE, nicht an einer
// Zahl (ein Test, der die falsche Beschriftung eingefroren haette, haette den
// Fehler versiegelt).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const app = lies("public/app.js");
const pille = lies("public/nav-absichten.js");

test("der Chip wird aus der Modellwahl beschriftet, nicht aus der Stufe", () => {
  // Der alte Sonderfall darf nicht zurueckkommen: keine Chip-Beschriftung, die
  // an einer Bedingung auf "smejj 1.0" haengt.
  assert.ok(
    !/selectedModel === "smejj 1\.0"[\s\S]{0,220}?textContent = STUFE_LABEL/.test(app),
    "app.js beschriftet den Chip wieder aus der Stufe statt aus der Wahl"
  );
  assert.match(app, /if \(button\) button\.textContent = selectedModel;/);
});

test("app.js uebernimmt die Stufe, die das Menue mitschickt", () => {
  const stelle = app.match(/smejj:model-selected[\s\S]{0,700}?\}\);/);
  assert.ok(stelle, "Zuhoerer fuer smejj:model-selected fehlt");
  assert.match(stelle[0], /detail\?\.stufe/, "die mitgeschickte Stufe wird ignoriert");
});

test("eine Stufe umzuschalten hebt die Wahl Auto nicht auf", () => {
  const fn = app.match(/function applySelectedStufe[\s\S]*?\n\}/);
  assert.ok(fn, "applySelectedStufe fehlt");
  assert.ok(
    !/applySelectedModel\("smejj 1\.0"\);/.test(fn[0]),
    "applySelectedStufe zwingt die Wahl wieder auf smejj 1.0 und loescht damit Auto"
  );
  assert.match(fn[0], /=== "Auto" \? "Auto"/, "der Auto-Fall wird nicht behandelt");
});

test("die Pille geht den benannten Weg, nicht durch das alte Menue", () => {
  const ohr = pille.match(/closest\("#stufeNachdenken"\)[\s\S]*?zeichneNachdenken, 80\);/);
  assert.ok(ohr, "das Klick-Ohr der Pille fehlt");
  assert.match(ohr[0], /window\.smejjApplyStufe/, "die Pille ruft den benannten Weg nicht");
  // Der Rueckfall auf [data-stufe] darf bleiben — aber nur als Rueckfall.
  const rueckfall = ohr[0].indexOf("data-stufe");
  const benannt = ohr[0].indexOf("smejjApplyStufe");
  assert.ok(benannt < rueckfall || rueckfall === -1, "der alte Weg laeuft immer noch zuerst");
});

test("app.js stellt den benannten Weg ueberhaupt bereit", () => {
  assert.match(app, /window\.smejjApplyStufe = applySelectedStufe;/);
});

test("die Pille merkt sich die Stufe von vor dem Einschalten", () => {
  assert.match(pille, /VORHER_SPEICHER/, "ohne Merker landet jeder beim Ausschalten auf 1.1");
  const ohr = pille.match(/closest\("#stufeNachdenken"\)[\s\S]*?zeichneNachdenken, 80\);/)[0];
  assert.match(ohr, /localStorage\.setItem\(VORHER_SPEICHER/);
  assert.match(ohr, /localStorage\.removeItem\(VORHER_SPEICHER\)/);
});
