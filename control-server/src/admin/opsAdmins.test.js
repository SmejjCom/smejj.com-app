// smejj.com — Unit-Tests fuer die Admin-Verwaltung.
//
// Kern: Vier Augen brauchen zwei Menschen. Gibt es nur einen Berechtigten, ist
// Loeschen nicht "unsicher", sondern unmoeglich — der Antragsteller darf die
// eigene Anfrage nicht freigeben. Das faellt sonst erst auf, wenn man es braucht.
//
// Ausfuehren: node --test control-server/src/admin/opsAdmins.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { adminUebersicht, effektiveZugaenge, notzugangsLage, vierAugenLage } from "./opsAdmins.js";

const JETZT = Date.parse("2026-07-28T12:00:00.000Z");

function konto(felder = {}) {
  return {
    userId: "u_1", email: "chefin@example.de", name: "Chefin", method: "email",
    role: "owner", status: "active", emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z", activeSessions: 1, loginLockedUntil: null,
    ...felder
  };
}

const OHNE_FAKTOR = async () => [];

test("nur Konten mit Adminrolle erscheinen — ein gewoehnliches Konto ist kein stiller Admin", async () => {
  const e = await adminUebersicht({
    env: {}, jetztMs: JETZT, leseFaktoren: OHNE_FAKTOR,
    leseIndex: async () => ({ ok: true, entries: [
      konto({ userId: "u_1", email: "chefin@example.de", role: "owner" }),
      konto({ userId: "u_2", email: "gast@example.de", role: "user" }),
      konto({ userId: "u_3", email: "pruefer@example.de", role: "auditor" })
    ] })
  });
  assert.equal(e.total, 2);
  assert.deepEqual(e.admins.map((a) => a.email), ["chefin@example.de", "pruefer@example.de"]);
  assert.equal(e.admins[0].rolle, "owner", "Owner steht oben");
});

test("EIN NOTZUGANG OHNE VERZEICHNISEINTRAG IST TROTZDEM EIN OWNER", async () => {
  // Live gefunden (28.07.2026, Version 108): die Ansicht meldete "0 Zugaenge",
  // waehrend ein Owner angemeldet war. Dessen Rolle kommt aus
  // SMEJJ_ADMIN_OWNER_EMAILS, nicht aus einem Rollenfeld. Eine
  // Sicherheitsuebersicht, die wirksame Zugaenge uebersieht, ist schlimmer als
  // keine: sie behauptet Leere, wo Macht liegt.
  const e = await adminUebersicht({
    env: { SMEJJ_ADMIN_OWNER_EMAILS: "chefin@example.de" },
    jetztMs: JETZT, leseFaktoren: OHNE_FAKTOR,
    leseIndex: async () => ({ ok: true, entries: [konto({ userId: "u_9", email: "gast@example.de", role: "user" })] })
  });
  assert.equal(e.total, 1, "der Notzugang zaehlt als Zugang");
  assert.equal(e.admins[0].email, "chefin@example.de");
  assert.equal(e.admins[0].rolle, "owner");
  assert.equal(e.admins[0].imVerzeichnis, false, "sichtbar, dass kein Konto dahintersteht");
  assert.equal(e.admins[0].herkunft, "notzugang");
});

test("ein gewoehnliches Konto auf der Notzugangsliste wird zum Owner hochgestuft", () => {
  // Genau wie resolveAdminActor: Bootstrap gewinnt nur nach oben.
  const zugaenge = effektiveZugaenge(
    [{ userId: "u_1", email: "chefin@example.de", role: "user", status: "active" }],
    { SMEJJ_ADMIN_OWNER_EMAILS: "chefin@example.de" }
  );
  assert.equal(zugaenge.length, 1);
  assert.equal(zugaenge[0].role, "owner");
  assert.equal(zugaenge[0].herkunft, "notzugang");
  assert.equal(zugaenge[0].imVerzeichnis, true, "ein Konto gibt es ja");
});

test("ein gesperrtes Konto auf der Notzugangsliste kommt NICHT herein", () => {
  const zugaenge = effektiveZugaenge(
    [{ userId: "u_1", email: "alt@example.de", role: "owner", status: "blocked" }],
    { SMEJJ_ADMIN_OWNER_EMAILS: "alt@example.de" }
  );
  assert.equal(zugaenge[0].status, "blocked", "die Sperre bleibt sichtbar");
  const lage = vierAugenLage([{ email: "alt@example.de", rolle: "owner", status: "blocked" }]);
  assert.equal(lage.rechte[0].berechtigte, 0, "gesperrt heisst gesperrt, auch als Notzugang");
});

