// smejj.com — Schutztests fuer die Aktionen pro Chat-Nachricht.
//
// Freigabe 2026-07-28 (Wof Kadavanich): "Ja, Ich finde deinen Vorschlag gut,
// kannst du jetzt hintereinander komplett umsetzen bis nicht komplett fertig
// online hoer nicht auf".
//
// Zwei Kerne, die diese Tests festhalten:
//   1. Der Rohtext einer Antwort ueberlebt das Markdown-Rendern. Ohne das
//      kopiert die Leiste gerenderten Text und zerreisst Codebloecke.
//   2. Die Bedienelemente liegen NEBEN der Nachricht, nie darin. chat-store.js,
//      chat-history-context.js und das Vorlesen in composer-tools.js lesen den
//      textContent eines Eintrags — ein "Version 2 von 3" darin waere im
//      gespeicherten Verlauf und im Modellkontext gelandet.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  addVersion,
  captureRaw,
  clampVersionIndex,
  entriesFrom,
  entriesUpTo,
  isEntry,
  isRawCandidate,
  metaOf,
  nextAssistantEntry,
  nodesFrom,
  previousUserEntry,
  rawOf,
  roleOf,
  seedMeta,
  setRating
} from "../public/chat-messages.js";

import {
  barSpecFor,
  buildMenu,
  formatStamp,
  headerTextFor,
  menuItemsFor,
  toPlainText,
  versionLabel
} from "../public/chat-actions-menu.js";

// --- Minimales DOM ----------------------------------------------------------

function el(className, text = "") {
  const classes = new Set(String(className).split(/\s+/).filter(Boolean));
  return {
    className,
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name))
    },
    dataset: {},
    children: [],
    childNodes: [],
    textContent: text,
    innerHTML: "",
    nextElementSibling: null,
    previousElementSibling: null,
    parentElement: null
  };
}

// Geschwister verketten und einen Eltern-Knoten anhaengen.
function chain(nodes) {
  const parent = { firstElementChild: nodes[0] || null };
  nodes.forEach((node, index) => {
    node.previousElementSibling = nodes[index - 1] || null;
    node.nextElementSibling = nodes[index + 1] || null;
    node.parentElement = parent;
  });
  return parent;
}

function fakeDocument() {
  return {
    createElement: (tag) => {
      const node = el("");
      node.tag = tag;
      node.attributes = {};
      node.setAttribute = (name, value) => { node.attributes[name] = value; };
      node.append = (...kids) => { node.children.push(...kids); };
      return node;
    }
  };
}

// --- Nachrichten-Modell -----------------------------------------------------

test("Rohtext ueberlebt das Markdown-Rendern", () => {
  const entry = el("entry assistant", "Hier: **fett** und `code`");
  assert.equal(isRawCandidate(entry), true, "waehrend des Streams ist der Eintrag reiner Text");
  assert.equal(captureRaw(entry), "Hier: **fett** und `code`");

  // renderChatMarkdown ersetzt den Text durch HTML: Elementkinder erscheinen,
  // textContent verliert die Sternchen.
  entry.children = [el("strong"), el("code")];
  entry.textContent = "Hier: fett und code";
  assert.equal(isRawCandidate(entry), false, "gerenderter Eintrag darf nicht ueberschrieben werden");
  assert.equal(captureRaw(entry), "Hier: **fett** und `code`", "Markdown bleibt erhalten");
  assert.equal(rawOf(entry), "Hier: **fett** und `code`");
});

test('der Platzhalter "smejj denkt nach" wird nie als Rohtext gesichert', () => {
  const entry = el("entry assistant", "smejj denkt nach...");
  entry.dataset.thinking = "true";
  assert.equal(isRawCandidate(entry), false);
  assert.equal(captureRaw(entry), "");
});

test("rawOf faellt auf den sichtbaren Text zurueck, wenn kein Schnappschuss existiert", () => {
  const entry = el("entry assistant", "Aus dem Verlauf geladen");
  entry.children = [el("p")];
  assert.equal(rawOf(entry), "Aus dem Verlauf geladen");
});

test("metaOf legt eine stabile Kennung an und vergibt sie nur einmal", () => {
  const entry = el("entry user", "Frage");
  const first = metaOf(entry);
  assert.match(first.id, /^m\d+$/);
  assert.equal(entry.dataset.msgId, first.id);
  assert.equal(metaOf(entry).id, first.id, "zweiter Aufruf liefert dieselbe Kennung");
  assert.equal(first.role, "user");
  assert.equal(first.model, "", "eigene Nachrichten tragen keinen Modellnamen");
});

