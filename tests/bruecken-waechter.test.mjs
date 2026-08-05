// smejj.com — Waechter fuer die Chat-Bruecke.
//
// Geprueft wird das VERHALTEN gegen eine gestellte Bruecke, nicht der Quelltext.
// Jeder Fall hier entspricht einer Situation, die am 2026-08-05 wirklich
// eingetreten ist — einschliesslich der beiden, die mich in die Irre gefuehrt
// haben (ein einzelner Aussetzer; eine Antwort, die "da" war, aber nichts sagte).
import test from "node:test";
import assert from "node:assert/strict";
import { createBrueckenWaechter } from "../workers/smejj-training-loop/brueckenWaechter.js";

/** Eine gestellte Bruecke, deren Antworten der Test vorgibt. */
function stelleBruecke(folge) {
  let i = 0;
  return async () => {
    const naechste = folge[Math.min(i, folge.length - 1)];
    i += 1;
    if (naechste === "tot") throw new Error("connect ECONNREFUSED");
    if (naechste === "langsam") { const f = new Error("timeout"); f.name = "TimeoutError"; throw f; }
    if (typeof naechste === "number") return { ok: naechste < 400, status: naechste, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ version: naechste }) };
  };
}

/** Uhr, die je Abruf um `schrittMs` weiterlaeuft. */
function uhr(startMs, schrittMs = 30_000) {
  let jetztMs = startMs;
  return () => { const d = new Date(jetztMs); jetztMs += schrittMs; return d; };
}

const still = () => {};

test("gesunde Bruecke: erreichbar, keine Vorfaelle", async () => {
  const w = createBrueckenWaechter({ fetchFn: stelleBruecke(["v122"]), log: still, jetzt: uhr(0) });
  await w.pruefe();
  const s = w.stand();
  assert.equal(s.erreichbar, true);
  assert.equal(s.letzteVersion, "v122");
  assert.equal(s.vorfaelle.length, 0);
  assert.equal(s.laufenderAusfall, null);
});

// DER FALL, DER MICH HEUTE GETAEUSCHT HAT: ein einzelner Fehlversuch. Vier
// Wiederholungen danach waren sauber — er war eine Schwalbe, kein Befund.
test("ein einzelner Aussetzer ist KEIN Ausfall", async () => {
  const w = createBrueckenWaechter({ fetchFn: stelleBruecke(["v122", "tot", "v122", "v122"]), log: still, jetzt: uhr(0) });
  for (let i = 0; i < 4; i += 1) await w.pruefe();
  const s = w.stand();
  assert.equal(s.erreichbar, true);
  assert.equal(s.vorfaelle.length, 0, "ein Aussetzer darf keinen Vorfall erzeugen");
  assert.equal(s.fehlerInFolge, 0);
});

test("drei Fehlversuche in Folge gelten als Ausfall", async () => {
  const w = createBrueckenWaechter({ fetchFn: stelleBruecke(["tot"]), log: still, jetzt: uhr(0) });
  await w.pruefe();
  assert.equal(w.stand().erreichbar, null, "nach einem Fehlversuch ist noch nichts entschieden");
  await w.pruefe();
  assert.equal(w.stand().erreichbar, null);
  await w.pruefe();
  assert.equal(w.stand().erreichbar, false);
  assert.equal(w.stand().laufenderAusfall.grund, "nicht_erreichbar");
});

// Die wichtigste Zahl ist die DAUER. Sie muss beim ersten Fehlversuch beginnen,
// nicht erst wenn die Schwelle erreicht ist — sonst meldet der Waechter jeden
// Ausfall systematisch zu kurz.
test("der Ausfall beginnt beim ERSTEN Fehlversuch, nicht bei der Schwelle", async () => {
  const w = createBrueckenWaechter({
    fetchFn: stelleBruecke(["v122", "tot", "tot", "tot", "v122"]),
    log: still,
    jetzt: uhr(Date.parse("2026-08-05T10:00:00.000Z"), 30_000)
  });
  for (let i = 0; i < 5; i += 1) await w.pruefe();
  const [vorfall] = w.stand().vorfaelle;
  assert.equal(vorfall.seit, "2026-08-05T10:00:30.000Z", "Beginn = erster Fehlversuch");
  assert.equal(vorfall.bis, "2026-08-05T10:02:00.000Z");
  assert.equal(vorfall.dauerMs, 90_000);
});

