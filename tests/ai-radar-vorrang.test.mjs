// smejj ai radar — Vorrang, Wissensluecken und begrenzte Wiederholung
// (Auftrag Punkte 1, 6 und 7).
import test from "node:test";
import assert from "node:assert/strict";
import { darfHintergrundLaufen, mitVorrang, nutzeranfrageBeginnt, nutzeranfrageEndet, vorrangStand, vorrangZuruecksetzen } from "../control-server/src/autopilots/radarVorrang.js";
import { ERLAUBTE_BEGRIFFE, themenAusLuecken, zaehleBegriffe } from "../src/radar/wissensluecken.js";
import { fuehreRadarLaufAus } from "../control-server/src/autopilots/aiRadarAutopilot.js";

const JETZT = "2026-09-22T09:00:00.000Z";
function ablage(anfang = []) {
  const daten = [...anfang];
  return { daten, liste: async () => ({ ok: true, datensaetze: [...daten] }), schreib: async (s) => { const i = daten.findIndex((d) => d.id === s.id); if (i >= 0) daten[i] = s; else daten.push(s); return s; } };
}

test("Vorrang: waehrend einer Nutzeranfrage laeuft keine Hintergrundarbeit", () => {
  vorrangZuruecksetzen();
  assert.equal(darfHintergrundLaufen({ jetztMs: 1000 }).erlaubt, true);
  nutzeranfrageBeginnt();
  const gesperrt = darfHintergrundLaufen({ jetztMs: 2000 });
  assert.equal(gesperrt.erlaubt, false);
  assert.equal(gesperrt.grund, "nutzer_hat_vorrang");
  assert.equal(vorrangStand({ jetztMs: 2000 }).laufendeNutzeranfragen, 1);
  nutzeranfrageEndet();
});

test("Vorrang: nach der Antwort bleibt eine Schonfrist — die naechste Frage kommt meist gleich", async () => {
  vorrangZuruecksetzen();
  const start = Date.now();
  await mitVorrang(async () => "antwort");
  const gleich = darfHintergrundLaufen({ jetztMs: start + 1000 });
  assert.equal(gleich.erlaubt, false);
  assert.equal(gleich.grund, "schonfrist_nach_nutzeranfrage");
  assert.equal(darfHintergrundLaufen({ jetztMs: start + 30_000 }).erlaubt, true);
});

test("Vorrang: auch ein Fehler in der Nutzeranfrage gibt den Zaehler frei", async () => {
  vorrangZuruecksetzen();
  await assert.rejects(() => mitVorrang(async () => { throw new Error("kaputt"); }));
  assert.equal(vorrangStand().laufendeNutzeranfragen, 0, "sonst haengt der Radar fuer immer");
});

test("Takt-Lauf weicht dem Nutzer, der Adminknopf nicht", async () => {
  vorrangZuruecksetzen();
  nutzeranfrageBeginnt();
  const stores = { wissen: ablage(), laeufe: ablage(), konfig: ablage() };
  let gesucht = 0;
  const takt = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, grund: "takt", suche: async () => { gesucht += 1; return { results: [] }; } });
  assert.equal(takt.grund, "nutzer_hat_vorrang");
  assert.equal(gesucht, 0);
  const vonHand = await fuehreRadarLaufAus({ env: {}, jetzt: JETZT, stores, maxThemen: 1, grund: "admin:chef@smejj.com", suche: async () => { gesucht += 1; return { results: [] }; } });
  assert.equal(vonHand.ok, true);
  assert.ok(gesucht >= 1, "ein Mensch, der auf den Knopf drueckt, wartet davor");
  nutzeranfrageEndet();
});

test("Wissensluecken: nur erlaubte Begriffe verlassen das Haus, nie Nutzertext", () => {
  const signale = [
    "chatgpt konnte das besser", "vergleich mit chatgpt fehlt", "chatgpt hat die Quelle genannt",
    "Meine Adresse ist Musterweg 4 in 12345 Musterstadt und mein Passwort lautet geheim"
  ];
  const gezaehlt = zaehleBegriffe(signale);
  assert.equal(gezaehlt[0].begriff, "chatgpt");
  assert.equal(gezaehlt[0].treffer, 3);
  assert.equal(gezaehlt.some((g) => /musterweg|passwort|geheim/i.test(g.begriff)), false);
  const themen = themenAusLuecken(signale, { vorhandeneIds: [] });
  assert.equal(themen.length, 1);
  assert.equal(themen[0].id, "luecke-chatgpt");
  assert.equal(themen[0].anfragen[0], "chatgpt news update documentation");
  assert.equal(themen[0].anfragen[0].includes("Musterweg"), false, "kein Nutzertext in der Suchanfrage");
  assert.ok(ERLAUBTE_BEGRIFFE.includes("chatgpt"));
});

test("Wissensluecken: ein einzelnes Signal ist Zufall, drei sind ein Muster", () => {
  assert.equal(themenAusLuecken(["gemini war falsch"], { vorhandeneIds: [] }).length, 0);
  assert.equal(themenAusLuecken(["gemini a", "gemini b", "gemini c"], { vorhandeneIds: [] }).length, 1);
  assert.equal(themenAusLuecken(["gemini a", "gemini b", "gemini c"], { vorhandeneIds: ["luecke-gemini"] }).length, 0, "kein doppeltes Thema");
});

test("Suche faellt aus: genau EIN zweiter Versuch, dann Schluss", async () => {
  vorrangZuruecksetzen();
  let versuche = 0;
  const lauf = await fuehreRadarLaufAus({
    env: {}, jetzt: JETZT, stores: { wissen: ablage(), laeufe: ablage(), konfig: ablage() }, maxThemen: 1, grund: "admin:test",
    suche: async () => { versuche += 1; throw new Error("netz weg"); }
  });
  assert.equal(versuche, 2, "einmal wiederholen, nicht endlos");
  assert.match(lauf.themen[0].fehler, /Versuch 2/);
  assert.equal(lauf.anfragen, 2, "auch der zweite Versuch zaehlt aufs Budget");
});

test("zweiter Versuch hilft, wenn der erste ein Aussetzer war", async () => {
  vorrangZuruecksetzen();
  let versuche = 0;
  const lauf = await fuehreRadarLaufAus({
    env: {}, jetzt: JETZT, stores: { wissen: ablage(), laeufe: ablage(), konfig: ablage() }, maxThemen: 1, grund: "admin:test",
    suche: async () => {
      versuche += 1;
      if (versuche === 1) throw new Error("aussetzer");
      return { results: [{ url: "https://openai.com/2026/09/20/neu", title: "Neues Modell", snippet: "OpenAI announced a new model today and published the documentation for developers worldwide." }] };
    }
  });
  assert.equal(lauf.themen[0].geprueft, 1);
  assert.equal(lauf.themen[0].gespeichert, 1);
  assert.ok(lauf.dauerMs >= 0, "die Laufdauer wird gemessen");
});
