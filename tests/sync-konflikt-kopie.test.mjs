// smejj.com — Befund R7 der A-bis-Z-Pruefung 2026-09-14: der Verlauf-Sync war
// Last-Write-Wins OHNE Hinweis.
//
// Geraet A aendert einen Chat, Geraet B laedt spaeter eine juengere Fassung
// hoch: beim naechsten Pull ersetzte importChat den ganzen Datensatz
// (chat-sync.js, "if (lokal && fernStand <= lokalStand) continue;" — sonst
// importieren), die Aenderung von A war still weg.
//
// Der Fix: je Chat eine Abgleichsmarke `syncedAt` (Stand, den der Server
// nachweislich hat). Ist lokal seit dem letzten Abgleich geaendert UND der
// Server juenger, bleibt die lokale Fassung als Kopie "(Konflikt vom Geraet …)"
// erhalten, und ein Toast sagt es. Nichts wird geloescht.
//
// Ausfuehren: node --test tests/sync-konflikt-kopie.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  istUeberschreibKonflikt, konfliktKopie, geraeteKurzname, ohneAbgleichsmarke, nachzutragen, neueKonfliktId
} from "../public/chat-sync-auswahl.js";

const lies = (p) => fs.readFileSync(p, "utf8");
const sync = lies("public/chat-sync.js");
const store = lies("public/chat-store.js");
const bereiche = lies("public/chat-store-bereiche.js");

/** Der Rumpf einer Funktion, damit nicht versehentlich die Nachbarin geprueft wird. */
function rumpf(quelle, kopf, naechster) {
  const von = quelle.indexOf(kopf);
  assert.ok(von >= 0, `${kopf} fehlt`);
  const bis = quelle.indexOf(naechster, von);
  return quelle.slice(von, bis > 0 ? bis : undefined);
}

const T0 = "2026-09-14T10:00:00.000Z"; // letzter Abgleich
const T1 = "2026-09-14T10:05:00.000Z"; // lokale Aenderung danach
const T2 = "2026-09-14T10:09:00.000Z"; // Server noch juenger

test("R7: Konflikt = lokal seit dem Abgleich geaendert UND Server juenger", () => {
  assert.equal(istUeberschreibKonflikt({ updatedAt: T1, syncedAt: T0 }, T2), true);
  // Server aelter als lokal: kein Konflikt, der Push traegt es hoch (wie bisher).
  assert.equal(istUeberschreibKonflikt({ updatedAt: T2, syncedAt: T0 }, T1), false);
  // Lokal nichts geaendert seit dem Abgleich: der Import ist eine reine Aktualisierung.
  assert.equal(istUeberschreibKonflikt({ updatedAt: T0, syncedAt: T0 }, T2), false);
  // Gleichstand: nichts zu tun.
  assert.equal(istUeberschreibKonflikt({ updatedAt: T1, syncedAt: T0 }, T1), false);
});

test("R7: ohne Abgleichsmarke (Bestand) und im Papierkorb gilt die alte Regel", () => {
  assert.equal(istUeberschreibKonflikt({ updatedAt: T1 }, T2), false);
  assert.equal(istUeberschreibKonflikt({ updatedAt: T1, syncedAt: "" }, T2), false);
  assert.equal(istUeberschreibKonflikt({ updatedAt: T1, syncedAt: T0, deletedAt: T1 }, T2), false);
  assert.equal(istUeberschreibKonflikt(null, T2), false);
});

test("R7: die Kopie behaelt den Inhalt, bekommt neue Kennung, Herkunft im Titel, keine Marke", () => {
  const lokal = {
    id: "chat_1", ownerId: "u1", title: "Reiseplan", titleAuto: true, pinned: true, projectId: "proj_1",
    createdAt: T0, updatedAt: T1, syncedAt: T0, model: "smejj 1.0", messages: [{ role: "user", text: "Hallo" }]
  };
  const kopie = konfliktKopie(lokal, { neueId: "chat_2", geraet: "iPhone", jetzt: new Date("2026-09-14T12:00:00Z") });
  assert.equal(kopie.id, "chat_2");
  assert.equal(kopie.title, "Reiseplan (Konflikt vom Geraet iPhone, 14.09.)");
  assert.equal(kopie.titleEdited, true, "die Bruecke darf die Herkunft nicht wegbenennen");
  assert.deepEqual(kopie.messages, lokal.messages);
  assert.equal(kopie.projectId, "proj_1");
  assert.equal(kopie.ownerId, "u1");
  assert.equal("syncedAt" in kopie, false, "die Kopie war nie beim Server");
  assert.ok(Date.parse(kopie.updatedAt) > Date.parse(T1), "die Kopie ist juenger als das Original — der Push nimmt sie mit");
  // Das Original bleibt unangetastet (kein Loeschen, keine Mutation).
  assert.equal(lokal.id, "chat_1");
  assert.equal(lokal.title, "Reiseplan");
  // Eine Kopie einer Kopie stapelt den Zusatz nicht.
  const zweite = konfliktKopie(kopie, { neueId: "chat_3", geraet: "Mac", jetzt: new Date("2026-09-15T12:00:00Z") });
  assert.equal(zweite.title, "Reiseplan (Konflikt vom Geraet Mac, 15.09.)");
  assert.match(neueKonfliktId(1000), /^chat_1000_[a-z0-9]{1,6}$/, "Kennung wie newId() im Store, serverkonform");
});

