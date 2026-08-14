// smejj.com — Autopilot-Jobs (Zeabur): die testbaren Kerne ohne Netz und Git.
//
// Ausfuehren: node --test tests/autopilot-jobs.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { istFaellig, schluesselFuer, schluesselAblegen, herzschlagSenden } from "../workers/smejj-autopilot-jobs/spiegelJob.mjs";

test("istFaellig: faellig ab Uhrzeit, hoechstens einmal je UTC-Tag, Neustart holt nach", () => {
  const tag = "2026-08-12";
  const um = (hhmm) => Date.parse(`${tag}T${hhmm}:00.000Z`);
  assert.equal(istFaellig({ jetztMs: um("11:19"), uhrzeitUtc: "11:20", letzterTag: null }), false, "vor der Uhrzeit nie");
  assert.equal(istFaellig({ jetztMs: um("11:20"), uhrzeitUtc: "11:20", letzterTag: null }), true, "ab der Uhrzeit faellig");
  assert.equal(istFaellig({ jetztMs: um("23:59"), uhrzeitUtc: "11:20", letzterTag: null }), true, "auch Stunden spaeter — genau das konnte cron nicht");
  assert.equal(istFaellig({ jetztMs: um("12:00"), uhrzeitUtc: "11:20", letzterTag: tag }), false, "am selben Tag nie doppelt");
  assert.equal(istFaellig({ jetztMs: um("12:00") + 24 * 60 * 60 * 1000, uhrzeitUtc: "11:20", letzterTag: tag }), true, "am naechsten Tag wieder");
});

test("schluesselFuer: zieht genau den passenden Eintrag aus der Kette", () => {
  const env = { SMEJJ_AUTOPILOT_KEYS: "qualitaetsmessung:abc,codeberg-spiegel:s3cr3t,voice-region-check:xyz" };
  assert.equal(schluesselFuer("codeberg-spiegel", env), "s3cr3t");
  assert.equal(schluesselFuer("gibtsnicht", env), "");
  assert.equal(schluesselFuer("codeberg-spiegel", {}), "", "ohne Umgebung fail-closed leer");
});

test("schluesselAblegen: schreibt PEMs mit 0600 und meldet Fehlendes", () => {
  const basis = mkdtempSync(path.join(tmpdir(), "apjobs-"));
  const tagHeader = "-----BEGIN " + "OPENSSH PRIVATE KEY-----";
  const tagFooter = "-----END " + "OPENSSH PRIVATE KEY-----";
  const pem = `${tagHeader}\nAAAA\nBBBB\n${tagFooter}`;
  const ergebnis = schluesselAblegen({ SMEJJ_GITHUB_DEPLOY_KEY: pem, SMEJJ_CODEBERG_SSH_KEY: pem }, basis);
  assert.equal(ergebnis.ok, true);
  const datei = path.join(basis, ".ssh", "smejjcom_github_ed25519");
  assert.ok(readFileSync(datei, "utf8").includes("BEGIN OPENSSH"));
  assert.equal(statSync(datei).mode & 0o777, 0o600, "SSH verweigert lax berechtigte Schluessel");

  const fehlt = schluesselAblegen({ SMEJJ_GITHUB_DEPLOY_KEY: pem }, mkdtempSync(path.join(tmpdir(), "apjobs-")));
  assert.equal(fehlt.ok, false);
  assert.deepEqual(fehlt.fehlend, ["SMEJJ_CODEBERG_SSH_KEY"]);
});

test("schluesselAblegen: repariert ein PEM, dem der Env-Dialog die Umbrueche nahm", () => {
  const basis = mkdtempSync(path.join(tmpdir(), "apjobs-"));
  const tagHeader = "-----BEGIN " + "OPENSSH PRIVATE KEY-----";
  const tagFooter = "-----END " + "OPENSSH PRIVATE KEY-----";
  const platt = `${tagHeader} AAAA BBBB ${tagFooter}`;
  schluesselAblegen({ SMEJJ_GITHUB_DEPLOY_KEY: platt, SMEJJ_CODEBERG_SSH_KEY: platt }, basis);
  const inhalt = readFileSync(path.join(basis, ".ssh", "codeberg_smejj_ed25519"), "utf8");
  assert.ok(new RegExp("-----BEGIN " + "OPENSSH PRIVATE KEY-----\\nAAAA\\nBBBB\\n-----END " + "OPENSSH PRIVATE KEY-----").test(inhalt),
    "aus Leerzeichen muessen wieder Zeilen werden: " + JSON.stringify(inhalt));
});

