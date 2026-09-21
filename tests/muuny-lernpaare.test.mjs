// muuny AI — Teil 1: Lernpaare sammeln, nur mit Einwilligung (Owner-Auftrag 21.09.2026).
//
// Diese Tests laufen gegen die ECHTE Einwilligungs-Kryptografie (signierte,
// gebundene Eintraege). Die Schluessel entstehen hier im Test frisch — nichts
// Geheimes steht im Code (Eiserne Regel 8).
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { einwilligungsEnv, einwilligungsKonfig, einwilligungsRegister, erteileEinwilligung, lernpaarSchluessel, sichereLernpaar,
  subjektAus, widerrufeEinwilligung } from "../workers/muuny-autopilot/lernpaare.js";
import { L } from "../workers/muuny-autopilot/lager.js";

const DATENSCHUTZ = createHash("sha256").update("muuny Datenschutzhinweis v1").digest("hex");
const ENV = Object.freeze({
  MUUNY_ERFASSUNG: "YES",
  MUUNY_EINWILLIGUNG_SIGNATUR_ID: "muuny-signatur-test",
  MUUNY_EINWILLIGUNG_SIGNATUR_B64: randomBytes(32).toString("base64"),
  MUUNY_EINWILLIGUNG_BINDUNG_ID: "muuny-bindung-test",
  MUUNY_EINWILLIGUNG_BINDUNG_B64: randomBytes(32).toString("base64"),
  MUUNY_DATENSCHUTZ_SHA256: DATENSCHUTZ
});
const NUTZER = "nutzer_4711abc";
const PAAR = { frage: "Wie lange muss ein Ei hart kochen?", antwort: "Etwa acht bis zehn Minuten in sprudelndem Wasser." };
const JA = { datenschutzSha256: DATENSCHUTZ, trainingJa: true, pruefungJa: true, rechteJa: true };

/** Eine Ablage im Arbeitsspeicher, die wie die echte beweist: neu angelegt, zurueckgelesen. */
function ablage({ schluckt = false, wirft = false } = {}) {
  const objekte = new Map();
  const schreiber = {
    async putObject(o) {
      if (wirft) throw new Error("e2 antwortet 500");
      if (objekte.has(o.key)) return { conditionEnforced: true, contentVerified: false, created: false };
      if (!schluckt) objekte.set(o.key, String(o.body));
      return schluckt ? { conditionEnforced: true, contentVerified: false, created: true }
        : { conditionEnforced: true, contentVerified: true, created: true };
    }
  };
  const e2 = {
    liste: async (prefix) => [...objekte.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: 1 })),
    getText: async (key) => objekte.get(key) ?? null
  };
  return { objekte, schreiber, e2 };
}

// einwilligungsRegister braucht eine fertige Konfiguration; so baut sie der Dienst.
function aufbau(opts) {
  const a = ablage(opts);
  const register = einwilligungsRegister({ config: einwilligungsKonfig(ENV), schreiber: a.schreiber, e2: a.e2, env: ENV });
  return { ...a, register };
}
const paare = (objekte) => [...objekte.keys()].filter((k) => k.startsWith(`${L.paare}/`));

test("Ganzer Weg: Einwilligung, Daumen hoch, Paar liegt unveraenderlich in der Ablage", async () => {
  const u = aufbau();
  const e = await erteileEinwilligung(NUTZER, JA, { env: ENV, register: u.register });
  assert.equal(e.ok, true, e.grund);
  assert.ok([...u.objekte.keys()].every((k) => k.startsWith("muuny/training/consents/v1/")),
    "das muuny-Register liegt getrennt vom smejj-Register");

  const r = await sichereLernpaar(NUTZER, PAAR, { env: ENV, register: u.register, schreiber: u.schreiber,
    now: "2026-09-21T14:00:00.000Z", randomUUID: () => "0f0e0d0c-1111-4222-8333-444455556666" });
  assert.deepEqual(r, { erfasst: true, grund: null });

  const [schluessel] = paare(u.objekte);
  assert.equal(schluessel, "muuny/training/paare/2026/09/21/0f0e0d0c-1111-4222-8333-444455556666.json");
  const satz = JSON.parse(u.objekte.get(schluessel));
  assert.equal(satz.frage, PAAR.frage);
  assert.equal(satz.antwort, PAAR.antwort);
  assert.equal(satz.herkunft, "daumen_hoch");
  assert.equal(satz.erfasstAm, "2026-09-21T14:00:00.000Z");
  assert.ok(satz.einwilligung, "der Beleg muss im Paar stehen");
  assert.ok(!schluessel.includes(NUTZER), "im Dateinamen steht NIE eine Kennung des Menschen");
  assert.ok(!JSON.stringify(satz).includes(NUTZER), "auch im Inhalt nur ein undurchsichtiger Verweis");
});

