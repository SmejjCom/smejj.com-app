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
  addSources,
  addVersion,
  captureRaw,
  clampVersionIndex,
  hasSources,
  normalisiereQuellen,
  entriesFrom,
  entriesUpTo,
  isEntry,
  isRawCandidate,
  metaOf,
  nextAssistantEntry,
  nextMenuIndex,
  nodesFrom,
  planEdit,
  planRegenerate,
  planRemoval,
  planSettle,
  previousUserEntry,
  rawOf,
  restoreNodes,
  roleOf,
  seedMeta,
  setRating,
  versionsToStash
} from "../public/chat-messages.js";

import {
  barSpecFor,
  buildMenu,
  buildSourcePanel,
  formatStamp,
  headerTextFor,
  menuItemsFor,
  shortUrl,
  sourceStatusText,
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

// Ein Log, dessen Knoten sich wirklich einhaengen und entfernen lassen.
// Damit werden Loeschen, Rueckgaengig und Bearbeiten als Verhalten geprueft,
// nicht als Quelltext-Muster.
function verkette(log) {
  log.children.forEach((node, index) => {
    node.parentElement = log;
    node.previousElementSibling = log.children[index - 1] || null;
    node.nextElementSibling = log.children[index + 1] || null;
    node.after = (neu) => {
      const position = log.children.indexOf(node);
      if (position < 0) return; // bereits entfernt: nichts einhaengen
      log.children.splice(position + 1, 0, neu);
      verkette(log);
    };
    node.remove = () => {
      const position = log.children.indexOf(node);
      if (position < 0) return;
      log.children.splice(position, 1);
      verkette(log);
    };
  });
  log.firstElementChild = log.children[0] || null;
}

function mkLog(nodes = []) {
  const log = {
    children: [...nodes],
    firstElementChild: null,
    prepend(node) { log.children.unshift(node); verkette(log); },
    append(node) { log.children.push(node); verkette(log); }
  };
  verkette(log);
  return log;
}

// Alte Signatur beibehalten: verkettet und liefert den Eltern-Knoten.
function chain(nodes) {
  return mkLog(nodes);
}

const beschriftung = (log) => log.children.map((n) => n.textContent || n.className);

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

// --- Quellen ----------------------------------------------------------------

const QUELLE = {
  url: "https://beispiel.de/seite",
  title: "Beispielseite",
  status: 200,
  ok: true,
  abgerufenAm: new Date(2026, 6, 28, 16, 30).toISOString()
};

test("Quellen ohne Adresse zaehlen nicht", () => {
  assert.deepEqual(normalisiereQuellen([{ title: "ohne Adresse" }, null, "kaputt", { url: "   " }]), []);
  assert.equal(normalisiereQuellen([QUELLE]).length, 1);
  assert.deepEqual(normalisiereQuellen("keine Liste"), []);
});

test("Quellen werden nicht doppelt angehaengt", () => {
  const antwort = el("entry assistant", "Antwort mit Beleg");
  assert.equal(hasSources(antwort), false, "ohne Grounding gibt es keine Quelle");
  assert.equal(addSources(antwort, [QUELLE]), 1);
  assert.equal(addSources(antwort, [QUELLE]), 1, "dieselbe Adresse kommt kein zweites Mal hinein");
  assert.equal(addSources(antwort, [{ ...QUELLE, url: "https://beispiel.de/andere" }]), 2);
  assert.equal(hasSources(antwort), true);
});

test("Quellen ueberleben ein Neuladen", () => {
  const antwort = el("entry assistant", "wiederhergestellt");
  seedMeta(antwort, { sources: [QUELLE, { title: "ohne Adresse" }] });
  const meta = metaOf(antwort);
  assert.equal(meta.sources.length, 1, "kaputte Eintraege werden beim Laden aussortiert");
  assert.equal(meta.sources[0].url, "https://beispiel.de/seite");
  assert.equal(hasSources(antwort), true);
});

test('"Quellen anzeigen" erscheint nur mit echter Quelle', () => {
  assert.ok(!menuItemsFor("assistant", false).some((i) => i.act === "sources"), "ohne Beleg kein Menuepunkt");
  const mitQuelle = menuItemsFor("assistant", true);
  assert.equal(mitQuelle[0].act, "sources", "mit Beleg steht er ganz oben");
  assert.equal(mitQuelle.length, 5);
  assert.ok(!menuItemsFor("user", true).some((i) => i.act === "sources"), "eigene Nachrichten haben keine Quellen");
});

test("Abrufergebnis wird ehrlich benannt, auch ein Fehler", () => {
  assert.equal(sourceStatusText({ ok: true, status: 200 }), "geladen · HTTP 200");
  assert.equal(sourceStatusText({ ok: true, status: 0 }), "geladen");
  assert.equal(sourceStatusText({ ok: false, status: 404 }), "Fehler · HTTP 404");
  assert.equal(sourceStatusText({ ok: false, status: 0 }), "nicht ladbar");
});

test("lange Adressen werden lesbar gekuerzt", () => {
  assert.equal(shortUrl("https://beispiel.de/seite/"), "beispiel.de/seite");
  assert.equal(shortUrl("http://beispiel.de"), "beispiel.de");
  const lang = shortUrl(`https://beispiel.de/${"a".repeat(120)}`);
  assert.ok(lang.length <= 58 && lang.endsWith("…"));
});

test("Quellenliste zeigt Adresse, Ergebnis und Zeitpunkt", () => {
  const now = new Date(2026, 6, 28, 18, 0, 0);
  const panel = buildSourcePanel(fakeDocument(), [QUELLE], now);
  assert.equal(panel.className, "msg-sources");
  // Gegroundet wird die FRAGE — scheitert der Antwortstrom, waere "Quelle dieser
  // Antwort" eine falsche Behauptung (Live-Befund 2026-07-28).
  assert.equal(panel.attributes["aria-label"], "Für diese Frage geladene Seiten");

  const kopf = panel.children[0];
  assert.equal(kopf.children[0].textContent, "1 Seite für diese Frage geladen");
  assert.equal(kopf.children[1].dataset.act, "sources-close");

  const zeile = panel.children[1];
  const link = zeile.children[0];
  assert.equal(link.href, "https://beispiel.de/seite");
  assert.equal(link.rel, "noopener noreferrer", "fremde Seiten oeffnen ohne Zugriff auf diese Seite");
  assert.equal(link.target, "_blank");
  assert.equal(link.textContent, "Beispielseite");
  assert.equal(zeile.children[1].textContent, "beispiel.de/seite · geladen · HTTP 200 · abgerufen Heute, 16:30");

  const zwei = buildSourcePanel(fakeDocument(), [QUELLE, { ...QUELLE, url: "https://b.de/x" }], now);
  assert.equal(zwei.children[0].children[0].textContent, "2 Seiten für diese Frage geladen");
});

// --- Verhalten der Aktionen -------------------------------------------------

// Ein typischer Verlauf: Frage, Antwort, Frage, Antwort — je mit Leiste.
function beispielLog() {
  const f1 = el("entry user", "erste Frage");
  const b1 = el("msg-actions is-user");
  const a1 = el("entry assistant", "erste Antwort");
  const b2 = el("msg-actions is-assistant");
  const f2 = el("entry user", "zweite Frage");
  const b3 = el("msg-actions is-user");
  const a2 = el("entry assistant", "zweite Antwort");
  const b4 = el("msg-actions is-assistant");
  return { log: mkLog([f1, b1, a1, b2, f2, b3, a2, b4]), f1, b1, a1, b2, f2, b3, a2, b4 };
}

test("Ab hier loeschen entfernt Nachrichten samt Leisten und zaehlt richtig", () => {
  const { log, f2, a1 } = beispielLog();
  const plan = planRemoval(f2);
  assert.equal(plan.anzahl, 2, "zwei Nachrichten ab hier");
  assert.equal(plan.nodes.length, 4, "beide Leisten wandern mit — nichts bleibt verwaist");
  assert.equal(plan.anker, log.children[3], "eingehaengt wird spaeter hinter der Leiste der ersten Antwort");
  for (const node of plan.nodes) node.remove();
  assert.deepEqual(beschriftung(log), ["erste Frage", "msg-actions is-user", "erste Antwort", "msg-actions is-assistant"]);
  assert.equal(a1.nextElementSibling.className, "msg-actions is-assistant");
});

test("Rueckgaengig stellt die alte Reihenfolge exakt wieder her", () => {
  const { log } = beispielLog();
  const vorher = beschriftung(log);
  const plan = planRemoval(log.children[4]);
  for (const node of plan.nodes) node.remove();
  assert.equal(log.children.length, 4);
  const wieder = restoreNodes(log, plan.nodes, plan.anker);
  assert.equal(wieder, 4);
  assert.deepEqual(beschriftung(log), vorher, "Reihenfolge identisch zum Ausgangszustand");
});

test("Rueckgaengig ganz am Anfang haengt wieder vorn ein", () => {
  const { log } = beispielLog();
  const vorher = beschriftung(log);
  const plan = planRemoval(log.children[0]);
  assert.equal(plan.anker, null, "vor der ersten Nachricht gibt es keinen Anker");
  for (const node of plan.nodes) node.remove();
  assert.equal(log.children.length, 0);
  restoreNodes(log, plan.nodes, plan.anker);
  assert.deepEqual(beschriftung(log), vorher);
});

test("Neu generieren stellt dieselbe Frage und sichert die alte Antwort", () => {
  const { log, a2, f2 } = beispielLog();
  const plan = planRegenerate(a2);
  assert.equal(plan.ok, true);
  assert.equal(plan.text, "zweite Frage", "es wird die vorherige Frage erneut gestellt");
  assert.deepEqual(plan.stash.map((v) => v.raw), ["zweite Antwort"], "die alte Antwort wird Fassung 1");
  assert.equal(plan.entfernen.length, 4, "Frage, ihre Leiste, Antwort und deren Leiste");
  assert.equal(plan.entfernen[0], f2);
  for (const node of plan.entfernen) node.remove();
  assert.deepEqual(beschriftung(log), ["erste Frage", "msg-actions is-user", "erste Antwort", "msg-actions is-assistant"]);
});

test("Neu generieren ohne vorherige Frage wird abgelehnt", () => {
  const allein = el("entry assistant", "Antwort ohne Frage");
  mkLog([allein]);
  assert.deepEqual(planRegenerate(allein), { ok: false, grund: "keine_frage" });
});

test("Neu generieren behaelt bereits vorhandene Fassungen statt neu zu schnappschussen", () => {
  const { a2 } = beispielLog();
  addVersion(a2, { raw: "alt A", html: "<p>A</p>" });
  addVersion(a2, { raw: "alt B", html: "<p>B</p>" });
  const plan = planRegenerate(a2);
  assert.deepEqual(plan.stash.map((v) => v.raw), ["alt A", "alt B"], "beide bisherigen Fassungen bleiben erhalten");
});

test("Bearbeiten sendet den bereinigten Text und sichert die folgende Antwort", () => {
  const { log, f2, a2 } = beispielLog();
  const plan = planEdit(f2, "   zweite Frage, praeziser   ");
  assert.equal(plan.ok, true);
  assert.equal(plan.text, "zweite Frage, praeziser", "Leerraum wird abgeschnitten");
  assert.deepEqual(plan.stash.map((v) => v.raw), ["zweite Antwort"], "die Antwort darauf wird Fassung 1");
  assert.equal(plan.entfernen.length, 4);
  assert.equal(plan.entfernen[0], f2);
  assert.ok(plan.entfernen.includes(a2));
  for (const node of plan.entfernen) node.remove();
  assert.equal(log.children.length, 4);
});

test("Bearbeiten mit leerem Text wird abgelehnt", () => {
  const { f2 } = beispielLog();
  assert.deepEqual(planEdit(f2, "   "), { ok: false, grund: "leer" });
  assert.deepEqual(planEdit(f2, ""), { ok: false, grund: "leer" });
  assert.deepEqual(planEdit(null, "Text"), { ok: false, grund: "leer" });
});

test("Bearbeiten der letzten Frage ohne Antwort sichert nichts", () => {
  const f = el("entry user", "offene Frage");
  const b = el("msg-actions is-user");
  mkLog([f, b]);
  const plan = planEdit(f, "neue Fassung");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.stash, [], "es gibt keine Antwort, die gesichert werden muesste");
  assert.deepEqual(versionsToStash(null), []);
});

