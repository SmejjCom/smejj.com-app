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

// Minimales DOM: der Renderer nutzt nur textContent, innerHTML und window.
function fakeNode(text) {
  return { textContent: text, innerHTML: "" };
}

async function load(voiceMode = false) {
  globalThis.window = { smejjVoiceModePreferences: voiceMode ? { voiceMode: true } : undefined };
  const module = await import(`../public/chat-markdown.js?case=${Math.random()}`);
  return module.renderChatMarkdown;
}

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
  // Waehrend des Streams baut app.js per `textContent +=` auf — ein Rendern
  // mittendrin wuerde die Rohquelle zerstoeren.
  assert.match(appJs, /\n  renderChatMarkdown\(output\);\n\}/);
  assert.doesNotMatch(appJs, /renderChatMarkdown\(output\);\s*\n\s*output\.textContent \+=/);
  // Der Import kam ohne neue Zeile aus (Ratchet): components.js re-exportiert.
  assert.match(components, /export \{ renderChatMarkdown \} from "\.\/chat-markdown\.js/);
  assert.match(appJs, /import \{ Icons, closeModal, openModal, renderChatMarkdown, renderEmptyState, setButtonIcon, showToast \}/);
  // LIVE-FEHLER 2026-07-17: Ohne Version laedt der Browser die ALTE components.js
  // aus dem HTTP-Cache, der Re-Export fehlt und app.js bricht komplett ab.
  assert.match(appJs, /from "\.\/components\.js\?v=[^"]+"/, "components.js-Import braucht eine Cache-Version");
});
