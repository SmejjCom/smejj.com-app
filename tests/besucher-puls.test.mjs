// smejj.com — Wächter-TÜV für den Besucher-Puls (Nr. 81, Betreiber-Auftrag
// 2026-09-04 „Nutzer-Baustelle"). Kaputte UND gesunde Probe.
//
// Der Prüfgegenstand ist nicht „zählt er?", sondern: Kann er „niemand da" von
// „niemand kann melden" unterscheiden — und bleibt er bei 1 Milliarde Besuchern
// eine O(1)-Zählung ohne Speicherschreiben je Anfrage?
//
// Ausführen: node --test tests/besucher-puls.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  nimmPulsAn, tagesStand, beurteilePuls, herkunftsHost, fuehreSelbsttestAus,
  laufBesucherPuls, _pulsZuruecksetzen, BESUCHER_ABLAGE, ABLAGE_ABSTAND_MS
} from "../control-server/src/autopilots/besucherPulsAutopilot.js";
import { handlePulsRoute, PULS_PFAD } from "../control-server/src/routes/pulsRoutes.js";
import { DECKUNG_IDS } from "../control-server/src/autopilots/deckungsLaeufe.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon, zugeordneteKennungen } from "../control-server/src/admin/opsAutopilotenBereiche.js";
import { istOeffentlicheApi } from "../src/shared/controlAccessPolicy.js";

const T0 = Date.parse("2026-09-04T10:00:00Z");

test("Nr. 81: der Puls zählt, ohne je etwas Personenbezogenes zu behalten", () => {
  _pulsZuruecksetzen();
  nimmPulsAn({ seite: "/willkommen.html", sprache: "de-DE", verweis: "https://www.google.com/search?q=geheime+suche" }, { jetztMs: T0 });
  nimmPulsAn({ seite: "/willkommen.html?utm_source=x", sprache: "de", verweis: "" }, { jetztMs: T0 + 1000 });
  nimmPulsAn({ seite: "/en/", sprache: "en-US", verweis: "https://smejj.com/hilfe.html" }, { jetztMs: T0 + 2000 });
  const s = tagesStand({ jetztMs: T0 });
  assert.equal(s.besuche, 3);
  assert.equal(s.jeSeite["/willkommen.html"], 2, "Parameter werden abgeschnitten, die Seite bleibt dieselbe");
  assert.equal(s.jeSprache.de, 2);
  assert.equal(s.jeHerkunft["google.com"], 1, "nur der Host, nie der Suchbegriff");
  assert.equal(s.jeHerkunft.direkt, 1);
  assert.equal(s.jeHerkunft.intern, 1);
  assert.ok(!JSON.stringify(s).includes("geheime"), "kein Suchbegriff darf im Stand landen");
  assert.ok(!JSON.stringify(s).includes("utm_source"), "keine Kampagnen-Parameter im Stand");
  // Der Client kuerzt schon; der Server darf das nicht als kaputt verwerfen
  // (live gemessen 04.09.: "direkt" wurde zu "unbekannt").
  assert.equal(herkunftsHost("google.com"), "google.com");
  assert.equal(herkunftsHost("direkt"), "direkt");
  assert.equal(herkunftsHost("intern"), "intern");
  assert.equal(herkunftsHost("www.smejj.com"), "intern");
  assert.equal(herkunftsHost("/pfad?q=geheim"), "unbekannt", "ein Pfad ist keine Herkunft");
});

test("Nr. 81: Tageswechsel setzt zurück, Schlüssel-Flut wird gebündelt", () => {
  _pulsZuruecksetzen();
  nimmPulsAn({ seite: "/", sprache: "de" }, { jetztMs: T0 });
  nimmPulsAn({ seite: "/", sprache: "de" }, { jetztMs: T0 + 86_400_000 });
  assert.equal(tagesStand({ jetztMs: T0 + 86_400_000 }).besuche, 1, "der neue Tag beginnt bei 1");
  _pulsZuruecksetzen();
  for (let i = 0; i < 60; i += 1) nimmPulsAn({ seite: "/", sprache: "de", verweis: `https://host${i}.test/` }, { jetztMs: T0 });
  const s = tagesStand({ jetztMs: T0 });
  assert.equal(s.besuche, 60);
  assert.ok(Object.keys(s.jeHerkunft).length <= 10, "die Meldung zeigt höchstens 10 Herkünfte");
});