test("Fassungen werden erst gesetzt, wenn der Lauf wirklich fertig ist", () => {
  const { log, a2 } = beispielLog();
  const eintraege = log.children.filter((n) => isEntry(n));
  assert.deepEqual(planSettle(eintraege, true), { ok: false, grund: "laeuft_noch" });

  const denkend = el("entry assistant", "smejj denkt nach...");
  denkend.dataset.thinking = "true";
  assert.deepEqual(planSettle([denkend], false), { ok: false, grund: "denkt_noch" });

  assert.deepEqual(planSettle([el("entry user", "Frage")], false), { ok: false, grund: "keine_antwort" });
  assert.deepEqual(planSettle([el("entry assistant", "   ")], false), { ok: false, grund: "leer" });
  assert.deepEqual(planSettle([], false), { ok: false, grund: "keine_antwort" });

  const fertig = planSettle(eintraege, false);
  assert.equal(fertig.ok, true);
  assert.equal(fertig.ziel, a2, "die neueste Antwort bekommt die Fassungen");
  assert.equal(fertig.raw, "zweite Antwort");
});

test("Pfeiltasten laufen im Menue um", () => {
  assert.equal(nextMenuIndex(0, 1, 4), 1);
  assert.equal(nextMenuIndex(3, 1, 4), 0, "hinter dem letzten Punkt geht es vorn weiter");
  assert.equal(nextMenuIndex(0, -1, 4), 3, "vor dem ersten Punkt geht es hinten weiter");
  assert.equal(nextMenuIndex(-1, 1, 4), 0, "ohne Fokus beginnt Pfeil-ab beim ersten Punkt");
  assert.equal(nextMenuIndex(-1, -1, 4), 3);
  assert.equal(nextMenuIndex(0, 1, 0), 0, "leeres Menue faellt nicht um");
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
  // NUR den Rumpf von createChatFrom pruefen, nicht den ganzen Rest der Datei.
  // Der Schnitt "alles nach dem Funktionsnamen" schlug am 2026-08-13 falsch an:
  // hinter createChatFrom stehen inzwischen deleteChat und loescheProjekt
  // ("Projekte"), die selbstverstaendlich loeschen duerfen. Ein Test, der ueber
  // die eigene Funktion hinausgreift, meldet fremde Arbeit als eigenen Fehler.
  const rumpfCreateChatFrom = (store.split("export async function createChatFrom")[1] || "")
    .split(/\nexport /)[0];
  // Faengt den stillen Ausfall ab: wird die Funktion umbenannt, waere der Rumpf
  // leer und die Pruefung darunter immer gruen, ohne je etwas zu pruefen.
  assert.ok(rumpfCreateChatFrom.length > 0, "createChatFrom hat einen Rumpf");
  assert.ok(!/store\.delete/.test(rumpfCreateChatFrom), "Abzweigen loescht nichts");
});