test("1. Ohne Anmeldung wird nichts gespeichert", async () => {
  const u = aufbau();
  for (const kennung of [null, "", "x", "a b c d e f", "../../etc"]) {
    const r = await sichereLernpaar(kennung, PAAR, { env: ENV, register: u.register, schreiber: u.schreiber });
    assert.deepEqual(r, { erfasst: false, grund: "anmeldung_fehlt" });
  }
  assert.equal(u.objekte.size, 0);
});

test("2. Schalter aus (Standard): nichts wird geprueft oder gespeichert", async () => {
  const u = aufbau();
  const { MUUNY_ERFASSUNG, ...ohne } = ENV;
  assert.equal((await sichereLernpaar(NUTZER, PAAR, { env: ohne, register: u.register, schreiber: u.schreiber })).grund, "erfassung_abgeschaltet");
  assert.equal((await sichereLernpaar(NUTZER, PAAR, { env: { ...ENV, MUUNY_ERFASSUNG: "ja-bitte" }, register: u.register, schreiber: u.schreiber })).grund,
    "erfassung_abgeschaltet", "nur ein ausdrueckliches YES schaltet ein");
});

test("2b. Ein smejj-Schalter oder smejj-Schluessel gilt fuer muuny NICHT", async () => {
  const u = aufbau();
  const { MUUNY_ERFASSUNG, ...ohne } = ENV;
  const r = await sichereLernpaar(NUTZER, PAAR, { env: { ...ohne, SMEJJ_TRAINING_CAPTURE_ENABLED: "YES" }, register: u.register, schreiber: u.schreiber });
  assert.equal(r.grund, "erfassung_abgeschaltet");
  const gemappt = einwilligungsEnv({ SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: "fremd", SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: "f".repeat(64) });
  assert.equal(gemappt.SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64, "", "kein smejj-Wert sickert durch");
  assert.equal(gemappt.SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256, "");
});

test("3. Ohne Einwilligung kein Paar", async () => {
  const u = aufbau();
  const r = await sichereLernpaar(NUTZER, PAAR, { env: ENV, register: u.register, schreiber: u.schreiber });
  assert.equal(r.erfasst, false);
  assert.equal(r.grund, "einwilligung_fehlt_oder_veraltet");
  assert.equal(paare(u.objekte).length, 0);
});

test("3b. Nach dem Widerruf wird nichts mehr erfasst", async () => {
  const u = aufbau();
  await erteileEinwilligung(NUTZER, JA, { env: ENV, register: u.register });
  assert.equal((await sichereLernpaar(NUTZER, PAAR, { env: ENV, register: u.register, schreiber: u.schreiber })).erfasst, true);
  const w = await widerrufeEinwilligung(NUTZER, { env: ENV, register: u.register, now: new Date(Date.now() + 1000).toISOString() });
  assert.equal(w.ok, true, w.grund);
  const danach = await sichereLernpaar(NUTZER, { ...PAAR, frage: "Und wie lange ein weiches Ei?" },
    { env: ENV, register: u.register, schreiber: u.schreiber, now: new Date(Date.now() + 2000).toISOString() });
  assert.equal(danach.erfasst, false);
  assert.equal(danach.grund, "einwilligung_fehlt_oder_veraltet");
  assert.equal(paare(u.objekte).length, 1, "nur das Paar von VOR dem Widerruf bleibt");
});

test("3c. Die Einwilligung einer Person gilt nicht fuer eine andere", async () => {
  const u = aufbau();
  await erteileEinwilligung(NUTZER, JA, { env: ENV, register: u.register });
  const r = await sichereLernpaar("anderer_nutzer_99", PAAR, { env: ENV, register: u.register, schreiber: u.schreiber });
  assert.equal(r.grund, "einwilligung_fehlt_oder_veraltet");
});

test("3d. Einwilligung nur mit allen drei ausdruecklichen Ja und aktuellem Datenschutzhinweis", async () => {
  const u = aufbau();
  for (const halb of [{ ...JA, trainingJa: false }, { ...JA, pruefungJa: undefined }, { ...JA, rechteJa: "ja" }]) {
    assert.equal((await erteileEinwilligung(NUTZER, halb, { env: ENV, register: u.register })).grund, "ausdrueckliches_ja_fehlt");
  }
  const alt = await erteileEinwilligung(NUTZER, { ...JA, datenschutzSha256: "0".repeat(64) }, { env: ENV, register: u.register });
  assert.equal(alt.ok, false, "wer einem alten Hinweis zugestimmt hat, hat dem heutigen nicht zugestimmt");
  assert.equal(u.objekte.size, 0);
});

test("3e. Ein Register, das nicht antwortet, ist ein Nein", async () => {
  const u = aufbau();
  const kaputt = { resolve: async () => { throw new Error("e2 weg"); } };
  const r = await sichereLernpaar(NUTZER, PAAR, { env: ENV, register: kaputt, schreiber: u.schreiber });
  assert.deepEqual(r, { erfasst: false, grund: "einwilligung_nicht_erreichbar" });
});

