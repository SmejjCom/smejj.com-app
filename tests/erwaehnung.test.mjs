// smejj.com — "@"-Erwaehnung (Betreiber 2026-08-23, Vorbild Antigravity).
import test from "node:test";
import assert from "node:assert/strict";
const { erwaehnungVorCursor, filtereChats, auszugAus, legeKontextAb } = await import("../public/erwaehnung.js");
const { collectConversationHistory } = await import("../public/chat-history-context.js");

test("'@' am Wortanfang wird erkannt, mitten im Wort nicht", () => {
  assert.deepEqual(erwaehnungVorCursor("Schau in @Ang", 13), { filter: "Ang", start: 9 });
  assert.deepEqual(erwaehnungVorCursor("@", 1), { filter: "", start: 0 });
  assert.equal(erwaehnungVorCursor("mail@beispiel", 13), null, "eine Mailadresse ist keine Erwaehnung");
  assert.equal(erwaehnungVorCursor("@Titel fertig", 13), null, "nach dem Leerzeichen ist die Erwaehnung abgeschlossen");
});

test("Chats werden nach Titel gefiltert, hoechstens acht", () => {
  const chats = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: i % 2 ? `Angebot ${i}` : `Brief ${i}` }));
  assert.equal(filtereChats(chats, "").length, 8);
  assert.ok(filtereChats(chats, "angeb").every((c) => c.title.startsWith("Angebot")));
  assert.equal(filtereChats([{ id: "x" }], "").length, 0, "ohne Titel keine Zeile");
});

test("der Auszug nimmt die juengsten Zeilen und nennt die Rollen", () => {
  const chat = { messages: [{ role: "user", raw: "Wie teuer ist ein Buero?" }, { role: "assistant", versions: [{ raw: "Etwa 12 Euro je m²." }], active: 0 }] };
  assert.equal(auszugAus(chat), "Ich: Wie teuer ist ein Buero?\nsmejj: Etwa 12 Euro je m².");
  assert.ok(auszugAus({ messages: [{ role: "user", raw: "x".repeat(3000) }] }, 100).length <= 101);
});

test("der Kontextknoten ist unsichtbar, kein .entry, geht aber in den Verlauf", () => {
  const knoten = [];
  const log = { id: "startLog", querySelectorAll: (sel) => sel.includes("erwaehnung") ? knoten.filter((k) => k.dataset.smejjErwaehnung) : knoten, append: (k) => knoten.push(k) };
  const mk = () => ({ className: "", dataset: {}, attribute: {}, hidden: false, textContent: "", classList: { contains(c) { return this.owner.className.split(" ").includes(c); } },
    setAttribute(n, v) { this.attribute[n] = v; }, remove() { knoten.splice(knoten.indexOf(this), 1); } });
  const dokument = { getElementById: (id) => (id === "startLog" ? log : null), createElement: () => { const k = mk(); k.classList.owner = k; return k; } };
  const k = legeKontextAb(dokument, "Bürosuche", "Ich: Wie teuer?");
  assert.equal(k.hidden, true);
  assert.ok(!k.className.split(" ").includes("entry"), "kein .entry — der Speicher darf ihn nicht sichern");
  assert.match(k.textContent, /^Zur Erinnerung, Auszug aus meinem früheren Chat „Bürosuche"/);
  for (let i = 0; i < 4; i++) legeKontextAb(dokument, `c${i}`, "x");
  assert.equal(knoten.length, 3, "hoechstens drei Erwaehnungen");
  const scope = { querySelector: () => ({ querySelectorAll: () => knoten }) };
  const verlauf = collectConversationHistory(scope, "#startLog");
  assert.equal(verlauf.length, 3);
  assert.ok(verlauf.every((m) => m.role === "user"));
});
