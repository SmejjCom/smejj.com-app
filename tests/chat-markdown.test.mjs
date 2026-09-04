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

// --- Ueberschriften --------------------------------------------------------
//
// GEMESSEN 2026-08-13 im Schlussbeweis der Buero-Suche: "## Meine Empfehlung"
// stand roh samt Doppelkreuzen im Chat. Das Modell gliedert laengere Antworten
// von sich aus; der Renderer kannte nur keine Ueberschriften.

test("## wird eine echte Ueberschrift, ### eine kleinere", async () => {
  const render = await load();
  const node = fakeNode("## Meine Empfehlung\nCastro Valley ist besser aufgestellt.\n\n### Details\nMehr Text.");
  render(node);
  assert.match(node.innerHTML, /<h3 class="chat-titel">Meine Empfehlung<\/h3>/);
  assert.match(node.innerHTML, /<h4 class="chat-titel">Details<\/h4>/);
  assert.match(node.innerHTML, /<p>Castro Valley ist besser aufgestellt\.<\/p>/);
  assert.doesNotMatch(node.innerHTML, /##/, "kein Doppelkreuz bleibt stehen");
});

test("eine Ueberschrift mitten im Block trennt die Absaetze sauber", async () => {
  const render = await load();
  const node = fakeNode("Erster Satz.\n## Zwischentitel\nZweiter Satz.");
  render(node);
  assert.match(node.innerHTML, /<p>Erster Satz\.<\/p><h3 class="chat-titel">Zwischentitel<\/h3><p>Zweiter Satz\.<\/p>/);
});

test("die Chat-Skala ist gedeckelt: # bleibt h3, #### bleibt h4", async () => {
  // Eine Chat-Antwort ist kein Dokument — sie darf die App-Ueberschriften
  // nie ueberragen, egal was das Modell schickt.
  const render = await load();
  const node = fakeNode("# Riesig\nText.\n\n#### Winzig\nText.");
  render(node);
  assert.match(node.innerHTML, /<h3 class="chat-titel">Riesig<\/h3>/);
  assert.match(node.innerHTML, /<h4 class="chat-titel">Winzig<\/h4>/);
  assert.doesNotMatch(node.innerHTML, /<h1|<h2/);
});

test("Ueberschriften-Inhalt bleibt escaped und Links darin klickbar", async () => {
  const render = await load();
  const node = fakeNode("## Quelle <script> und https://a.example/\nText.");
  render(node);
  assert.match(node.innerHTML, /&lt;script&gt;/);
  assert.match(node.innerHTML, /<h3 class="chat-titel">Quelle &lt;script&gt; und <a class="chat-link"/);
});

test("Doppelkreuz ohne Leerzeichen oder mitten im Satz ist KEINE Ueberschrift", async () => {
  const render = await load();
  const kanal = fakeNode("Der Kanal #allgemein ist *aktiv*.");
  render(kanal);
  assert.doesNotMatch(kanal.innerHTML, /<h3|<h4/);
  const raute = fakeNode("#1 der Charts ist *dieser* Song.");
  render(raute);
  assert.doesNotMatch(raute.innerHTML, /<h3|<h4/, "#1 ist eine Platzierung, kein Titel");
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
  // Gezaehlt wird nicht mehr stur (2026-08-17): seit dem Stille-Abbruch gibt
  // es einen ZWEITEN Endpunkt (90 s ohne Serverzeichen -> Teilantwort behalten,
  // rendern, return). Geprueft wird darum die eigentliche Zusage: JEDER
  // Renderaufruf beendet seinen Pfad, danach waechst der Antworttext nie mehr.
  const renderStellen = chatStream.split(/renderMarkdown\?\.\(output\)/).slice(1);
  assert.ok(renderStellen.length >= 1 && renderStellen.length <= 2,
    "hoechstens zwei Endpunkte (normales Stromende und Stille-Abbruch)");
  for (const [i, danach] of renderStellen.entries()) {
    const bisPfadende = danach.split(/\n\s*return;|\n\}\s*$/)[0];
    assert.doesNotMatch(bisPfadende, /output\.textContent \+=/,
      `Renderaufruf ${i + 1}: danach darf nichts mehr an die Antwort angehaengt werden`);
  }
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

// --- Zitate und Hinweiskaesten ---------------------------------------------
//
// GEMESSEN 2026-08-13: Der Renderer kannte "> Text" nicht. Im Chat stand
// woertlich "&gt; Text" — in JEDER Modellantwort mit Zitat und in der
// Video-Statusmeldung, die "> [!NOTE]" verwendet.

async function html(text) {
  const render = await load();
  const node = fakeNode(text);
  render(node);
  return node.innerHTML;
}

test("aus '> Text' wird ein Zitat statt sichtbarer Zitatzeichen", async () => {
  const ergebnis = await html("> Eine stumme Quelle ist kein leeres Backlog.");
  assert.match(ergebnis, /<blockquote class="chat-zitat">/);
  assert.ok(!ergebnis.includes("&gt;"), "Zitatzeichen darf nicht sichtbar bleiben");
});

test("ein Zitat ohne Sternchen wird ueberhaupt gerendert", async () => {
  // MARKERS trifft hier nicht — ohne die zweite Frage (hatZitat) bliebe der
  // Text roh stehen, genau wie es Tabellen frueher passierte.
  const ergebnis = await html("> Schlichtes Zitat ohne jede Auszeichnung");
  assert.ok(ergebnis.length > 0, "Renderer hat gar nicht angefasst");
  assert.match(ergebnis, /blockquote/);
});

test("aus '> [!NOTE]' wird ein Hinweiskasten mit deutschem Titel", async () => {
  const ergebnis = await html("> [!NOTE]\n> Die Engine ist nicht erreichbar.");
  assert.match(ergebnis, /class="chat-hinweis" data-art="note"/);
  assert.match(ergebnis, /Hinweis<\/div>/);
  assert.ok(!ergebnis.includes("[!NOTE]"), "Markierungszeile gehoert nicht in den Text");
  assert.ok(ergebnis.includes("Die Engine ist nicht erreichbar."));
});

test("alle fuenf Kastenarten bekommen ihren deutschen Titel", async () => {
  for (const [art, titel] of [["TIP", "Tipp"], ["IMPORTANT", "Wichtig"], ["WARNING", "Achtung"], ["CAUTION", "Vorsicht"]]) {
    const ergebnis = await html(`> [!${art}]\n> Text dazu.`);
    assert.match(ergebnis, new RegExp(`data-art="${art.toLowerCase()}"`), art);
    assert.ok(ergebnis.includes(titel), `${art} muss ${titel} heissen`);
  }
});

test("'>' mitten im Satz bleibt Text, wird nie ein Zitat", async () => {
  const ergebnis = await html("Wenn a > b, dann gilt **das**.");
  assert.ok(!ergebnis.includes("blockquote"), "kein Zitat mitten im Satz");
  assert.match(ergebnis, /a &gt; b/);
});

test("Zitat und Aufzaehlung werden nicht verwechselt", async () => {
  assert.match(await html("> - Punkt eins\n> - Punkt zwei"), /<blockquote/);
  assert.match(await html("- Punkt eins\n- Punkt zwei"), /<ul class="chat-list">/);
});

test("im Zitat wird weiter ausgezeichnet (fett)", async () => {
  assert.match(await html("> Zweite Zeile mit **fett**."), /<strong>fett<\/strong>/);
});

test("eine schlichte Strichliste wird ueberhaupt gerendert", async () => {
  // GEFUNDEN 2026-08-13: "- Punkt" traegt kein Zeichen aus MARKERS ("*" haette
  // eines, "-" nicht) — jede Strichliste des Modells blieb Rohtext, obwohl
  // BULLET sie seit jeher kennt. Aeltester Fall dieser Luecken-Familie.
  const ergebnis = await html("- Milch holen\n- Brot kaufen\n- Zeitung mitnehmen");
  assert.match(ergebnis, /<ul class="chat-list">/);
  assert.match(ergebnis, /<li>Milch holen<\/li>/);
});

test("mp4CodecsAuslesen: liest avc1-Profil/Level und erkennt AAC (Nacht-Umbau MediaSource)", async () => {
  globalThis.window = {};
  const { mp4CodecsAuslesen } = await import(`../public/chat-markdown.js?case=${Math.random()}`);
  // Synthetischer moov-Ausschnitt: 'avcC' + [version=1, 0x64, 0x00, 0x1E] = High 3.0
  const nurVideo = new Uint8Array([0,0,0,0, 0x61,0x76,0x63,0x43, 1, 0x64, 0x00, 0x1E, 0,0,0,0]);
  assert.equal(mp4CodecsAuslesen(nurVideo.buffer), "avc1.64001e");
  // Mit 'mp4a'-Eintrag kommt AAC-LC dazu.
  const mitTon = new Uint8Array([...nurVideo, 0x6d,0x70,0x34,0x61, 0,0,0,0]);
  assert.equal(mp4CodecsAuslesen(mitTon.buffer), "avc1.64001e,mp4a.40.2");
  // Ohne avcC oder mit falscher Version: unbekannt -> blob-Reserve.
  assert.equal(mp4CodecsAuslesen(new Uint8Array(32).buffer), "");
  const falscheVersion = new Uint8Array([0x61,0x76,0x63,0x43, 9, 0x64, 0x00, 0x1E]);
  assert.equal(mp4CodecsAuslesen(falscheVersion.buffer), "");
});

test("Verdrahtung: auch die CLIENT-Wege rendern am Ende Markdown", () => {
  // LIVE GEFUNDEN 2026-09-04 im Code-Bereich (Betreiber: "teste mit einer echten
  // Aufgabe"). Mit gewaehltem Cline-Katalogmodell stand die Antwort als ROHTEXT
  // in der Blase: die ```-Zaeune sichtbar, kein <pre>, kein Kopier-Knopf.
  // Gegenprobe mit smejj 1.0 im selben Feld: <pre><code> plus Knopfleiste.
  // Ursache war die NAHT — jeder Weg in chatClient.js endet mit
  // `output.textContent`, und anders als chat-stream.js rief keiner den
  // Renderer. Beide Module waren fuer sich fehlerfrei; genau darum fiel es
  // keinem Test auf. Diese Zusage haelt die Naht fest.
  const chatClient = fs.readFileSync("public/ai/chatClient.js", "utf8");
  assert.match(chatClient, /import\(["'`]\/assets\/chat-markdown\.js/,
    "chatClient.js muss den gemeinsamen Renderer laden");
  const handledBlock = chatClient.split(/if \(handled\)/)[1] || "";
  const bisEnde = handledBlock.split(/return handled;/)[0];
  assert.match(bisEnde, /rendereAntwort\(output\)/,
    "nach einer erledigten Client-Antwort muss gerendert werden");
  // Reihenfolge: die Speichern-Knoepfe lesen die ```-Zaeune aus textContent.
  // Nach dem Rendern sind sie weg — attachCodeActions MUSS davor laufen.
  assert.ok(
    bisEnde.indexOf("attachCodeActions") >= 0
      && bisEnde.indexOf("attachCodeActions") < bisEnde.indexOf("rendereAntwort"),
    "attachCodeActions muss VOR dem Rendern laufen (liest die Code-Zaeune)"
  );
  // Sprachmodus bleibt ausgenommen: die Vorlese-Warteschlange verfolgt den
  // wachsenden Rohtext ueber einen Offset (siehe Kopf von chat-markdown.js).
  assert.match(chatClient, /voiceMode === true\) return;/,
    "im Sprachmodus darf nicht gerendert werden");
});