test("4. Laengen: Frage 8-2000, Antwort 3-4000 Zeichen", async () => {
  const u = aufbau();
  await erteileEinwilligung(NUTZER, JA, { env: ENV, register: u.register });
  const opts = { env: ENV, register: u.register, schreiber: u.schreiber };
  assert.equal((await sichereLernpaar(NUTZER, { frage: "Wieso?!", antwort: PAAR.antwort }, opts)).grund, "frage_laenge");
  assert.equal((await sichereLernpaar(NUTZER, { frage: "x".repeat(2001), antwort: PAAR.antwort }, opts)).grund, "frage_laenge");
  assert.equal((await sichereLernpaar(NUTZER, { frage: PAAR.frage, antwort: "ja" }, opts)).grund, "antwort_laenge");
  assert.equal((await sichereLernpaar(NUTZER, { frage: PAAR.frage, antwort: "a".repeat(4001) }, opts)).grund, "antwort_laenge");
  assert.equal(paare(u.objekte).length, 0);
});

test("5. Ein Fehler- oder Rueckfalltext wird nie ein Lernziel", async () => {
  const u = aufbau();
  await erteileEinwilligung(NUTZER, JA, { env: ENV, register: u.register });
  const r = await sichereLernpaar(NUTZER, { frage: PAAR.frage, antwort: "Ich konnte gerade nicht antworten. Bitte noch einmal versuchen." },
    { env: ENV, register: u.register, schreiber: u.schreiber });
  assert.equal(r.grund, "antwort_ist_fehlertext");
});

test("6. Sensible Daten: verworfen, nicht maskiert", async () => {
  const u = aufbau();
  await erteileEinwilligung(NUTZER, JA, { env: ENV, register: u.register });
  const opts = { env: ENV, register: u.register, schreiber: u.schreiber };
  for (const antwort of [
    "Nimm den Schluessel sk-live-abcdefghijklmnop1234567890 dafuer.",
    "Schreib einfach an max.mustermann@firma.de, der hilft.",
    "Ruf unter +49 170 1234567 an, dort geht es schneller.",
    "Der Server steht unter 192.168.17.42 im Keller.",
    "Das Passwort lautet: Sommer2026!Sicher",
    "Mein Kennwort ist hunter2hunter, merk es dir.",
    "Klar, login: admin / pwd=geheim1234",
    "Die PIN ist 482913."
  ]) {
    const r = await sichereLernpaar(NUTZER, { frage: PAAR.frage, antwort }, opts);
    assert.equal(r.erfasst, false, `muss verworfen werden: ${antwort}`);
    assert.equal(r.grund, "sensible_daten_erkannt", antwort);
  }
  assert.equal(paare(u.objekte).length, 0, "maskiert abgelegt waere auch abgelegt");
});

test("Speichern: ohne Rueckpruefung kein Erfolg — keine stille Luege", async () => {
  const schluckend = aufbau({ schluckt: true });
  const reg = aufbau();
  await erteileEinwilligung(NUTZER, JA, { env: ENV, register: reg.register });
  const r = await sichereLernpaar(NUTZER, PAAR, { env: ENV, register: reg.register, schreiber: schluckend.schreiber });
  assert.deepEqual(r, { erfasst: false, grund: "nicht_gespeichert" });

  const werfend = aufbau({ wirft: true });
  const r2 = await sichereLernpaar(NUTZER, PAAR, { env: ENV, register: reg.register, schreiber: werfend.schreiber });
  assert.deepEqual(r2, { erfasst: false, grund: "nicht_gespeichert" }, "und es wird nicht geworfen — der Chat laeuft weiter");
});

test("Was der Klient behauptet, zaehlt nicht", async () => {
  const u = aufbau();
  // Keine Einwilligung im Register — ein mitgeschicktes "eingewilligt" aendert nichts.
  const r = await sichereLernpaar(NUTZER, { ...PAAR, eingewilligt: true, einwilligung: { status: "granted" } },
    { env: ENV, register: u.register, schreiber: u.schreiber });
  assert.equal(r.grund, "einwilligung_fehlt_oder_veraltet");
});

test("Schluessel und Kennung: nur gueltige Formen", () => {
  assert.throws(() => lernpaarSchluessel("kaputt", "0f0e0d0c-1111-4222-8333-444455556666"));
  assert.throws(() => lernpaarSchluessel("2026-09-21T00:00:00Z", "../../boese"));
  assert.equal(subjektAus("gueltig_123"), "muuny:gueltig_123");
  assert.equal(subjektAus("zu"), null);
});

test("6b. Harmlose Saetze mit 'Passwort' bleiben erlaubt", async () => {
  const { zusaetzlichSensibel } = await import("../workers/muuny-autopilot/lernpaare.js");
  assert.equal(zusaetzlichSensibel("Ein gutes Passwort ist lang und zufaellig."), false,
    "ueber Passwoerter reden ist kein Passwort verraten");
  assert.equal(zusaetzlichSensibel("Wie setze ich mein Passwort zurueck?"), false);
  assert.equal(zusaetzlichSensibel("Das Passwort lautet: Sommer2026!Sicher"), true);
});