test("seedMeta stellt Rohtext, Zeitstempel und Modell wieder her", () => {
  const entry = el("entry assistant", "gerendert");
  seedMeta(entry, { raw: "**roh**", createdAt: "2026-07-28T14:30:00.000Z", model: "GLM-5.2", rating: "up" });
  const meta = metaOf(entry);
  assert.equal(meta.raw, "**roh**");
  assert.equal(meta.createdAt, "2026-07-28T14:30:00.000Z");
  assert.equal(meta.model, "GLM-5.2");
  assert.equal(meta.rating, "up");
});

test("Bewertung schaltet beim zweiten Klick wieder ab", () => {
  const entry = el("entry assistant", "Antwort");
  assert.equal(setRating(entry, "up"), "up");
  assert.equal(setRating(entry, "up"), "", "gleiche Bewertung erneut = zurueckgenommen");
  assert.equal(setRating(entry, "down"), "down");
});

test("addVersion zeigt immer die neueste Fassung", () => {
  const entry = el("entry assistant", "zweite Antwort");
  addVersion(entry, { raw: "erste", html: "<p>erste</p>" });
  addVersion(entry, { raw: "zweite", html: "<p>zweite</p>" });
  const meta = metaOf(entry);
  assert.equal(meta.versions.length, 2);
  assert.equal(meta.active, 1);
  assert.equal(versionLabel(meta.active, meta.versions.length), "Version 2 von 2");
});

test("Fassungen ueberleben ein Neuladen (seedMeta stellt sie wieder her)", () => {
  const entry = el("entry assistant", "Fassung B");
  entry.children = [el("p")];
  seedMeta(entry, {
    raw: "Fassung B mit `code`",
    versions: [
      { raw: "Fassung A mit **fett**", html: "<p>Fassung A</p>" },
      { raw: "Fassung B mit `code`", html: "<p>Fassung B</p>" }
    ],
    active: 1
  });
  const meta = metaOf(entry);
  assert.equal(meta.versions.length, 2);
  assert.equal(meta.active, 1);
  assert.equal(versionLabel(meta.active, meta.versions.length), "Version 2 von 2");
  assert.equal(rawOf(entry), "Fassung B mit `code`", "Kopieren liefert das Markdown der angezeigten Fassung");
});

test("seedMeta haertet kaputte Fassungslisten ab", () => {
  const entry = el("entry assistant", "x");
  seedMeta(entry, { versions: [null, { raw: "A" }, "kaputt", { html: "<p>B</p>" }], active: 99 });
  const meta = metaOf(entry);
  assert.equal(meta.versions.length, 2, "nur echte Objekte werden uebernommen");
  assert.deepEqual(meta.versions, [{ raw: "A", html: "" }, { raw: "", html: "<p>B</p>" }]);
  assert.equal(meta.active, 1, "ein zu grosser Zeiger wird auf die letzte Fassung begrenzt");
});

test("seedMeta ohne Zeiger zeigt die neueste Fassung", () => {
  const entry = el("entry assistant", "x");
  seedMeta(entry, { versions: [{ raw: "A" }, { raw: "B" }, { raw: "C" }] });
  assert.equal(metaOf(entry).active, 2);
});

test("clampVersionIndex verschiebt den Zeiger mit abgeschnittenen Fassungen", () => {
  assert.equal(clampVersionIndex(0, 3), 0);
  assert.equal(clampVersionIndex(2, 3), 2);
  assert.equal(clampVersionIndex(7, 3), 2, "zu gross wird begrenzt");
  assert.equal(clampVersionIndex(-3, 3), 0, "negativ nach dem Abschneiden wird 0");
  assert.equal(clampVersionIndex(1, 0), 0, "ohne Fassungen immer 0");
  assert.equal(clampVersionIndex(NaN, 3), 0);
});

// --- Non-Regression: Bedienelemente sind Geschwister ------------------------

test("isEntry unterscheidet Nachrichten von Bedienelementen", () => {
  assert.equal(isEntry(el("entry user")), true);
  assert.equal(isEntry(el("msg-actions is-user")), false);
  assert.equal(isEntry(el("msg-editor")), false);
  assert.equal(isEntry(el("msg-undo")), false);
});

test("previousUserEntry ueberspringt Aktionsleisten und findet die Frage", () => {
  const frage = el("entry user", "Wie geht das?");
  const frageBar = el("msg-actions is-user");
  const antwort = el("entry assistant", "So geht das.");
  const antwortBar = el("msg-actions is-assistant");
  chain([frage, frageBar, antwort, antwortBar]);

  assert.equal(previousUserEntry(antwort), frage);
  // Ohne die isEntry-Pruefung waere die Leiste als "assistant" gelesen worden.
  assert.equal(roleOf(frageBar), "assistant", "eine Leiste traegt keine user-Klasse");
  assert.equal(previousUserEntry(frage), null);
});