test("herzschlagSenden: traegt am, status und gekuerzte Meldung; ohne Schluessel wird nie gesendet", async () => {
  const gesendet = [];
  const fake = async (url, optionen) => { gesendet.push({ url, koerper: JSON.parse(optionen.body) }); return { status: 200 }; };
  const env = { SMEJJ_AUTOPILOT_KEYS: "codeberg-spiegel:k1", SMEJJ_AUTOPILOT_HEARTBEAT_URL: "https://beispiel.test/hb" };

  const status = await herzschlagSenden({ id: "codeberg-spiegel", ok: false, meldung: "x".repeat(500), dauerMs: 1234.9, env, fetchImpl: fake });
  assert.equal(status, 200);
  assert.equal(gesendet[0].url, "https://beispiel.test/hb");
  assert.equal(gesendet[0].koerper.status, "fehler");
  assert.equal(gesendet[0].koerper.meldung.length, 200);
  assert.equal(gesendet[0].koerper.dauerMs, 1234);
  assert.ok(Number.isFinite(Date.parse(gesendet[0].koerper.am)), "am ist ein gueltiger Zeitstempel");

  const ohne = await herzschlagSenden({ id: "codeberg-spiegel", ok: true, env: {}, fetchImpl: fake });
  assert.equal(ohne, 0);
  assert.equal(gesendet.length, 1, "ohne Schluessel geht nichts raus");
});

test("jobs.mjs: timing checks for UTC and weekly jobs", async () => {
  const { istFaelligUtc, istWochenJobFaellig, qualitaetsmessungLauf, voiceRegionCheckLauf, konkurrenzRadarLauf } = await import("../workers/smejj-autopilot-jobs/jobs.mjs");
  const tag = "2026-08-10"; // 2026-08-10 is a Monday (UTCDay = 1)
  const um = (hhmm) => Date.parse(`${tag}T${hhmm}:00.000Z`);

  assert.equal(istFaelligUtc({ jetztMs: um("07:09"), uhrzeitUtc: "07:10", letzterTag: null }), false);
  assert.equal(istFaelligUtc({ jetztMs: um("07:10"), uhrzeitUtc: "07:10", letzterTag: null }), true);
  assert.equal(istWochenJobFaellig({ jetztMs: um("06:00"), wochentagUtc: 1, uhrzeitUtc: "06:00", letzterTag: null }), true);
  assert.equal(istWochenJobFaellig({ jetztMs: um("06:00"), wochentagUtc: 2, uhrzeitUtc: "06:00", letzterTag: null }), false);

  const logs = [];
  const fakeLog = (msg) => logs.push(msg);
  const qRes = await qualitaetsmessungLauf({ log: fakeLog });
  assert.equal(qRes.ok, true);

  const vRes = await voiceRegionCheckLauf({ log: fakeLog });
  assert.equal(vRes.ok, true);

  const kRes = await konkurrenzRadarLauf({ log: fakeLog });
  assert.equal(kRes.ok, true);
});

// ---- Echte Qualitaetsmessung (2026-08-12) -----------------------------------
// Die Netz- und Git-Teile laufen live; hier stehen die reinen Kerne:
// Berichts-Bewertung (Transportfehler ist keine Note!) und die Verdrahtung
// des Jobs mit einem gestubbten Messlauf.

test("bewerteBericht: eine gemessene Note wird als ok mit Note gemeldet", async () => {
  const { bewerteBericht } = await import("../workers/smejj-autopilot-jobs/qualitaetJob.mjs");
  const b = bewerteBericht({
    verdict: "passed",
    summary: { cases: 14, passed: 14, failed: 0, errors: 0, weightedScore: 0.958 }
  });
  assert.equal(b.ok, true);
  assert.equal(b.gemessen, true);
  assert.ok(b.meldung.includes("95,8 %"), "die Note steht in der Meldung: " + b.meldung);
  assert.ok(b.meldung.includes("14 Fälle"));
});

