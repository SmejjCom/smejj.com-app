import test from "node:test";
import assert from "node:assert/strict";
import { anbieterKette, modellLager, LAGER_GEMESSEN_AM } from "./opsModellLager.js";

test("die Kette wird aus der Umgebung GEMESSEN, nicht behauptet", () => {
  const leer = anbieterKette({ env: {} });
  assert.equal(leer.besetzt, 0);
  assert.ok(leer.warnung, "ohne jeden Schluessel muss gewarnt werden");

  const zwei = anbieterKette({ env: { SMEJJ_LLM_ZHIPU_API_KEY: "x", SMEJJ_LLM_GROQ_API_KEY: "y" } });
  assert.equal(zwei.besetzt, 2);
  assert.ok(zwei.warnung, "zwei Glieder sind ein Seil, kein Netz — Warnung bleibt");

  const drei = anbieterKette({
    env: { SMEJJ_LLM_ZHIPU_API_KEY: "x", SMEJJ_LLM_GROQ_API_KEY: "y", SMEJJ_LLM_GEMINI_API_KEY: "z" }
  });
  assert.equal(drei.besetzt, 3);
  assert.equal(drei.warnung, null, "ab drei Gliedern verstummt die Warnung");
});

test("besetzte Anbieter stehen oben, danach die mit Gratis-Stufe", () => {
  const k = anbieterKette({ env: { SMEJJ_LLM_OPENAI_API_KEY: "x" } });
  assert.equal(k.anbieter[0].name, "openai", "wer traegt, steht zuerst — auch ohne Gratis-Stufe");
  assert.equal(k.anbieter[1].gratisStufe, true, "danach kommt, was ohne Geld dazukaeme");
});

test("ein leerer String ist kein Schluessel", () => {
  // Zeabur legt Variablen gern leer an. Wuerde das als Glied zaehlen, meldete
  // die Kette Laenge, die im Ernstfall nicht traegt.
  const k = anbieterKette({ env: { SMEJJ_LLM_GEMINI_API_KEY: "   " } });
  assert.equal(k.besetzt, 0);
});

test("das Lager traegt sein Messdatum mit sich", () => {
  const l = modellLager();
  assert.equal(l.gemessenAm, LAGER_GEMESSEN_AM);
  assert.match(l.hinweis, /NICHT live abgefragt/, "die Herkunft muss in der Antwort stehen");
  assert.ok(l.gesamt > 0);
});

test("brauchbare Dateien stehen oben, Fehlendes unten", () => {
  const l = modellLager();
  assert.equal(l.dateien[0].zustand, "vollstaendig");
  assert.equal(l.dateien[l.dateien.length - 1].zustand, "fehlt");
});

test("Kimi K2.7 steht als fehlend im Lager, nicht als vorhanden", () => {
  // Der Ordner war am 06.09. leer, obwohl der Code das Modell zwei Monate
  // lang als "verified-complete" fuehrte. Diese Zeile ist die Gegenprobe.
  const kimi = modellLager().dateien.find((d) => d.id === "kimi-k2-7");
  assert.equal(kimi.zustand, "fehlt");
});