test("nextAssistantEntry ueberspringt die Leiste der eigenen Nachricht", () => {
  const frage = el("entry user", "Frage");
  const bar = el("msg-actions is-user");
  const antwort = el("entry assistant", "Antwort");
  chain([frage, bar, antwort]);
  assert.equal(nextAssistantEntry(frage), antwort);

  const ohneAntwort = el("entry user", "Frage");
  const zweiteFrage = el("entry user", "noch eine");
  chain([ohneAntwort, zweiteFrage]);
  assert.equal(nextAssistantEntry(ohneAntwort), null);
});

test("nodesFrom nimmt Leisten mit, entriesFrom nur Nachrichten", () => {
  const nodes = [
    el("entry user", "eins"),
    el("msg-actions is-user"),
    el("entry assistant", "zwei"),
    el("msg-actions is-assistant")
  ];
  chain(nodes);
  assert.equal(nodesFrom(nodes[0]).length, 4, "Loeschen darf keine verwaiste Leiste zuruecklassen");
  assert.deepEqual(entriesFrom(nodes[0]), [nodes[0], nodes[2]]);
});

test("entriesUpTo liefert den Verlauf bis einschliesslich dieser Nachricht", () => {
  const nodes = [
    el("entry user", "eins"),
    el("msg-actions is-user"),
    el("entry assistant", "zwei"),
    el("msg-actions is-assistant"),
    el("entry user", "drei")
  ];
  chain(nodes);
  assert.deepEqual(entriesUpTo(nodes[2]), [nodes[0], nodes[2]], "Abzweigen nimmt nur Nachrichten mit");
  assert.equal(entriesUpTo(nodes[4]).length, 3);
});

// --- Leiste und Menue -------------------------------------------------------

test("Belegung der Leiste je Rolle", () => {
  const user = barSpecFor("user").map((spec) => spec.act);
  assert.deepEqual(user, ["copy", "edit", "menu"], "Bearbeiten bleibt — ChatGPT hat es im Mai 2026 entfernt");

  const assistant = barSpecFor("assistant").map((spec) => spec.act);
  assert.deepEqual(assistant, ["copy", "rate-up", "rate-down", "regen", "menu"]);
  assert.equal(assistant.at(-1), "menu", "das Ueberlaufmenue steht immer am Ende");

  for (const spec of [...barSpecFor("user"), ...barSpecFor("assistant")]) {
    assert.ok(spec.label && spec.label.length > 2, `${spec.act} braucht eine Beschriftung fuer aria-label`);
  }
});

test("Menuepunkte je Rolle, Loeschen zuletzt und als Gefahr markiert", () => {
  const user = menuItemsFor("user").map((item) => item.act);
  assert.deepEqual(user, ["fork", "remove"]);

  const assistant = menuItemsFor("assistant");
  assert.deepEqual(assistant.map((item) => item.act), ["copy-plain", "speak", "fork", "remove"]);
  assert.equal(assistant.at(-1).danger, true);
  assert.ok(!assistant.some((item) => item.act === "sources"), "keine Quellenliste, solange keine Quellen erfasst werden");
});

test("versionLabel ist lesbar statt zwei namenloser Pfeile", () => {
  assert.equal(versionLabel(0, 3), "Version 1 von 3");
  assert.equal(versionLabel(1, 3), "Version 2 von 3");
});

test("toPlainText baut Markdown ab, ohne Code zu verstuemmeln", () => {
  assert.equal(toPlainText("Das ist **fett** und `inline`"), "Das ist fett und inline");
  assert.equal(toPlainText("```js\nconst a = 1 * 2;\n```"), "const a = 1 * 2;", "Sternchen im Code bleiben");
  assert.equal(toPlainText("- eins\n- zwei"), "• eins\n• zwei");
  assert.equal(toPlainText("ein *kursives* Wort"), "ein kursives Wort");
  assert.equal(toPlainText(""), "");
});

test("formatStamp: heute Uhrzeit, laufende Woche Wochentag, davor Datum", () => {
  const now = new Date(2026, 6, 28, 18, 0, 0);
  assert.equal(formatStamp(new Date(2026, 6, 28, 16, 30).toISOString(), now), "Heute, 16:30");
  assert.equal(formatStamp(new Date(2026, 6, 26, 9, 5).toISOString(), now), "Sonntag, 09:05");
  assert.equal(formatStamp(new Date(2026, 6, 1, 7, 0).toISOString(), now), "01.07.2026, 07:00");
  assert.equal(formatStamp("kein datum", now), "");
});