test("Nr. 81 ENTSCHEIDEND: 'niemand da' und 'niemand kann melden' sind zweierlei", async () => {
  assert.equal(fuehreSelbsttestAus().bestanden, true);
  _pulsZuruecksetzen();
  const leereAblage = () => ({ schreib: async () => ({}), lies: async () => null });
  // Frisch gestartet: Stille ist normal, die Schonfrist laeuft.
  const frisch = await laufBesucherPuls({ storeFabrik: leereAblage, jetztMs: T0, startMs: T0 - 60_000 });
  assert.equal(frisch.ok, true, "in der ersten Stunde nach dem Start ist Stille kein Ausfall");
  assert.match(frisch.meldung, /Schonfrist/);
  // Ablage kennt einen frueheren Puls: der Haken laeuft, es kommt nur niemand.
  _pulsZuruecksetzen();
  const bekannt = await laufBesucherPuls({ storeFabrik: () => ({ schreib: async () => ({}), lies: async (id) => id === "tag-2026-09-03" ? { tag: "2026-09-03", besuche: 4, letzterPulsAm: "2026-09-03T19:00:00Z" } : null }), jetztMs: T0, startMs: T0 - 5 * 60 * 60 * 1000 });
  assert.equal(bekannt.ok, true, bekannt.meldung);
  assert.match(bekannt.meldung, /zuletzt gemeldet 2026-09-03/);
  // Nie ein Puls UND Schonfrist vorbei: rot.
  _pulsZuruecksetzen();
  const nie = await laufBesucherPuls({ storeFabrik: leereAblage, jetztMs: T0, startMs: T0 - 5 * 60 * 60 * 1000 });
  assert.equal(nie.ok, false, "ohne je einen Puls MUSS die Ampel rot sein");
  assert.match(nie.meldung, /nicht ausgeliefert|blockiert/);
  _pulsZuruecksetzen();
  nimmPulsAn({ seite: "/willkommen.html", sprache: "de" }, { jetztMs: T0 });
  const da = await laufBesucherPuls({ storeFabrik: leereAblage, kontenLeser: async () => ({ gesamt: 3, neu7Tage: 1 }), jetztMs: T0 + 1000 });
  assert.equal(da.ok, true, da.meldung);
  assert.match(da.meldung, /heute 1 Besuche/);
  assert.match(da.meldung, /1 neue Konten in 7 Tagen/);
  assert.match(da.meldung, /Bestand 3/);
});

test("Nr. 81: der Tagesstand wird höchstens alle 5 Minuten abgelegt (Deckel gegen Last)", async () => {
  _pulsZuruecksetzen();
  const geschrieben = [];
  const fabrik = (praefix) => ({ lies: async () => null, schreib: async (d) => { geschrieben.push({ praefix, id: d.id, besuche: d.besuche }); return d; } });
  nimmPulsAn({ seite: "/willkommen.html", sprache: "de" }, { jetztMs: T0 });
  await laufBesucherPuls({ storeFabrik: fabrik, jetztMs: T0 });
  assert.equal(geschrieben.length, 1);
  assert.equal(geschrieben[0].praefix, BESUCHER_ABLAGE);
  assert.equal(geschrieben[0].id, "tag-2026-09-04");
  // Zweiter Lauf eine Minute später: KEIN zweites Schreiben.
  await laufBesucherPuls({ storeFabrik: fabrik, jetztMs: T0 + 60_000 });
  assert.equal(geschrieben.length, 1, "innerhalb von 5 Minuten wird nicht erneut abgelegt");
  await laufBesucherPuls({ storeFabrik: fabrik, jetztMs: T0 + ABLAGE_ABSTAND_MS + 1000 });
  assert.equal(geschrieben.length, 2, "nach 5 Minuten wieder");
  // Eine gestörte Ablage darf den Lauf nicht rot machen — der Zähler steht trotzdem.
  const kaputt = await laufBesucherPuls({ storeFabrik: () => ({ lies: async () => null, schreib: async () => { throw new Error("e2 weg"); } }), jetztMs: T0 + 3 * ABLAGE_ABSTAND_MS });
  assert.equal(kaputt.ok, true);
  assert.match(kaputt.meldung, /NICHT abgelegt/);
});

