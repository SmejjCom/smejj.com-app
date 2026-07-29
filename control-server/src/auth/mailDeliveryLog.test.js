// smejj.com — Unit-Tests fuer das Zustellprotokoll.
//
// Der wichtigste Test ist der Loeschwaechter. Der Daten-Lock verlangt fuer jede
// Loeschung auf IDrive e2 eine schriftliche Freigabe; erteilt wurde sie
// ausschliesslich fuer Protokolleintraege aelter als 90 Tage. Genau das —
// und nichts daneben — muss der Waechter durchlassen.
//
// Ausfuehren: node --test control-server/src/auth/mailDeliveryLog.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUFBEWAHRUNG_TAGE, darfGeloeschtWerden, leseZustellungen, protokolliereVersand, raeumeAuf
} from "./mailDeliveryLog.js";

const JETZT = Date.parse("2026-07-29T12:04:00.000Z");
const TAG_MS = 24 * 60 * 60 * 1000;
const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "eimer"
});

function antwort(text, status = 200) {
  return { ok: status < 400, status, text: async () => text, arrayBuffer: async () => Buffer.from(text), headers: { get: () => null } };
}

test("DER LOESCHWAECHTER LAESST NUR PROTOKOLLEINTRAEGE DURCH", () => {
  const echt = "mail/zustellung/2026/01/15/mail_0191b2c3-4d5e-6f70-8192-a3b4c5d6e7f8.json";
  assert.equal(darfGeloeschtWerden(echt), true);

  // Alles andere ist tabu — auch was harmlos aussieht.
  for (const fremd of [
    "auth/email-users/abc.json",
    "admin/audit/2026/01/15/eintrag.json",
    "capsules/app/job_x/CAPSULE.md",
    "deployments/control/smejj-control-stufe8.tar.gz",
    "mail/zustellung/",
    "mail/zustellung/2026/01/15/",
    "mail/zustellung/2026/01/15/beliebig.json",
    "mail/zustellung/../../auth/email-users/abc.json",
    "",
    null,
    undefined
  ]) {
    assert.equal(darfGeloeschtWerden(fremd), false, `${fremd} darf NIE geloescht werden`);
  }
});

test("ein Protokolleintrag enthaelt nie den Mailtext", async () => {
  let geschrieben = null;
  await protokolliereVersand(
    { to: "Maria@Example.DE", subject: "smejj.com — E-Mail bestaetigen", sent: true, art: "verify" },
    {
      env: ENV, jetztMs: JETZT,
      fetchImpl: async (url, init) => { geschrieben = { url: String(url), body: String(init.body) }; return antwort("", 200); }
    }
  );
  const eintrag = JSON.parse(geschrieben.body);
  assert.equal(eintrag.empfaenger, "maria@example.de", "Adresse normalisiert");
  assert.equal(eintrag.zugestellt, true);
  assert.equal(eintrag.grund, null, "bei Erfolg gibt es keinen Grund");
  assert.equal("text" in eintrag, false, "der Mailtext mit dem Anmeldelink wird nie gespeichert");
  assert.equal(geschrieben.url.includes("mail/zustellung/2026/07/29/"), true, "nach Tag abgelegt");
});

test("ein Fehlschlag wird mit Grund festgehalten", async () => {
  let body = null;
  await protokolliereVersand(
    { to: "b@example.de", subject: "Test", sent: false, reason: "smtp_auth_failed" },
    { env: ENV, jetztMs: JETZT, fetchImpl: async (u, i) => { body = String(i.body); return antwort("", 200); } }
  );
  const eintrag = JSON.parse(body);
  assert.equal(eintrag.zugestellt, false);
  assert.equal(eintrag.grund, "smtp_auth_failed");
});

test("EIN FEHLSCHLAG BEIM PROTOKOLLIEREN WIRFT NIE", async () => {
  // Das Protokoll ist ein Nachweis, keine Voraussetzung: faellt der Speicher
  // aus, muss die Mail trotzdem rausgehen koennen.
  const e = await protokolliereVersand(
    { to: "a@example.de", subject: "Test", sent: true },
    { env: ENV, jetztMs: JETZT, fetchImpl: async () => { throw new Error("IDrive weg"); } }
  );
  assert.equal(e.ok, false);
  assert.equal(e.grund.includes("IDrive weg"), true);
});

