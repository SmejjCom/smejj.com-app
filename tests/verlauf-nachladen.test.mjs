// smejj.com — die Verlauf-Ansicht wird nachgeladen, nicht beim Start.
//
// WARUM: chat-history-view.js baut ausschliesslich die Ansicht #chatHistory und
// prueft das selbst ("if (isHistoryViewVisible() || location.pathname ===
// '/chat-history')"). Auf der Startseite laeuft sie leer — und war trotzdem
// fest im index.html verdrahtet: 35,3 KB von 740 KB Startgewicht, bei einem
// Budget von 300 KB (gemessen 2026-09-12).
//
// DIE GEFAHR DABEI: Ein Nachlader, der nur den Klick kennt, macht aus der
// Ansicht eine Attrappe fuer jeden, der /chat-history als Lesezeichen hat oder
// die Adresse direkt eingibt. Genau diese Haelfte hat am 10.09. beim
// Kamera-Knopf gefehlt. Darum bewacht diese Probe BEIDE Wege.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const nachlader = lies("public/bedarf-nachladen.js");
const html = lies("public/index.html");

test("chat-history-view.js haengt NICHT mehr fest im index.html", () => {
  assert.ok(!/<script[^>]*chat-history-view\.js/.test(html),
    "die feste Einbindung ist zurueck — dann laedt sie wieder beim Start");
});

test("der Klick in der Spur laedt sie nach", () => {
  const stelle = nachlader.match(/ladeBeiKlick\(\[[^\]]*chatHistory[^\]]*\][\s\S]{0,120}?chat-history-view/);
  assert.ok(stelle, "kein Klick-Ausloeser fuer die Verlauf-Ansicht");
});

test("der DIREKTEINSTIEG ueber die Adresse laedt sie auch", () => {
  // Ohne diesen Zweig saehe jeder, der /chat-history direkt oeffnet, eine
  // leere Seite — und "nichts passiert" sieht aus wie "kaputt".
  assert.match(nachlader, /location\.pathname\.includes\("chat-history"\)[\s\S]{0,200}?import\("\.\/chat-history-view\.js/);
});

test("beide Wege laden DIESELBE Marke", () => {
  // Zwei Kennungen waeren zwei Modulinstanzen mit eigenem Zustand — der Fall
  // vom 10.09. (chat-store.js lag live unter zwei Marken).
  const marken = [...nachlader.matchAll(/chat-history-view\.js\?v=([0-9a-z]+)/g)].map((m) => m[1]);
  assert.ok(marken.length >= 2, "es sollten zwei Ladestellen sein (Klick und Direkteinstieg)");
  assert.equal(new Set(marken).size, 1, `verschiedene Marken: ${marken.join(", ")}`);
});
