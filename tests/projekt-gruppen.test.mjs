// Projekte in der Verlauf-Ansicht (2026-08-13): die pure Gruppierungslogik.
//
// Vertrag (dokumentiert an projektGruppen in chat-history-text.js):
// - Angeheftete Chats sind VOR dem Aufruf herausgefiltert (Pin gewinnt).
// - Eine projectId ohne lebendes Projekt zaehlt als "kein Projekt" —
//   reine Anzeige-Entscheidung, keine Datenmutation.
// - Gruppen mit Inhalt sortieren nach dem juengsten enthaltenen Chat,
//   leere Projekte dahinter nach Name (sichtbar, sonst unloeschbar).
import test from "node:test";
import assert from "node:assert/strict";
import { projektGruppen } from "../public/chat-history-text.js";

function eintrag(chatId, projectId, updatedAt) {
  return { chat: { id: chatId, projectId, updatedAt } };
}

const PROJEKTE = [
  { id: "proj_arbeit", name: "Arbeit" },
  { id: "proj_urlaub", name: "Urlaub" },
  { id: "proj_leer_b", name: "Beta" },
  { id: "proj_leer_a", name: "Alpha" }
];

test("Chats landen in ihren Projekten, der Rest bleibt fuer die Datumsliste", () => {
  const eintraege = [
    eintrag("c1", "proj_arbeit", "2026-08-13T10:00:00Z"),
    eintrag("c2", "", "2026-08-13T09:00:00Z"),
    eintrag("c3", "proj_urlaub", "2026-08-13T08:00:00Z")
  ];
  const { projektGruppen: gruppen, ohneProjekt } = projektGruppen(eintraege, PROJEKTE.slice(0, 2));
  assert.equal(gruppen.length, 2);
  assert.deepEqual(gruppen.map((gruppe) => gruppe.projekt.id), ["proj_arbeit", "proj_urlaub"]);
  assert.deepEqual(gruppen[0].chats.map((e) => e.chat.id), ["c1"]);
  assert.deepEqual(ohneProjekt.map((e) => e.chat.id), ["c2"]);
});

test("tote projectId faellt in die Datumsliste zurueck (Anzeige-Fallback)", () => {
  const eintraege = [eintrag("c1", "proj_geloescht", "2026-08-13T10:00:00Z")];
  const { projektGruppen: gruppen, ohneProjekt } = projektGruppen(eintraege, PROJEKTE.slice(0, 1));
  assert.equal(gruppen[0].chats.length, 0);
  assert.deepEqual(ohneProjekt.map((e) => e.chat.id), ["c1"]);
});

test("Gruppen sortieren nach dem juengsten Chat, leere Projekte hinten nach Name", () => {
  const eintraege = [
    eintrag("alt", "proj_arbeit", "2026-08-10T10:00:00Z"),
    eintrag("neu", "proj_urlaub", "2026-08-13T10:00:00Z")
  ];
  const { projektGruppen: gruppen } = projektGruppen(eintraege, PROJEKTE);
  assert.deepEqual(
    gruppen.map((gruppe) => gruppe.projekt.id),
    ["proj_urlaub", "proj_arbeit", "proj_leer_a", "proj_leer_b"],
    "erst nach Aktualitaet, dann die leeren alphabetisch"
  );
});

test("kaputte Eingaben bleiben harmlos", () => {
  assert.deepEqual(projektGruppen(null, null), { projektGruppen: [], ohneProjekt: [] });
  const { ohneProjekt } = projektGruppen([eintrag("c1", "", "2026-08-13T10:00:00Z")], [{ kaputt: true }, null]);
  assert.deepEqual(ohneProjekt.map((e) => e.chat.id), ["c1"]);
});
