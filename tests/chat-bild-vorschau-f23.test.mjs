// smejj.com — Befund F23 (A-bis-Z-Pruefung 2026-09-14): ein angehaengtes Bild
// stand in der eigenen Nachricht nur als Text "[Bild angehaengt: name.png]".
// ChatGPT und Claude zeigen eine Miniatur.
//
// URSACHE: app-helfer.js addEntry() schreibt nur node.textContent = text; das
// Bild selbst liegt zu diesem Zeitpunkt als data:-URL im Zwischenspeicher von
// composer-bild-anhang.js (pending) — und wird erst DANACH von app.js per
// take() abgeholt. Es fehlte ein Lesezugriff ohne Verbrauch (peek) und der
// Griff in addEntry.
//
// GRENZE: nur zur Laufzeit. chat-store.js speichert eigene Nachrichten als
// textContent (html: ""), ein <img> hat keinen Text — IndexedDB waechst nicht.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const anhang = lies("public/composer-bild-anhang.js");
const helfer = lies("public/app-helfer.js");
const store = lies("public/chat-store.js");
const app = lies("public/app.js");

test("composer-bild-anhang.js: peek() liest das anstehende Bild, OHNE es zu verbrauchen", () => {
  const block = anhang.match(/peek\(\) \{([\s\S]*?)\n {4}\}/);
  assert.ok(block, "window.smejjBildAnhang.peek() fehlt");
  assert.doesNotMatch(block[1], /pending = null/, "peek darf den Zwischenspeicher nicht leeren — take() in app.js braucht ihn danach");
  assert.match(block[1], /bildDataUrl: pending\.dataUrl/);
  assert.match(block[1], /name: pending\.name/);
});

test("app.js legt die eigene Nachricht an, BEVOR take() das Bild verbraucht", () => {
  const eintrag = app.indexOf('addEntry(task, "user", target)');
  const abholen = app.indexOf("window.smejjBildAnhang?.take?.()");
  assert.ok(eintrag > 0 && abholen > 0);
  assert.ok(eintrag < abholen, "sonst sieht peek() in addEntry nichts mehr");
});

function bildVorschauAusQuelle() {
  const start = helfer.indexOf("function haengeBildVorschauAn(");
  assert.ok(start > 0, "haengeBildVorschauAn fehlt in app-helfer.js");
  const ende = helfer.indexOf("\n}\n", start);
  return helfer.slice(start, ende + 2);
}

function fakeDom(pending) {
  const window = { smejjBildAnhang: { peek: () => (pending ? { bildDataUrl: pending.dataUrl, name: pending.name } : null) } };
  const document = { createElement: (tag) => ({ tagName: tag, style: {}, children: [], append(k) { this.children.push(k); } }) };
  const node = { textContent: "Was ist das?\n[Bild angehaengt: a.png]", children: [], append(k) { this.children.push(k); } };
  return { window, document, node };
}

test("addEntry haengt an eigene Nachrichten die Miniatur an — viereckig, 160 px, cover", () => {
  assert.match(helfer, /if \(role === "user"\) haengeBildVorschauAn\(node\);/);
  const fn = new Function("window", "document", `${bildVorschauAusQuelle()}; return haengeBildVorschauAn;`);
  const pending = { dataUrl: "data:image/jpeg;base64,AAAA", name: "a.png" };
  const { window, document, node } = fakeDom(pending);
  fn(window, document)(node);
  assert.equal(node.children.length, 1);
  const bild = node.children[0];
  assert.equal(bild.tagName, "img");
  assert.equal(bild.src, pending.dataUrl, "dieselbe data:-URL, die an die Bruecke geht");
  assert.equal(bild.alt, "a.png");
  assert.equal(bild.className, "entry-bild-vorschau");
  assert.equal(bild.style.width, "160px");
  assert.equal(bild.style.height, "160px");
  assert.equal(bild.style.objectFit, "cover");
  assert.equal(bild.style.borderRadius, "0", "Design ist viereckig");
  assert.equal(node.textContent, "Was ist das?\n[Bild angehaengt: a.png]", "der Text bleibt — er ist die gespeicherte Form");
});

test("ohne anstehendes Bild bleibt die Nachricht unveraendert", () => {
  const fn = new Function("window", "document", `${bildVorschauAusQuelle()}; return haengeBildVorschauAn;`);
  const { window, document, node } = fakeDom(null);
  fn(window, document)(node);
  assert.equal(node.children.length, 0);
  fn({}, document)(node); // aeltere Seite ohne composer-bild-anhang.js
  assert.equal(node.children.length, 0);
});

test("der Verlauf waechst nicht: eigene Nachrichten werden weiter als Text gespeichert", () => {
  assert.match(store, /html: node\.classList\.contains\("user"\) \? ""/);
  assert.match(store, /text: String\(node\.textContent \|\| ""\)/);
});