test("Quellen kommen aus echtem Grounding, nicht aus Raten", () => {
  const grounding = fs.readFileSync("public/browser-context.js", "utf8");
  assert.match(grounding, /export function groundingFor/, "browser-context.js gibt Auskunft, was es geladen hat");
  assert.match(grounding, /merkeQuelle\(text, context\)/, "gemerkt wird im Ground-Pfad");
  assert.match(grounding, /if \(!context\) return;/, "ein gescheiterter Abruf begruendet nichts und wird nicht gemerkt");
  assert.match(grounding, /MAX_QUELLEN/, "die Karte waechst nicht unbegrenzt");

  assert.match(actions, /import \{ groundingFor \}/, "die Leiste fragt die echte Quelle ab");
  // Live-Befund 2026-07-28: mit "?v=1" entstand eine ZWEITE Modulinstanz mit
  // eigenem Quellen-Gedaechtnis — app.js schrieb in die eine, die Leiste las aus
  // der anderen, und "Quellen anzeigen" waere nie erschienen.
  const appImport = /from "\.\/browser-context\.js(\?[^"]*)?"/.exec(appJs);
  assert.ok(appImport, "app.js importiert browser-context.js");
  const actionsImport = /from "\/assets\/browser-context\.js(\?[^"]*)?"/.exec(actions);
  assert.ok(actionsImport, "chat-actions.js importiert browser-context.js");
  assert.equal(
    actionsImport[1] || "",
    appImport[1] || "",
    "beide muessen DENSELBEN Spezifizierer benutzen, sonst zwei Modulinstanzen"
  );
  assert.match(actions, /const frage = previousUserEntry\(last\);/, "zugeordnet wird ueber die Frage davor, nicht ueber die letzte Quelle");
  assert.match(store, /sources: Array\.isArray\(meta\.sources\)/, "der Verlauf speichert die Quellen");
  assert.match(store, /sources: message\.sources/, "und gibt sie beim Wiederherstellen zurueck");
});