test("Nr. 81: die Route nimmt an, bremst und antwortet ohne Inhalt", async () => {
  _pulsZuruecksetzen();
  const antwort = () => { const r = { code: 0, ende: false, kopf: null }; r.writeHead = (c) => { r.code = c; return r; }; r.end = () => { r.ende = true; return r; }; r.setHeader = () => {}; return r; };
  // readRawBody hoert auf "data"/"end" — der Nachbau muss genau das koennen.
  const anfrage = (rohOderBody, ip = "1.2.3.4") => {
    const roh = typeof rohOderBody === "string" ? rohOderBody : JSON.stringify(rohOderBody);
    const hoerer = {};
    const req = {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, socket: { remoteAddress: ip },
      on(ereignis, rueckruf) { hoerer[ereignis] = rueckruf; if (ereignis === "end") { hoerer.data?.(roh); rueckruf(); } return req; }
    };
    return req;
  };
  const url = new URL("https://api.smejj.com" + PULS_PFAD);
  const r1 = antwort();
  assert.equal(await handlePulsRoute(anfrage({ seite: "/willkommen.html", sprache: "de", verweis: "https://duckduckgo.com/?q=x" }), r1, url), true);
  assert.equal(r1.code, 204, "der Puls ist eine Meldung, keine Frage");
  assert.equal(tagesStand().besuche, 1);
  assert.equal(tagesStand().jeHerkunft["duckduckgo.com"], 1);
  // Fremder Pfad: nicht zuständig.
  assert.equal(await handlePulsRoute(anfrage({}), antwort(), new URL("https://api.smejj.com/api/anderes")), false);
  // GET: 405, kein Zählwert.
  const rGet = antwort();
  await handlePulsRoute({ method: "GET", headers: {}, socket: {}, on() { return this; } }, rGet, url);
  assert.equal(rGet.code, 405);
  assert.equal(tagesStand().besuche, 1);
  // Bremse: nach 5 Anfragen je Absender wird still verworfen, ohne Fehlerbild.
  for (let i = 0; i < 8; i += 1) await handlePulsRoute(anfrage({ seite: "/", sprache: "de" }, "9.9.9.9"), antwort(), url);
  assert.ok(tagesStand().besuche <= 6, `Bremse greift: ${tagesStand().besuche} Zaehlwerte`);
  // Kaputter Body kippt nichts.
  const rKaputt = antwort();
  assert.equal(await handlePulsRoute(anfrage("{kaputt", "7.7.7.7"), rKaputt, url), true);
  assert.equal(rKaputt.code, 204);
});

test("Nr. 81 ANSCHLUSS-BEWEIS: Registry, Läufer, Bereich, öffentliche Erlaubnis", () => {
  const eintrag = AUTOPILOTEN.find((a) => a.id === "besucher-puls");
  assert.ok(eintrag, "Registry-Eintrag fehlt");
  assert.equal(eintrag.nummer, "81");
  assert.equal(eintrag.messung, "heartbeat");
  assert.ok(DECKUNG_IDS.includes("besucher-puls"));
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("besucher-puls"), "nicht wiederbelebbar");
  assert.ok(zugeordneteKennungen().includes("besucher-puls"));
  assert.equal(bereichVon("besucher-puls"), "Betrieb & Auslieferung");
  assert.equal(AUTOPILOTEN.map((a) => String(a.nummer)).filter((n) => n === "81").length, 1);
  // Der Eingang MUSS ohne Anmeldung erreichbar sein — sonst misst er nur Angemeldete.
  assert.equal(istOeffentlicheApi(PULS_PFAD), true, "/api/puls muss in der Erlaubnisliste stehen");
  assert.equal(istOeffentlicheApi("/api/puls/geheim"), false, "kein Praefix-Freibrief");
});