test("kein Konto ohne Kennung wird nach Passkeys gefragt", async () => {
  let gefragt = 0;
  const e = await adminUebersicht({
    env: { SMEJJ_ADMIN_OWNER_EMAILS: "chefin@example.de" },
    jetztMs: JETZT,
    leseFaktoren: async () => { gefragt += 1; return []; },
    leseIndex: async () => ({ ok: true, entries: [] })
  });
  assert.equal(gefragt, 0, "ohne Kennung gibt es nichts abzufragen");
  assert.equal(e.admins[0].zweiterFaktor, -1, "und das Ergebnis ist unbekannt, nicht null");
});

test("EIN EINZIGER BERECHTIGTER MACHT VIER AUGEN UNMOEGLICH", () => {
  const allein = vierAugenLage([{ email: "chefin@example.de", rolle: "owner", status: "active" }]);
  assert.equal(allein.erfuellt, false);
  for (const recht of allein.rechte) {
    assert.equal(recht.berechtigte, 1);
    assert.equal(recht.moeglich, false, `${recht.recht} braucht zwei Menschen`);
  }
  assert.equal(allein.hinweis.includes("unmoeglich"), true);

  const zuZweit = vierAugenLage([
    { email: "chefin@example.de", rolle: "owner", status: "active" },
    { email: "vize@example.de", rolle: "admin", status: "active" }
  ]);
  assert.equal(zuZweit.erfuellt, true);
});

test("ein gesperrtes Konto zaehlt nicht als zweites Augenpaar", () => {
  const lage = vierAugenLage([
    { email: "chefin@example.de", rolle: "owner", status: "active" },
    { email: "alt@example.de", rolle: "admin", status: "blocked" }
  ]);
  assert.equal(lage.erfuellt, false, "wer gesperrt ist, kann nichts freigeben");
});

test("eine Rolle ohne dual-Recht hilft beim Vier-Augen-Prinzip nicht", () => {
  const lage = vierAugenLage([
    { email: "chefin@example.de", rolle: "owner", status: "active" },
    { email: "hilfe@example.de", rolle: "support", status: "active" },
    { email: "pruefer@example.de", rolle: "auditor", status: "active" }
  ]);
  assert.equal(lage.erfuellt, false, "Support und Auditor duerfen nicht loeschen — also auch nicht freigeben");
  assert.deepEqual(lage.rechte[0].wer, ["chefin@example.de"]);
});

test("der Notzugang wird benannt, nicht verschwiegen", () => {
  const lage = notzugangsLage(
    { SMEJJ_ADMIN_OWNER_EMAILS: "chefin@example.de, reserve@example.de" },
    [{ email: "chefin@example.de", rolle: "owner", status: "active" }]
  );
  assert.equal(lage.eingerichtet, true);
  assert.equal(lage.anzahl, 2);
  assert.equal(lage.ohneKonto, 1, "reserve@example.de hat noch kein Konto — das ist wichtig zu wissen");
  assert.equal(lage.eintraege[0].kontoVorhanden, true);
  assert.equal(lage.eintraege[1].kontoVorhanden, false);
});

test("ohne Notzugang wird die Folge ausgesprochen", () => {
  const lage = notzugangsLage({}, []);
  assert.equal(lage.eingerichtet, false);
  assert.equal(lage.hinweis.includes("kommt niemand mehr herein"), true);
});

test("ein nicht ermittelbarer zweiter Faktor ist nicht dasselbe wie keiner", async () => {
  const e = await adminUebersicht({
    env: {}, jetztMs: JETZT,
    leseFaktoren: async () => { throw new Error("Speicher weg"); },
    leseIndex: async () => ({ ok: true, entries: [konto()] })
  });
  assert.equal(e.admins[0].zweiterFaktor, -1, "unbekannt wird als unbekannt gefuehrt");
  assert.equal(e.ohneZweitenFaktor, 0, "und nicht als Mangel gezaehlt");
});

test("wer keinen zweiten Faktor hat, wird gezaehlt", async () => {
  const e = await adminUebersicht({
    env: {}, jetztMs: JETZT, leseFaktoren: OHNE_FAKTOR,
    leseIndex: async () => ({ ok: true, entries: [konto(), konto({ userId: "u_2", email: "vize@example.de", role: "admin" })] })
  });
  assert.equal(e.ohneZweitenFaktor, 2);
});

test("ohne Index wird das gesagt, nicht geraten", async () => {
  const e = await adminUebersicht({ env: {}, leseIndex: async () => ({ ok: false, error: "index_not_built" }) });
  assert.equal(e.ok, false);
  assert.equal(e.error, "index_not_built");
});