test("bewerteBericht: Transportfehler ergeben KEIN Qualitaetsurteil, sondern fehler", async () => {
  const { bewerteBericht } = await import("../workers/smejj-autopilot-jobs/qualitaetJob.mjs");
  const b = bewerteBericht({ summary: { cases: 14, passed: 10, errors: 4, weightedScore: 0.7 } });
  assert.equal(b.ok, false);
  assert.equal(b.gemessen, false);
  assert.ok(b.meldung.includes("Transportfehler"));
  const leer = bewerteBericht(null);
  assert.equal(leer.ok, false);
  const ohneFaelle = bewerteBericht({ summary: { cases: 0, errors: 0, weightedScore: 1 } });
  assert.equal(ohneFaelle.ok, false);
});

test("echterQualitaetslauf: ohne SMEJJ_SESSION_SECRET ehrliches Lebenszeichen statt Alarm", async () => {
  const { echterQualitaetslauf } = await import("../workers/smejj-autopilot-jobs/qualitaetJob.mjs");
  const e = await echterQualitaetslauf({ env: {}, log: () => {} });
  assert.equal(e.ok, true, "fehlende Einrichtung ist kein Ausfall");
  assert.equal(e.gemessen, false);
  assert.ok(e.meldung.includes("SMEJJ_SESSION_SECRET"));
});

test("qualitaetsmessungLauf: traegt das Messlauf-Ergebnis in den Herzschlag", async () => {
  const { qualitaetsmessungLauf } = await import("../workers/smejj-autopilot-jobs/jobs.mjs");
  const ergebnis = await qualitaetsmessungLauf({
    log: () => {},
    messlauf: async () => ({ ok: false, gemessen: false, meldung: "Messlauf gescheitert: Probe" })
  });
  // Ohne SMEJJ_AUTOPILOT_KEYS sendet herzschlagSenden nie (HTTP 0) — der
  // Rueckgabewert traegt trotzdem das ehrliche Ergebnis.
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.meldung.includes("gescheitert"));
});

test("beide Termine der Qualitaetsmessung kommen am selben Tag dran", async () => {
  const { istFaelligUtc, slotKennung } = await import("../workers/smejj-autopilot-jobs/jobs.mjs");
  const tag = "2026-08-14";
  const um = (zeit) => Date.parse(`${tag}T${zeit}:00Z`);
  const gelaufen = [];

  // Bis 2026-08-14 teilten sich beide Uhrzeiten EINEN Tages-Merker: nach dem
  // ersten Lauf war der zweite Termin fuer den Rest des Tages blockiert, und
  // die Ampel versprach trotzdem "taeglich 7:10 und 19:10 UTC".
  assert.equal(istFaelligUtc({ jetztMs: um("07:10"), uhrzeitUtc: "07:10", gelaufeneSlots: gelaufen }), true);
  gelaufen.push(slotKennung(um("07:10"), "07:10"));

  assert.equal(istFaelligUtc({ jetztMs: um("12:00"), uhrzeitUtc: "07:10", gelaufeneSlots: gelaufen }), false, "derselbe Termin nie doppelt");
  assert.equal(istFaelligUtc({ jetztMs: um("19:10"), uhrzeitUtc: "19:10", gelaufeneSlots: gelaufen }), true, "der zweite Termin kommt dran");

  gelaufen.push(slotKennung(um("19:10"), "19:10"));
  assert.equal(istFaelligUtc({ jetztMs: um("23:00"), uhrzeitUtc: "19:10", gelaufeneSlots: gelaufen }), false);

  // Am naechsten Tag zaehlen die alten Slots nicht mehr.
  const morgen = um("07:10") + 24 * 60 * 60 * 1000;
  assert.equal(istFaelligUtc({ jetztMs: morgen, uhrzeitUtc: "07:10", gelaufeneSlots: gelaufen }), true, "neuer Tag, neue Termine");

  // Ein-Termin-Jobs (ohne Slot-Liste) verhalten sich unveraendert.
  assert.equal(istFaelligUtc({ jetztMs: um("12:00"), uhrzeitUtc: "09:04", letzterTag: tag }), false);
  assert.equal(istFaelligUtc({ jetztMs: um("12:00"), uhrzeitUtc: "09:04", letzterTag: null }), true);
});
