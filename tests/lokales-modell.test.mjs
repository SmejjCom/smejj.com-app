// Waechter fuer Stufe 0 — das Modell im Browser des Nutzers.
//
// Dieser Hebel macht Anfragen KOSTENLOS, weil sie unseren Server nie erreichen.
// Genau deshalb ist er gefaehrlich: das eingebaute Modell ist klein. Antwortet
// es dort, wo es nichts weiss, kauft der Nutzer die Ersparnis mit einer
// schlechteren Antwort — ohne es zu merken.
//
// Die Tests pruefen darum vor allem, was NICHT lokal beantwortet werden darf.
import test from "node:test";
import assert from "node:assert/strict";
import {
  frageLokal,
  lokalErlaubt,
  lokalVerfuegbar,
  setzeLokalErlaubt,
  taugtFuerLokal
} from "../public/ai/lokalesModell.js";

const speicher = () => {
  const daten = new Map();
  return { getItem: (k) => (daten.has(k) ? daten.get(k) : null), setItem: (k, v) => daten.set(k, String(v)) };
};

test("ohne eingebautes Modell wird ehrlich abgelehnt, nicht geraten", async () => {
  assert.deepEqual(await lokalVerfuegbar({}), { da: false, grund: "browser-kann-es-nicht" });
  const nurDownloadbar = { LanguageModel: { availability: async () => "downloadable" } };
  const urteil = await lokalVerfuegbar(nurDownloadbar);
  assert.equal(urteil.da, false);
  assert.equal(urteil.grund, "modell-downloadable", "hunderte MB laedt man nicht ungefragt im Hintergrund");
});

test("ist das Modell bereit, wird es auch genommen", async () => {
  const bereit = { LanguageModel: { availability: async () => "available", create: async () => ({}) } };
  const urteil = await lokalVerfuegbar(bereit);
  assert.equal(urteil.da, true);
  assert.equal(urteil.grund, "bereit");
});

test("was das kleine Modell NICHT kann, bleibt beim Server", () => {
  const proben = [
    [{ frage: "Wie ist das Wetter heute in Berlin?" }, "tagesaktuell"],
    [{ frage: "Was kostet das Abo bei smejj.com?" }, "braucht-projektwissen"],
    [{ frage: "Such mir bitte die beste Bohrmaschine" }, "braucht-werkzeug"],
    [{ frage: "Was macht diese Datei?", dateien: 1 }, "dateien"],
    [{ frage: "Was ist auf dem Bild zu sehen?", bilder: 1 }, "bilder"],
    [{ frage: "Und dann?", verlauf: [{ role: "user", content: "vorher" }] }, "anschlussfrage"],
    [{ frage: "hi" }, "zu-kurz"],
    [{ frage: "x".repeat(2_000) }, "zu-gross"]
  ];
  for (const [lage, grund] of proben) {
    const urteil = taugtFuerLokal(lage);
    assert.equal(urteil.ok, false, `haette abgelehnt werden muessen: ${grund}`);
    assert.equal(urteil.grund, grund);
  }
});

test("Gegenstueck: gewoehnliche Wissensfragen duerfen lokal laufen", () => {
  const gute = [
    "Was ist der Unterschied zwischen let und const in JavaScript?",
    "Erklaere mir in zwei Saetzen, warum der Himmel blau ist.",
    "Wie funktioniert eine Waermepumpe?"
  ];
  for (const frage of gute) {
    const urteil = taugtFuerLokal({ frage });
    assert.equal(urteil.ok, true, `haette lokal gehen duerfen: ${frage}`);
    assert.equal(urteil.grund, "geeignet");
  }
});

test("der Nutzer kann die lokale Spur abschalten", () => {
  const s = speicher();
  assert.equal(lokalErlaubt(s), true, "Standard ist an, sobald das Modell da ist");
  setzeLokalErlaubt(false, s);
  assert.equal(lokalErlaubt(s), false);
  setzeLokalErlaubt(true, s);
  assert.equal(lokalErlaubt(s), true);
  // Kein Speicher (privater Modus): nicht umfallen, sondern erlauben.
  assert.equal(lokalErlaubt(null), true);
});