test("Kopfzeile nennt das Modell nur bei Antworten", () => {
  const now = new Date(2026, 6, 28, 18, 0, 0);
  const stamp = new Date(2026, 6, 28, 16, 30).toISOString();
  assert.equal(headerTextFor({ role: "assistant", createdAt: stamp, model: "smejj 1.0" }, now), "Heute, 16:30 · smejj 1.0");
  assert.equal(headerTextFor({ role: "user", createdAt: stamp, model: "smejj 1.0" }, now), "Heute, 16:30");
});

test("buildMenu erzeugt bedienbare Menuepunkte mit Trennlinie vor dem Loeschen", () => {
  const now = new Date(2026, 6, 28, 18, 0, 0);
  const menu = buildMenu(fakeDocument(), {
    role: "assistant",
    createdAt: new Date(2026, 6, 28, 16, 30).toISOString(),
    model: "smejj 1.0"
  }, now);

  assert.equal(menu.className, "msg-menu");
  assert.equal(menu.attributes.role, "menu");
  assert.ok(menu.attributes["aria-label"], "das Menue braucht einen Namen fuer Screenreader");

  const head = menu.children[0];
  assert.equal(head.className, "msg-menu-head");
  assert.equal(head.textContent, "Heute, 16:30 · smejj 1.0");

  const items = menu.children.filter((node) => String(node.className).includes("msg-menu-item"));
  assert.equal(items.length, 4);
  for (const item of items) {
    assert.equal(item.type, "button", "Menuepunkte sind echte Knoepfe und damit fokussierbar");
    assert.equal(item.attributes.role, "menuitem");
    assert.ok(item.dataset.act);
  }
  assert.ok(menu.children.some((node) => node.className === "msg-menu-line"), "Trennlinie vor der Gefahr-Aktion");
});

// --- Verdrahtung im Projekt -------------------------------------------------

const actions = fs.readFileSync("public/chat-actions.js", "utf8");
const actionsCss = fs.readFileSync("public/chat-actions.css", "utf8");
const store = fs.readFileSync("public/chat-store.js", "utf8");
const historyContext = fs.readFileSync("public/chat-history-context.js", "utf8");
const indexHtml = fs.readFileSync("public/index.html", "utf8");
const swJs = fs.readFileSync("public/sw.js", "utf8");
const bundler = fs.readFileSync("scripts/build/bundle-start-styles.mjs", "utf8");
const appJs = fs.readFileSync("public/app.js", "utf8");

