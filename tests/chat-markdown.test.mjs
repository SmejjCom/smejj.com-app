// smejj.com — Schutztests fuer die Markdown-Anzeige der Chat-Antworten.
// Freigabe 2026-07-17 (Wof Kadavanich): "Ja" auf die Empfehlung "Markdown im Chat fixen".
// Befund: Antworten zeigten "**Lissabon**" statt fett.
// Sicherheitskern: Modellausgabe ist nicht vertrauenswuerdig -> erst escapen, dann auszeichnen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("public/chat-markdown.js", "utf8");
const appJs = fs.readFileSync("public/app.js", "utf8");
const components = fs.readFileSync("public/components.js", "utf8");
const chatStream = fs.readFileSync("public/ai/chat-stream.js", "utf8");

// Minimales DOM: der Renderer nutzt nur textContent, innerHTML und window.
function fakeNode(text) {
  return { textContent: text, innerHTML: "" };
}

async function load(voiceMode = false) {
  globalThis.window = { smejjVoiceModePreferences: voiceMode ? { voiceMode: true } : undefined };
  const module = await import(`../public/chat-markdown.js?case=${Math.random()}`);
  return module.renderChatMarkdown;
}

// --- Tabellen --------------------------------------------------------------
//
// GEMESSEN 2026-08-13 live: Nachdem der Agent endlich sieben echte Angebote
// lieferte, standen sie als Zeichensalat im Chat — "| # | Lage / Adresse |
// Zimmer / Flaeche | …" samt "|---|---|". Das Modell lieferte korrektes
// Markdown; der Renderer kannte nur keine Tabellen.

const TABELLE = [
  "| # | Lage / Adresse | Zimmer / Fläche | Mietpreis monatl. | Exposé |",
  "|---|----------------|-----------------|-------------------|--------|",
  "| 1 | Hayward / Castro Valley | 2 Räume, ca. 225 sq ft | **700 $** | https://www.craigslist.org/view/d/hayward |",
  "| 2 | 2811 Castro Valley Blvd | ca. 880 sq ft | im Inserat nicht angegeben | https://www.officespace.com/ca/x |"
].join("\n");

test("eine Markdown-Tabelle wird eine echte Tabelle", async () => {
  const render = await load();
  const node = fakeNode(TABELLE);
  render(node);
  assert.match(node.innerHTML, /<table class="chat-table">/);
  assert.equal((node.innerHTML.match(/<th>/g) || []).length, 5, "fuenf Kopfspalten");
  assert.equal((node.innerHTML.match(/<tr>/g) || []).length, 3, "Kopfzeile plus zwei Datenzeilen");
  assert.match(node.innerHTML, /<th>Mietpreis monatl\.<\/th>/);
  assert.match(node.innerHTML, /<td>2 Räume, ca\. 225 sq ft<\/td>/);
  // Die Trennzeile darf nie als Inhalt auftauchen.
  assert.doesNotMatch(node.innerHTML, /---/);
  assert.doesNotMatch(node.innerHTML, /\|/, "kein einziger Rohstrich bleibt stehen");
});

test("in der Tabelle bleiben Links klickbar und fett bleibt fett", async () => {
  const render = await load();
  const node = fakeNode(TABELLE);
  render(node);
  assert.match(node.innerHTML, /<td><a class="chat-link" href="https:\/\/www\.craigslist\.org\/view\/d\/hayward"/);
  assert.match(node.innerHTML, /<td><strong>700 \$<\/strong><\/td>/);
});

test("eine verrutschte Zeile verschiebt die Spalten nicht", async () => {
  // Modellausgabe ist nie garantiert sauber. Fehlende Zellen werden aufgefuellt,
  // ueberzaehlige abgeschnitten — sonst rutscht der Preis in die Link-Spalte.
  const render = await load();
  const node = fakeNode(["| A | B | C |", "|---|---|---|", "| 1 | 2 |", "| 1 | 2 | 3 | 4 |"].join("\n"));
  render(node);
  const zeilen = node.innerHTML.split("<tr>").slice(2);
  for (const zeile of zeilen) {
    assert.equal((zeile.match(/<td>/g) || []).length, 3, "jede Datenzeile hat genau drei Zellen");
  }
});