test("ohne Speicher wird das gesagt, nicht geraten", async () => {
  const e = await protokolliereVersand({ to: "a@example.de", subject: "T", sent: true }, { env: {} });
  assert.equal(e.ok, false);
  assert.equal(e.grund, "speicher_nicht_eingerichtet");
});

test("das Aufraeumen fasst nur an, was zu alt UND ein Protokolleintrag ist", async () => {
  const alt = `mail/zustellung/2026/01/01/mail_${"0".repeat(8)}-1111-2222-3333-${"4".repeat(12)}.json`;
  const jung = `mail/zustellung/2026/07/28/mail_${"1".repeat(8)}-1111-2222-3333-${"4".repeat(12)}.json`;
  const fremd = "auth/email-users/opfer.json";
  const geloescht = [];

  const e = await raeumeAuf({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => {
      const adresse = new URL(String(url));
      if ((init?.method || "GET") === "DELETE") {
        geloescht.push(decodeURIComponent(adresse.pathname.split("/").slice(2).join("/")));
        return antwort("", 204);
      }
      const inhalt = [alt, jung, fremd].map((k) => `<Contents><Key>${k}</Key></Contents>`).join("");
      return antwort(`<?xml version="1.0"?><ListBucketResult>${inhalt}<IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
  });

  assert.deepEqual(geloescht, [alt], "nur der alte Protokolleintrag");
  assert.equal(e.geloescht, 1);
  assert.equal(e.aufbewahrungTage, AUFBEWAHRUNG_TAGE);
});

test("ein Schluessel ohne erkennbares Datum bleibt stehen", async () => {
  const geloescht = [];
  await raeumeAuf({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => {
      if ((init?.method || "GET") === "DELETE") { geloescht.push(String(url)); return antwort("", 204); }
      return antwort('<?xml version="1.0"?><ListBucketResult>'
        + "<Contents><Key>mail/zustellung/kaputt.json</Key></Contents>"
        + "<IsTruncated>false</IsTruncated></ListBucketResult>");
    }
  });
  assert.deepEqual(geloescht, [], "im Zweifel bleibt der Eintrag");
});

test("die Grenze liegt genau bei der Aufbewahrungsfrist", async () => {
  const gestern = new Date(JETZT - (AUFBEWAHRUNG_TAGE + 1) * TAG_MS);
  const tag = `${gestern.getUTCFullYear()}/${String(gestern.getUTCMonth() + 1).padStart(2, "0")}/${String(gestern.getUTCDate()).padStart(2, "0")}`;
  const zuAlt = `mail/zustellung/${tag}/mail_aaaaaaaa-1111-2222-3333-444444444444.json`;
  const geloescht = [];
  await raeumeAuf({
    env: ENV, jetztMs: JETZT,
    fetchImpl: async (url, init) => {
      if ((init?.method || "GET") === "DELETE") { geloescht.push(1); return antwort("", 204); }
      return antwort(`<?xml version="1.0"?><ListBucketResult><Contents><Key>${zuAlt}</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
  });
  assert.equal(geloescht.length, 1, "einen Tag ueber der Frist wird geloescht");
});

test("gelesen wird juengste zuerst, mit Zaehlung", async () => {
  const e = await leseZustellungen({
    env: ENV, jetztMs: JETZT, tage: 2,
    fetchImpl: async (url) => {
      const adresse = new URL(String(url));
      if (adresse.searchParams.get("list-type") === "2") {
        const p = adresse.searchParams.get("prefix");
        return antwort(`<?xml version="1.0"?><ListBucketResult><Contents><Key>${p}mail_x.json</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`);
      }
      const tag = String(url).includes("/07/29/") ? "2026-07-29T10:00:00.000Z" : "2026-07-28T10:00:00.000Z";
      const zugestellt = tag.startsWith("2026-07-29");
      return antwort(JSON.stringify({ id: "mail_x", am: tag, empfaenger: "a@example.de", zugestellt, grund: zugestellt ? null : "abgewiesen" }));
    }
  });
  assert.equal(e.ok, true);
  assert.equal(e.total, 2);
  assert.equal(e.eintraege[0].am > e.eintraege[1].am, true, "juengste zuerst");
  assert.equal(e.zugestellt, 1);
  assert.equal(e.fehlgeschlagen, 1);
});
