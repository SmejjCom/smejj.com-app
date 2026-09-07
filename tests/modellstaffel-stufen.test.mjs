// Waechter fuer die Modellstaffel smejj 1.0 bis 1.3 (Betreiber-Ansage 2026-09-07).
//
// Die Staffel ist nur dann keine Attrappe, wenn jede Zeile eine ANDERE Spur
// schaltet. Vier Namen mit einer Wirkung waeren dasselbe wie Ox Alpha: ein
// Eintrag im Menue ohne Deckung dahinter.
//
// WARUM DER QUELLTEXT GESCHNITTEN WIRD statt importiert: public/chat-bridge.js
// startet beim Import den Dienst und blockiert den Testlauf. Die bestehenden
// Bruecken-Tests loesen das, indem sie Untermodule importieren und die Bruecke
// selbst als Text pruefen. Hier geht es aber um VERHALTEN, nicht um Wortlaut —
// deshalb wird leseStufe aus der Quelle geschnitten und wirklich ausgefuehrt.
// Eine Textprobe haette den Fehler nicht gefunden, den es zu verhindern gilt:
// dass "spezial" zwar dasteht, aber auf dem Weg verworfen wird.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BRUECKE = fileURLToPath(new URL("../public/chat-bridge.js", import.meta.url));
const MENUE = fileURLToPath(new URL("../public/code-modell-menue.js", import.meta.url));
const APP = fileURLToPath(new URL("../public/app.js", import.meta.url));

function ladeLeseStufe() {
  const quelle = readFileSync(BRUECKE, "utf8");
  const anfang = quelle.indexOf("export function leseStufe(body)");
  assert.ok(anfang > 0, "leseStufe steht nicht mehr in chat-bridge.js");
  const ende = quelle.indexOf("\n}", anfang) + 2;
  const koerper = quelle.slice(anfang, ende).replace("export function", "function");
  return new Function(`${koerper}\nreturn leseStufe;`)();
}

test("alle vier Stufen kommen bei der Bruecke an", () => {
  const leseStufe = ladeLeseStufe();
  for (const stufe of ["schnell", "auto", "gruendlich", "spezial"]) {
    assert.equal(leseStufe({ preferences: { stufe } }), stufe, `${stufe} wird verworfen`);
    assert.equal(leseStufe({ stufe }), stufe, "auch direkt am Rumpf, nicht nur unter preferences");
  }
});

test("Unbekanntes bleibt fail-safe leer", () => {
  // Ein unbekannter Wert darf NICHT auf eine teure Spur fallen. Leer heisst
  // "bisheriges Verhalten" — so verhalten sich auch aeltere Frontends, die von
  // der Staffel nichts wissen.
  const leseStufe = ladeLeseStufe();
  assert.equal(leseStufe({ preferences: { stufe: "spezialfall" } }), "");
  assert.equal(leseStufe({ preferences: { stufe: "SPEZIAL " } }), "spezial", "Grossschreibung und Leerzeichen sind erlaubt");
  assert.equal(leseStufe({}), "");
  assert.equal(leseStufe(null), "");
});

test("spezial gibt die Schnellspur ab wie gruendlich", () => {
  // Der Sinn von 1.3: nie die schnelle Spur. Stuende hier nur "gruendlich",
  // liefe 1.3 heimlich ueber Groq.
  const quelle = readFileSync(BRUECKE, "utf8");
  assert.match(quelle, /if \(stufe === "gruendlich" \|\| stufe === "spezial"\) return false;/);
});

test("das Menue setzt vier verschiedene Stufen", () => {
  const quelle = readFileSync(MENUE, "utf8");
  const paare = [...quelle.matchAll(/titel: "(smejj 1\.\d)", stufe: "([a-z]+)"/g)]
    .map((m) => [m[1], m[2]]);
  assert.deepEqual(paare, [
    ["smejj 1.3", "spezial"],
    ["smejj 1.2", "gruendlich"],
    ["smejj 1.1", "auto"],
    ["smejj 1.0", "schnell"]
  ]);
});

test("die Anzeige nennt dieselben Namen wie das Menue", () => {
  // Vorher hiess der Chip "smejj 1.0 (Gruendlich)", das Menue aber anders.
  // Zwei Namen fuer dieselbe Sache lassen Nutzer glauben, sie haetten etwas
  // Falsches erwischt.
  const quelle = readFileSync(APP, "utf8");
  assert.match(quelle, /schnell: "smejj 1\.0"/);
  assert.match(quelle, /auto: "smejj 1\.1"/);
  assert.match(quelle, /gruendlich: "smejj 1\.2"/);
  assert.match(quelle, /spezial: "smejj 1\.3"/);
});

test("der Spiegel unter assets traegt dieselbe Fassung", () => {
  // Ausgeliefert wird aus assets/. Laufen die beiden auseinander, sieht der
  // Betreiber im Quellordner etwas anderes als der Nutzer im Browser.
  const spiegel = fileURLToPath(new URL("../public/assets/code-modell-menue.js", import.meta.url));
  assert.equal(readFileSync(MENUE, "utf8"), readFileSync(spiegel, "utf8"));
  const bruecke = fileURLToPath(new URL("../public/assets/chat-bridge.js", import.meta.url));
  assert.match(readFileSync(bruecke, "utf8"), /stufe === "spezial"/);
});