test("die Quellenliste haengt neben der Nachricht, nicht darin", () => {
  assert.match(actions, /\(barOf\(entry\) \|\| entry\)\.after\(panel\)/, "Panel als Geschwister");
  assert.ok(!/entry\.append\(panel\)/.test(actions));
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

test("auf schmalen Schirmen sind die Aktionsknoepfe 44 px", () => {
  // Live gemessen 2026-08-09 (375 px, Geraete-Emulation, pointer coarse): alle
  // Aktionsknoepfe waren 42x42 — knapp unter den 44 px, die Apple und Google
  // als Untergrenze nennen. Angehoben wird NUR unterhalb 600 px.
  const schmal = actionsCss.split("@media (max-width: 600px)")[1] || "";
  assert.match(schmal, /min-height: 44px;/, "unterhalb 600 px gilt 44 px");

  // Der Selektor braucht mehr Gewicht als `.premium-view button` (0,1,1) aus
  // app-surfaces.css, das mobil `width: 100%` setzt — sonst verliert er.
  assert.match(schmal, /#startLog \.msg-act/, "ID-Anker gegen .premium-view button");
  assert.match(schmal, /\.msg-act\.msg-act/, "doppelte Klasse fuer Leisten ausserhalb von #startLog");

  // Der Desktop bleibt kompakt, auch wenn das Fenster schmal ist: sonst wuerde
  // die neue, hoeher gewichtete Regel die 28 px mit der Maus ueberschreiben.
  const mausAusnahme = actionsCss.split("@media (max-width: 600px) and (pointer: fine)")[1] || "";
  assert.match(mausAusnahme, /min-height: 28px;/, "mit Maus bleibt es bei 28 px");
});