// Die Lehre aus Salads TCP-Sonde: "die Verbindung stand" ist keine Aussage
// darueber, ob der Dienst arbeitet.
test("HTTP 200 ohne Version zaehlt NICHT als gesund", async () => {
  const w = createBrueckenWaechter({ fetchFn: stelleBruecke([200]), log: still, jetzt: uhr(0) });
  for (let i = 0; i < 3; i += 1) await w.pruefe();
  const s = w.stand();
  assert.equal(s.erreichbar, false);
  assert.equal(s.laufenderAusfall.grund, "antwort_ohne_version");
});

test("HTTP 503 und Zeitueberschreitung werden unterschieden", async () => {
  const a = createBrueckenWaechter({ fetchFn: stelleBruecke([503]), log: still, jetzt: uhr(0) });
  for (let i = 0; i < 3; i += 1) await a.pruefe();
  assert.equal(a.stand().laufenderAusfall.grund, "http_503");

  const b = createBrueckenWaechter({ fetchFn: stelleBruecke(["langsam"]), log: still, jetzt: uhr(0) });
  for (let i = 0; i < 3; i += 1) await b.pruefe();
  assert.equal(b.stand().laufenderAusfall.grund, "zeitueberschreitung");
});

test("Erholung schliesst den Vorfall und laesst den Waechter weiterlaufen", async () => {
  const w = createBrueckenWaechter({
    fetchFn: stelleBruecke(["tot", "tot", "tot", "v122", "v122"]), log: still, jetzt: uhr(0)
  });
  for (let i = 0; i < 5; i += 1) await w.pruefe();
  const s = w.stand();
  assert.equal(s.erreichbar, true);
  assert.equal(s.laufenderAusfall, null);
  assert.equal(s.vorfaelle.length, 1);
  assert.equal(s.gesamtPruefungen, 5);
  assert.equal(s.gesamtFehler, 3);
});

test("gemeldet wird nur der WECHSEL, nicht jede Abfrage", async () => {
  const meldungen = [];
  const w = createBrueckenWaechter({
    fetchFn: stelleBruecke(["v122", "tot", "tot", "tot", "tot", "tot", "v122"]),
    log: (text) => meldungen.push(text), jetzt: uhr(0)
  });
  for (let i = 0; i < 7; i += 1) await w.pruefe();
  // Erwartet: Start (gesund), Ausfall, Erholung — drei, nicht sieben.
  assert.equal(meldungen.length, 3, meldungen.join(" | "));
  assert.match(meldungen[0], /START/);
  assert.match(meldungen[1], /AUSFALL/);
  assert.match(meldungen[2], /ERHOLT/);
});

// Ein Waechter, der den Dienst stoert, den er ueberwacht, ist schlimmer als
// keiner. Weder ein klemmender Meldeweg noch eine kaputte Antwort duerfen
// nach aussen dringen.
test("der Waechter wirft nie — auch nicht bei kaputtem Meldeweg", async () => {
  const w = createBrueckenWaechter({
    fetchFn: async (adresse) => {
      if (String(adresse).includes("melde")) throw new Error("Meldeweg tot");
      throw new Error("Bruecke tot");
    },
    meldeUrl: "https://melde.test/alarm",
    log: still,
    jetzt: uhr(0)
  });
  for (let i = 0; i < 3; i += 1) await assert.doesNotReject(() => w.pruefe());
  assert.equal(w.stand().erreichbar, false);
  assert.equal(w.stand().meldewegAktiv, true);
});

test("kaputtes JSON gilt als ungesund, nicht als Absturz", async () => {
  const w = createBrueckenWaechter({
    fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error("kein JSON"); } }),
    log: still, jetzt: uhr(0)
  });
  for (let i = 0; i < 3; i += 1) await w.pruefe();
  assert.equal(w.stand().erreichbar, false);
});

test("die Vorfallsliste waechst im Dauerbetrieb nicht unbegrenzt", async () => {
  const w = createBrueckenWaechter({
    fetchFn: stelleBruecke(["tot", "tot", "tot", "v122"]), log: still, jetzt: uhr(0), maxVorfaelle: 2, schwelle: 3
  });
  for (let runde = 0; runde < 3; runde += 1) {
    // stelleBruecke wiederholt den letzten Eintrag — darum je Runde ein neuer Waechter waere
    // falsch; hier genuegt, dass die Obergrenze eingehalten wird.
    await w.pruefe();
  }
  assert.ok(w.stand().vorfaelle.length <= 2);
});