test("R7: Geraetename aus dem User-Agent, mit Rueckfall", () => {
  assert.equal(geraeteKurzname("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "iPhone");
  assert.equal(geraeteKurzname("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "Android");
  assert.equal(geraeteKurzname("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), "Mac");
  assert.equal(geraeteKurzname(""), "diesem Geraet");
});

test("R7: die Marke bleibt im Geraet — der Server bekommt sie nicht", () => {
  const chat = { id: "c", updatedAt: T1, syncedAt: T0, messages: [] };
  assert.deepEqual(ohneAbgleichsmarke(chat), { id: "c", updatedAt: T1, messages: [] });
  assert.equal(chat.syncedAt, T0, "das Original wird nicht veraendert");
  assert.equal(ohneAbgleichsmarke(null), null);
});

test("R7: Bestand nachtragen — nur bei Gleichstand mit dem Server, nie wenn er juenger ist", () => {
  const karte = new Map([["a", T1], ["b", T2], ["c", T1]]);
  const chats = [
    { id: "a", updatedAt: T1 },               // gleich, Marke fehlt -> nachtragen
    { id: "b", updatedAt: T1, syncedAt: T0 }, // Server juenger -> NICHT (das ist der Konfliktfall)
    { id: "c", updatedAt: T1, syncedAt: T1 }, // schon markiert -> nichts zu tun
    { id: "d", updatedAt: T1 }                // Server kennt ihn nicht -> Push sendet ihn
  ];
  assert.deepEqual(nachzutragen(chats, karte).map((c) => c.id), ["a"]);
  assert.deepEqual(nachzutragen(chats, null), [], "ohne Karte nichts raten");
});

test("R7: pull() legt die Kopie VOR dem Import an und meldet es", () => {
  const pull = rumpf(sync, "async function pull()", "async function rette(");
  const konflikt = pull.indexOf("istUeberschreibKonflikt(lokal, voll.updatedAt)");
  const kopie = pull.indexOf("konfliktKopie(lokal,");
  const importieren = pull.indexOf("await s.importChat?.({ ...voll, syncedAt:");
  assert.ok(konflikt > 0 && kopie > konflikt && importieren > kopie, "Reihenfolge: pruefen, Kopie sichern, dann importieren");
  assert.match(pull, /await meldeKonflikte\(konflikte\);/);
  const meldung = rumpf(sync, "async function meldeKonflikte(", "async function markiereWennAngenommen(");
  assert.match(meldung, /showToast\(text, "warn"\)/, "der bestehende Toast-Mechanismus, sichtbare Stufe");
  assert.match(meldung, /Konflikt vom Geraet/);
});

test("R7: push() sendet ohne Marke und setzt sie erst, wenn der Server angenommen hat", () => {
  const push = rumpf(sync, "async function push()", "function planePush()");
  assert.doesNotMatch(push, /body: JSON\.stringify\(\{ chat \}\)/, "die rohe Fassung traegt syncedAt zum Server");
  assert.match(push, /body: JSON\.stringify\(\{ chat: ohneAbgleichsmarke\(chat\) \}\)/);
  assert.match(push, /body: JSON\.stringify\(\{ chat: ohneAbgleichsmarke\(gerettet\) \}\)/);
  assert.match(push, /if \(antwort\.ok\) \{ await markiereWennAngenommen\(s, chat, antwort\); continue; \}/);
  assert.match(push, /if \(zweiter\?\.ok\) await markiereWennAngenommen\(s, gerettet, zweiter\);/);
  assert.match(push, /for \(const c of nachzutragen\(alle, karte\)\)/);
  const marke = rumpf(sync, "async function markiereWennAngenommen(", "/** Grund aus der Antwort");
  assert.match(marke, /if \(daten\?\.uebersprungen\) return;/, "server_ist_neuer heisst: nichts stimmt ueberein");
});

test("R7: der Store fuehrt syncedAt — persistActive traegt es weiter, importChat setzt es", () => {
  const persist = rumpf(store, "export async function persistActive()", "function safeModelName()");
  assert.match(persist, /syncedAt: existing\?\.syncedAt \|\| "",/, "dieselbe Feldlisten-Falle wie pinned/titleAuto/deletedAt");
  const imp = rumpf(store, "export async function importChat(chat)", "export function neueProjektId()");
  assert.match(imp, /store\.put\(\{ \.\.\.chat, ownerId: userId \}\)/, "importChat setzt KEINE Marke — die Medien-Rettung speichert darueber, bevor der Server den Stand hat");
  assert.match(rumpf(sync, "async function pull()", "async function rette("), /importChat\?\.\(\{ \.\.\.voll, syncedAt: String\(voll\.updatedAt \|\| ""\) \}\)/, "die Marke setzt der Pull, weil nur er weiss, dass der Stand vom Server kommt");
  // markiereAbgeglichen: eine Transaktion, kein notifyChanged (Kreis), am window-Objekt registriert.
  const mark = rumpf(bereiche, "export async function markiereAbgeglichen(", "export async function endgueltigLoeschen(");
  assert.match(mark, /tx\(STORE, "readwrite"/);
  assert.match(mark, /store\.get\(String\(id\)\)/);
  assert.doesNotMatch(mark, /notifyChanged\(\)/);
  assert.match(bereiche, /window\.smejjChatStore = \{[\s\S]*markiereAbgeglichen[\s\S]*\};/);
});
