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
  assert.match(nachlader, /ladeBeiKlick\(\['\[data-view="chatHistory"\]'/);
});

test("die ANSICHT selbst loest das Nachladen aus — nicht die Adresse", () => {
  // Der erste Entwurf haengte am Pfad (/chat-history). Das ist zwar die
  // offizielle Route, aber GitHub Pages liefert dafuer die 404-Seite, die in
  // die App umleitet — beim Laden dieses Moduls steht dann laengst etwas
  // anderes in location.pathname. LIVE gemessen: der Verlauf blieb leer.
  //
  // Die Ansicht wird sichtbar, egal ob man klickt, ein Lesezeichen oeffnet
  // oder zurueckgeht. Nur daran darf es haengen.
  assert.match(nachlader, /getElementById\("chatHistory"\)/);
  assert.match(nachlader, /new MutationObserver[\s\S]{0,200}?chat-history-view|istOffen\(\)[\s\S]{0,120}?laden\(\)/);
  assert.ok(!/location\.pathname\.includes\("chat-history"\)/.test(nachlader),
    "der Pfad-Zweig ist zurueck — er greift bei Pages nie");
});

test("die Ansicht wird auch geladen, wenn sie schon offen IST", () => {
  // Beim Direkteinstieg ist sie bereits sichtbar, bevor dieses Modul laeuft —
  // ein Beobachter allein wuerde dann nie ausloesen.
  assert.match(nachlader, /if \(istOffen\(\)\) laden\(\);/);
});

test("beide Wege laden DIESELBE Marke", () => {
  // Zwei Kennungen waeren zwei Modulinstanzen mit eigenem Zustand — der Fall
  // vom 10.09. (chat-store.js lag live unter zwei Marken).
  const marken = [...nachlader.matchAll(/chat-history-view\.js\?v=([0-9a-z]+)/g)].map((m) => m[1]);
  assert.ok(marken.length >= 1, "keine Ladestelle gefunden");
  assert.equal(new Set(marken).size, 1, `verschiedene Marken: ${marken.join(", ")}`);
});