test("Modellausgabe in Zellen wird escaped, nie als Markup ausgefuehrt", async () => {
  const render = await load();
  const node = fakeNode(["| Name | Notiz |", "|---|---|", "| <img src=x onerror=alert(1)> | ok |"].join("\n"));
  render(node);
  assert.match(node.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(node.innerHTML, /<img src=x/);
});

test("ein Satz mit Strichen ist keine Tabelle", async () => {
  // Ohne die Trennzeile als Bedingung wuerde jeder Text mit "|" verunstaltet.
  const render = await load();
  const node = fakeNode("Der Pfad ist a|b|c und die Regel gilt.");
  render(node);
  assert.doesNotMatch(node.innerHTML, /<table/);
  // Eine Aufzaehlung beginnt mit "-", eine Trennzeile auch. Die Liste darf
  // dadurch nicht zur Tabelle werden. (Dass sie hier ueberhaupt gerendert wird,
  // liegt am Stern in der Zeile — reine Bindestrich-Listen ohne Auszeichnung
  // bleiben seit jeher Rohtext, das ist nicht Teil dieser Aenderung.)
  const liste = fakeNode("- eins *wichtig*\n- zwei");
  render(liste);
  assert.match(liste.innerHTML, /<ul class="chat-list">/, "Listen bleiben Listen");
  assert.doesNotMatch(liste.innerHTML, /<table/);
});

test("fett, kursiv und Code werden ausgezeichnet", async () => {
  const render = await load();
  const node = fakeNode("Die Hauptstadt ist **Lissabon**.");
  render(node);
  assert.match(node.innerHTML, /<strong>Lissabon<\/strong>/);
  assert.doesNotMatch(node.innerHTML, /\*\*/);

  const italic = fakeNode("Das ist *wichtig* hier.");
  render(italic);
  assert.match(italic.innerHTML, /<em>wichtig<\/em>/);

  const code = fakeNode("Nutze `npm run check` dafuer.");
  render(code);
  assert.match(code.innerHTML, /<code>npm run check<\/code>/);
});

test("HTML aus der Modellausgabe wird niemals ausgefuehrt (XSS)", async () => {
  const render = await load();
  const node = fakeNode('**<img src=x onerror=alert(1)>** und <script>alert(2)</script>');
  render(node);
  assert.doesNotMatch(node.innerHTML, /<img|<script/i);
  assert.match(node.innerHTML, /&lt;img/);
  assert.match(node.innerHTML, /&lt;script/);
  // Escapen passiert VOR der Auszeichnung — geprueft an der inline()-Funktion selbst.
  const inlineFn = source.match(/function inline\(text\) \{[\s\S]*?\n\}/)[0];
  assert.ok(
    inlineFn.indexOf("escapeHtml(text)") < inlineFn.indexOf(".replace(INLINE_CODE"),
    "escapeHtml muss vor der Markdown-Auszeichnung laufen"
  );
});

test("Codebloecke bleiben unangetastet (kein fett im Code)", async () => {
  const render = await load();
  const node = fakeNode("Beispiel:\n\n```js\nconst a = **b**;\n```");
  render(node);
  assert.match(node.innerHTML, /<pre class="chat-code" data-language="js"><code>/);
  assert.match(node.innerHTML, /const a = \*\*b\*\*;/);
  assert.doesNotMatch(node.innerHTML, /<strong>/);
});

test("Listen und Absaetze", async () => {
  const render = await load();
  const node = fakeNode("- **eins**\n- zwei");
  render(node);
  assert.match(node.innerHTML, /<ul class="chat-list"><li><strong>eins<\/strong><\/li><li>zwei<\/li><\/ul>/);
});

test("Links sind klickbar: Markdown-Link und nackte URL (Betreiber-Auftrag 2026-08-03)", async () => {
  const render = await load();
  const md = fakeNode("Die offizielle Website: [Wells Fargo](https://www.wellsfargo.com/index.htm)");
  render(md);
  assert.match(md.innerHTML, /<a class="chat-link" href="https:\/\/www\.wellsfargo\.com\/index\.htm" target="_blank" rel="noopener noreferrer">Wells Fargo<\/a>/);

  const bare = fakeNode("Die Website lautet: https://www.wellsfargo.com. Dort anmelden.");
  render(bare);
  // Der Satzpunkt gehoert NICHT zur URL.
  assert.match(bare.innerHTML, /<a class="chat-link" href="https:\/\/www\.wellsfargo\.com"[^>]*>https:\/\/www\.wellsfargo\.com<\/a>\./);

  const fett = fakeNode("**https://www.wellsfargo.com**");
  render(fett);
  assert.match(fett.innerHTML, /<strong><a class="chat-link" href="https:\/\/www\.wellsfargo\.com"/);
});

test("Nur http/https wird verlinkt — javascript:/data: niemals (XSS)", async () => {
  const render = await load();
  const boese = fakeNode("Klick [hier](javascript:alert(1)) oder [da](data:text/html,x) fuer **mehr**.");
  render(boese);
  assert.doesNotMatch(boese.innerHTML, /<a /);
  assert.doesNotMatch(boese.innerHTML, /javascript:alert\(1\)"/);
  // href entsteht aus escaptem Text — Anfuehrungszeichen koennen nie ausbrechen.
  const kaputt = fakeNode('Siehe https://x.com/a"onmouseover="alert(1) **hier**.');
  render(kaputt);
  assert.doesNotMatch(kaputt.innerHTML, /"onmouseover="/);
});

test("Text ohne Auszeichnung bleibt unveraendert (kein unnoetiges Rendern)", async () => {
  const render = await load();
  const node = fakeNode("Ein ganz normaler Satz.");
  render(node);
  assert.equal(node.innerHTML, "");
});

test("Im Sprachmodus wird NICHT gerendert (Feature-Lock v2)", async () => {
  // voice-speech-queue.js verfolgt den wachsenden Text ueber einen Offset —
  // nachtraeglich entfernte Sternchen wuerden Saetze doppelt sprechen lassen.
  const render = await load(true);
  const node = fakeNode("Die Hauptstadt ist **Lissabon**.");
  render(node);
  assert.equal(node.innerHTML, "");
  assert.match(source, /smejjVoiceModePreferences\?\.voiceMode/);
});

test("Renderer ist fail-safe: nie eine leere Antwort", async () => {
  const render = await load();
  assert.doesNotThrow(() => render(null));
  assert.match(source, /catch \{/);
});

test("Verdrahtung: gerendert wird erst am ENDE des Streams", () => {
  // Waehrend des Streams baut der Empfaenger per `textContent +=` auf — ein
  // Rendern mittendrin wuerde die Rohquelle zerstoeren.
  // Seit 2026-08-04 liegt der Empfang in public/ai/chat-stream.js (app.js stand
  // an der 800-Zeilen-Grenze); app.js reicht den Renderer nur noch hinein.
  // Seit 2026-08-13 steht renderMarkdown nicht mehr als allerletzte Zeile:
  // danach folgt falteSchritte(), das die Schrittliste NEBEN der Antwort
  // zusammenklappt und den Antwort-Knoten gar nicht anfasst. Die eigentliche
  // Zusage wird deshalb direkt geprueft statt ueber die Position.
  assert.equal((chatStream.match(/renderMarkdown\?\.\(output\)/g) || []).length, 1,
    "genau EIN Renderaufruf — mehrere hiessen: mittendrin gerendert");
  assert.doesNotMatch(chatStream, /renderMarkdown\?\.\(output\);[\s\S]*output\.textContent \+=/,
    "nach dem Rendern darf nichts mehr an den Antworttext angehaengt werden");
  assert.match(appJs, /renderMarkdown: renderChatMarkdown/,
    "app.js muss den Markdown-Renderer an den Empfaenger uebergeben");
  // Der Import kam ohne neue Zeile aus (Ratchet): components.js re-exportiert.
  assert.match(components, /export \{ renderChatMarkdown \} from "\.\/chat-markdown\.js/);
  assert.match(appJs, /import \{ Icons, closeModal, openModal, renderChatMarkdown, renderEmptyState, setButtonIcon, showToast \}/);
  // LIVE-FEHLER 2026-07-17: Ohne Version laedt der Browser die ALTE components.js
  // aus dem HTTP-Cache, der Re-Export fehlt und app.js bricht komplett ab.
  assert.match(appJs, /from "\.\/components\.js\?v=[^"]+"/, "components.js-Import braucht eine Cache-Version");
});

test("Bilder: data:image-base64 wird zum <img>, Fremd-URLs bleiben Text", async () => {
  // Bilder-Zeichnen 2026-08-12: die Bruecke (chat-bridge-bilder.js) liefert
  // ![Alt](data:image/...;base64,...) — NUR diese Form darf ein Bild werden.
  const render = await load();
  const node = fakeNode("Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/jpeg;base64,AAAA)");
  render(node);
  assert.match(node.innerHTML, /<img class="chat-image" src="data:image\/jpeg;base64,AAAA" alt="Erstelltes Bild" loading="lazy">/);

  // SVG aus der eigenen Bruecke (smejj 1.0 zeichnet): erlaubt, weil nur im
  // <img>-Kontext gerendert — dort fuehren SVGs nie Skripte aus.
  const svg = fakeNode("![Erstelltes Bild](data:image/svg+xml;base64,AAAA)");
  render(svg);
  assert.match(svg.innerHTML, /<img class="chat-image" src="data:image\/svg\+xml;base64,AAAA"/);

  // Fremde http(s)-Bild-URL: bewusst KEIN <img> (Tracking-Kanal) — der Link-
  // Renderer macht hoechstens einen klickbaren Link aus der URL.
  const fremd = fakeNode("![x](https://boese.example/pixel.png)");
  render(fremd);
  assert.doesNotMatch(fremd.innerHTML, /<img/);

  // Kein base64 = kein Bild: rohe SVG-Quelltexte oder javascript: scheitern
  // schon an der data:image/...;base64-Pflichtform.
  const roh = fakeNode('![x](data:image/svg+xml,<svg onload="alert(1)"></svg>)');
  render(roh);
  assert.doesNotMatch(roh.innerHTML, /<img/);
});
