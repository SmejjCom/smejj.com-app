// smejj.com — Unit-Tests fuer Ankuendigungen und Wartungsfenster.
// Ausfuehren: node --test control-server/src/admin/announcements.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  __clearAnnouncementsForTests, aktiveFuerClient, erstelleAnkuendigung, istAktiv,
  listeAnkuendigungen
} from "./announcements.js";
import { ziehZurueck, zustand } from "./announcements.js";

const ENV = {};
const ACTOR = { email: "chefin@example.de" };
const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const STUNDE = 3_600_000;

const zeitraum = (vonStunden, bisStunden) => ({
  sichtbarAb: new Date(JETZT + vonStunden * STUNDE).toISOString(),
  sichtbarBis: new Date(JETZT + bisStunden * STUNDE).toISOString()
});

test("der Zeitraum entscheidet, nicht ein Zeitgeber", () => {
  const a = { ...zeitraum(-1, 1), zurueckgezogen: false };
  assert.equal(istAktiv(a, JETZT), true);
  assert.equal(istAktiv(a, JETZT - 2 * STUNDE), false, "vorher nicht");
  assert.equal(istAktiv(a, JETZT + 2 * STUNDE), false, "nachher nicht mehr");
  assert.equal(zustand(a, JETZT - 2 * STUNDE), "geplant");
  assert.equal(zustand(a, JETZT + 2 * STUNDE), "beendet");
});

test("Titel, Text und Zeitraum werden geprueft", async () => {
  __clearAnnouncementsForTests();
  const basis = { art: "wartung", titel: "Kurze Wartung", text: "Der Dienst ist kurz nicht erreichbar." };
  assert.equal((await erstelleAnkuendigung({ ...basis, art: "quatsch" }, { env: ENV, nowMs: JETZT })).error,
    "ankuendigung_art_invalid");
  assert.equal((await erstelleAnkuendigung({ ...basis, titel: "ab" }, { env: ENV, nowMs: JETZT })).error,
    "ankuendigung_titel_invalid");
  assert.equal((await erstelleAnkuendigung({ ...basis, text: "x" }, { env: ENV, nowMs: JETZT })).error,
    "ankuendigung_text_invalid");
  assert.equal((await erstelleAnkuendigung({ ...basis, ...zeitraum(2, 1) }, { env: ENV, nowMs: JETZT })).error,
    "ankuendigung_ende_vor_beginn");
});

test("STOERUNGEN STEHEN VOR ALLEM ANDEREN — bei Ausfall interessiert kein Hinweis", async () => {
  __clearAnnouncementsForTests();
  await erstelleAnkuendigung({ art: "hinweis", titel: "Neue Funktion", text: "Chat-Aktionen sind da.", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  await erstelleAnkuendigung({ art: "stoerung", titel: "E-Mail-Versand gestoert", text: "Magic-Links verzoegern sich.", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  await erstelleAnkuendigung({ art: "wartung", titel: "Wartung Sonntag", text: "30 Minuten nicht erreichbar.", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });

  const fuerClient = await aktiveFuerClient({ env: ENV, nowMs: JETZT });
  assert.deepEqual(fuerClient.ankuendigungen.map((a) => a.art), ["stoerung", "wartung", "hinweis"]);
});

test("die Zielgruppe wird beachtet", async () => {
  __clearAnnouncementsForTests();
  await erstelleAnkuendigung({ art: "hinweis", titel: "Nur fuer Angemeldete", text: "Ein Hinweis.", ziel: "angemeldete", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  await erstelleAnkuendigung({ art: "hinweis", titel: "Nur fuer Pro", text: "Ein Hinweis.", ziel: "pro", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });

  const anonym = await aktiveFuerClient({ env: ENV, nowMs: JETZT });
  assert.equal(anonym.ankuendigungen.length, 0);

  const frei = await aktiveFuerClient({ angemeldet: true, env: ENV, nowMs: JETZT });
  assert.equal(frei.ankuendigungen.length, 1);

  const pro = await aktiveFuerClient({ angemeldet: true, plan: "pro", env: ENV, nowMs: JETZT });
  assert.equal(pro.ankuendigungen.length, 2);
});

test("zurueckziehen statt loeschen — was angezeigt wurde, bleibt dokumentiert", async () => {
  __clearAnnouncementsForTests();
  const a = await erstelleAnkuendigung({ art: "stoerung", titel: "Stoerung", text: "Etwas ist kaputt.", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  const zurueck = await ziehZurueck(a.ankuendigung.id, { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(zurueck.ok, true);
  assert.equal(zurueck.after.zustand, "zurueckgezogen");

  const liste = await listeAnkuendigungen({ env: ENV, nowMs: JETZT });
  assert.equal(liste.total, 1, "der Datensatz bleibt");
  assert.equal(liste.aktiv, 0, "wird aber nicht mehr angezeigt");

  const nochmal = await ziehZurueck(a.ankuendigung.id, { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(nochmal.error, "ankuendigung_no_change");
});

test("die Client-Sicht traegt keine Verwaltungsdaten", async () => {
  __clearAnnouncementsForTests();
  await erstelleAnkuendigung({ art: "hinweis", titel: "Hinweis", text: "Text.", ...zeitraum(-1, 5) },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  const roh = JSON.stringify(await aktiveFuerClient({ env: ENV, nowMs: JETZT }));
  assert.equal(roh.includes("chefin@example.de"), false);
  assert.equal(roh.includes("erstelltVon"), false);
});
