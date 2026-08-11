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
  const pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\nBBBB\n-----END OPENSSH PRIVATE KEY-----";
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
  const platt = "-----BEGIN OPENSSH PRIVATE KEY----- AAAA BBBB -----END OPENSSH PRIVATE KEY-----";
  schluesselAblegen({ SMEJJ_GITHUB_DEPLOY_KEY: platt, SMEJJ_CODEBERG_SSH_KEY: platt }, basis);
  const inhalt = readFileSync(path.join(basis, ".ssh", "codeberg_smejj_ed25519"), "utf8");
  assert.ok(/-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\nBBBB\n-----END OPENSSH PRIVATE KEY-----/.test(inhalt),
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