test("eine duenne oder leere Antwort gilt NICHT als Erfolg", async () => {
  const duenn = {
    LanguageModel: {
      availability: async () => "available",
      create: async () => ({ prompt: async () => "ok", destroy() {} })
    }
  };
  const ergebnis = await frageLokal("Was ist eine Waermepumpe?", { umgebung: duenn });
  assert.equal(ergebnis.ok, false, "sonst bekommt der Nutzer ein Wort statt einer Antwort");
  assert.equal(ergebnis.grund, "antwort-zu-duenn");
});

test("ein Fehler im Modell faellt sauber zurueck statt zu werfen", async () => {
  const kaputt = {
    LanguageModel: {
      availability: async () => "available",
      create: async () => { throw new Error("kein Speicher"); }
    }
  };
  const ergebnis = await frageLokal("Was ist eine Waermepumpe?", { umgebung: kaputt });
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.grund.startsWith("fehler:"), "der Grund muss den Fehler nennen");
  assert.equal(ergebnis.text, "");
});

test("Streaming: Zuwachs kommt einmal an, nicht doppelt", async () => {
  // Chrome liefert je nach Fassung den GANZEN bisherigen Text oder nur den
  // Zuwachs. Beide Formen muessen dieselbe Blase ergeben.
  const stueckweise = ["Die ", "Waermepumpe ", "nutzt Umweltwaerme und Strom."];
  const wachsend = ["Die ", "Die Waermepumpe ", "Die Waermepumpe nutzt Umweltwaerme und Strom."];
  for (const form of [stueckweise, wachsend]) {
    const umgebung = {
      LanguageModel: {
        availability: async () => "available",
        create: async () => ({
          async *promptStreaming() { for (const s of form) yield s; },
          destroy() {}
        })
      }
    };
    let gesammelt = "";
    const ergebnis = await frageLokal("Wie funktioniert eine Waermepumpe?", {
      umgebung,
      onDelta: (t) => { gesammelt += t; }
    });
    assert.equal(ergebnis.ok, true);
    assert.equal(ergebnis.text, "Die Waermepumpe nutzt Umweltwaerme und Strom.");
    assert.equal(gesammelt, ergebnis.text, "der gestreamte Text muss dem Ergebnis entsprechen");
  }
});

test("die Dauer wird gemessen — sonst weiss niemand, ob lokal schneller ist", async () => {
  let uhr = 1_000;
  const umgebung = {
    LanguageModel: {
      availability: async () => "available",
      create: async () => ({ prompt: async () => { uhr += 250; return "Eine ausreichend lange Antwort auf die Frage."; }, destroy() {} })
    }
  };
  const ergebnis = await frageLokal("Wie funktioniert eine Waermepumpe?", { umgebung, jetzt: () => uhr });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.ms, 250);
});

test("der Nutzer kann eine bessere Antwort erzwingen — ohne Einstellungen", () => {
  // Wer eine duenne Antwort bekam, will JETZT eine bessere. Ein Ausflug in die
  // Einstellungen waere die falsche Antwort auf diesen Wunsch.
  for (const frage of [
    "Erklaer mir genauer, wie eine Waermepumpe funktioniert",
    "Denk nach: was ist der Unterschied zwischen let und const?",
    "Bitte ausfuehrlich: wie funktioniert ein Verbrennungsmotor?"
  ]) {
    const urteil = taugtFuerLokal({ frage });
    assert.equal(urteil.ok, false, `haette auf die starke Spur gehoert: ${frage}`);
    assert.equal(urteil.grund, "nutzer-will-stark");
  }
  // Gegenstueck: ohne dieses Wort bleibt dieselbe Frage lokal.
  assert.equal(taugtFuerLokal({ frage: "Wie funktioniert eine Waermepumpe?" }).ok, true);
});