test("die Leiste wird als Geschwister eingehaengt, nie in die Nachricht", () => {
  assert.match(actions, /entry\.after\(bar\)/, "Leiste per after() neben die Nachricht");
  assert.match(actions, /entry\.after\(editor\)/, "Editor ebenfalls daneben");
  assert.ok(!/entry\.append\(/.test(actions), "nichts wird in die Nachricht hineingehaengt");
});

test("Leser des Nachrichtentexts sehen die Bedienelemente nicht", () => {
  assert.match(store, /querySelectorAll\(":scope > \.entry"\)/, "der Verlauf-Speicher liest nur Nachrichten");
  assert.match(historyContext, /querySelectorAll\("\.entry\.user, \.entry\.assistant"\)/, "der Modellkontext liest nur Nachrichten");
});

test("der Verlauf speichert Rohtext und gibt ihn zurueck", () => {
  assert.match(store, /raw: String\(meta\.raw \|\| ""\)/);
  assert.match(store, /createdAt: String\(meta\.createdAt \|\| ""\)/);
  assert.match(store, /seedMeta\(node, \{/, "beim Wiederherstellen zurueckgeben");
  assert.match(store, /export async function createChatFrom/, "Abzweigen legt einen eigenen Chat an");
  assert.ok(!/store\.delete/.test(store.split("export async function createChatFrom")[1] || ""), "Abzweigen loescht nichts");
});

test("der Verlauf speichert die Fassungen mit Obergrenze", () => {
  assert.match(store, /const MAX_VERSIONS = \d+;/, "Obergrenze gegen unbegrenztes Wachstum des lokalen Speichers");
  assert.match(store, /slice\(-MAX_VERSIONS\)/, "die juengsten Fassungen behalten");
  assert.match(store, /active: clampVersionIndex\(/, "Zeiger auf die gekuerzte Liste umrechnen");
  assert.match(store, /versions: message\.versions/, "beim Wiederherstellen zurueckgeben");
  assert.match(store, /active: message\.active/);
  assert.match(actions, /versions: meta\.versions/, "ein abgezweigter Chat nimmt die Fassungen mit");
});

test("app.js bleibt unangetastet und unter der Zeilengrenze", () => {
  assert.ok(!appJs.includes("chat-actions"), "die Funktion haengt sich selbst ein, app.js kennt sie nicht");
  assert.ok(appJs.split("\n").length <= 800, "800-Zeilen-Regel (Start-Lock, check-guidelines)");
});

test("index.html laedt das Modul, sw.js hat es im Precache", () => {
  assert.match(indexHtml, /assets\/chat-actions\.js\?v=/, "Modul eingebunden");
  for (const path of ["/assets/chat-actions.js", "/assets/chat-messages.js", "/assets/chat-actions-menu.js"]) {
    assert.ok(swJs.includes(`"${path}"`), `${path} fehlt im Precache — die App waere offline tot`);
  }
  const version = Number(/smejj-shell-v(\d+)/.exec(swJs)?.[1] || 0);
  assert.ok(version >= 165, `CACHE_NAME muss gesprungen sein, ist v${version}`);
});

test("der Stil liegt im gebuendelten Stylesheet, nicht als zweites <link>", () => {
  assert.match(bundler, /"chat-actions\.css"/, "im Buendel (Performance-Lock: ein Stylesheet)");
  assert.ok(!/chat-actions\.css/.test(indexHtml), "kein eigenes render-blockierendes <link>");
});

test("der Beobachter kann sich nicht selbst endlos erneut aufrufen", () => {
  // Live-Befund 2026-07-28 (lokaler Test): sobald der erste Versionswaehler
  // entstand, schrieb syncVersions das Label bei jedem Auffrischen neu. Eine
  // textContent-Zuweisung ist auch bei gleichem Text eine Mutation — der
  // Beobachter rief erneut auf, schrieb erneut, der Renderer stand still.
  const messages = fs.readFileSync("public/chat-messages.js", "utf8");
  assert.match(messages, /observer\?\.takeRecords\(\)/, "eigene Mutationen werden verworfen");
  assert.match(actions, /function setText\(node, text\)[\s\S]{0,120}node\.textContent !== text/, "nur bei echter Aenderung schreiben");
  assert.match(actions, /setText\(picker\.querySelector\("\.msg-version-label"\)/, "das Versions-Label geht ueber setText");
  assert.ok(
    !/\.msg-version-label"\)\.textContent =/.test(actions),
    "das Label darf nicht direkt zugewiesen werden"
  );
});

test("die Leiste haengt nicht an :hover allein (WCAG 2.1.1)", () => {
  assert.match(actionsCss, /:focus-within/, "Tastaturfokus zeigt die Leiste genauso wie die Maus");
  assert.match(actionsCss, /:focus-visible/, "sichtbarer Fokusring");
  assert.ok(!/opacity:\s*0;/.test(actionsCss), "nicht per opacity ausblenden — sonst ist der Fokusring unsichtbar");
});

test("die Leiste bricht um statt die Touch-Ziele zu quetschen", () => {
  // Gemessen 2026-07-28 auf 375 px mit Touch-Maßen: fuenf Aktionen, zwei
  // Versionspfeile und "Version 2 von 3" ergeben rund 366 px in einer 359 px
  // breiten Zeile — Flexbox schrumpfte die Knoepfe auf 37 px, unter das
  // Touch-Ziel. Umbruch plus flex: 0 0 auto haelt die Groesse.
  assert.match(actionsCss, /\.msg-actions \{[\s\S]*?flex-wrap: wrap;/, "die Leiste darf umbrechen");
  assert.match(actionsCss, /\.msg-act \{[\s\S]*?flex: 0 0 auto;/, "ein Knopf darf nie schrumpfen");
});

test("das Touch-Ziel bleibt 42 px, kompakt wird nur mit Maus", () => {
  // Live-Befund 2026-07-28: styles.css setzt projektweit `button { min-height:
  // 42px }` als Touch-Ziel. Die Leiste hatte height 28px ohne min-height und
  // wurde dadurch 28 breit / 42 hoch — sichtbar verzogen. Die Voreinstellung
  // bleibt jetzt das grosse Ziel; kompakt nur hinter (pointer: fine).
  const basis = actionsCss.split("@media (pointer: fine)")[0];
  assert.match(basis, /\.msg-act \{[\s\S]*?min-height: 42px;/, "Voreinstellung ist das 42-px-Touch-Ziel");
  assert.match(actionsCss, /@media \(pointer: fine\)[\s\S]*?min-height: 28px;/, "kompakt nur mit praezisem Zeigegeraet");
});
