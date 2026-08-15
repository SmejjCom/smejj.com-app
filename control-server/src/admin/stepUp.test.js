// smejj.com — Tests fuer den Step-up (frischer Besitznachweis vor jeder
// schreibenden Adminaktion).
// Ausfuehren: node --test control-server/src/admin/stepUp.test.js
//
// WARUM ES DIESE DATEI GIBT: Bei der A-bis-Z-Pruefung am 2026-08-15 fiel auf,
// dass stepUp.js zwar unter dem Admin-Lock liegt — aber keinen einzigen Test
// hatte. Das Modul entscheidet, ob jemand sperren, loeschen oder Rollen
// vergeben darf. Ein eingefrorener Stand ohne Test friert nur ein, was
// niemand nachgemessen hat.
//
// Geprueft werden genau die Eigenschaften, an denen der Schutz haengt — nicht
// die Implementierung.
import test from "node:test";
import assert from "node:assert/strict";

import {
  __clearStepUpForTests, bestaetigeCode, fordereCode, istErhoeht, oeffneFenster
} from "./stepUp.js";

const ADMIN = "chefin@example.invalid";
const ENV = {};

/** Faengt den Code ab, den der Mailer verschicken wuerde. */
function mailAttrappe(gesendet = []) {
  return async (nachricht) => {
    gesendet.push(nachricht);
    return { sent: true };
  };
}

function codeAus(gesendet) {
  const treffer = /(\d{6})/.exec(gesendet.at(-1)?.text || "");
  return treffer ? treffer[1] : "";
}

test.beforeEach(() => __clearStepUpForTests());

test("ohne Bestaetigung ist niemand erhoeht — das ist der Grundzustand", () => {
  assert.equal(istErhoeht(ADMIN), false);
  assert.equal(istErhoeht(""), false);
  assert.equal(istErhoeht(undefined), false);
});

test("der richtige Code oeffnet das Schreibfenster", async () => {
  const gesendet = [];
  const angefordert = await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  assert.equal(angefordert.ok, true);
  assert.equal(istErhoeht(ADMIN), false, "die blosse Anforderung erhoeht noch nicht");

  const bestaetigt = bestaetigeCode(ADMIN, codeAus(gesendet));
  assert.equal(bestaetigt.ok, true);
  assert.equal(istErhoeht(ADMIN), true);
});

test("ein falscher Code oeffnet nichts und zaehlt die Versuche herunter", async () => {
  const gesendet = [];
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  const ergebnis = bestaetigeCode(ADMIN, "000000" === codeAus(gesendet) ? "111111" : "000000");
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "step_up_code_wrong");
  assert.equal(ergebnis.verbleibend, 4);
  assert.equal(istErhoeht(ADMIN), false);
});

test("nach dem sechsten Fehlversuch ist der Code verbrannt — auch der richtige zieht nicht mehr", async () => {
  const gesendet = [];
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  const richtig = codeAus(gesendet);
  const falsch = richtig === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i += 1) bestaetigeCode(ADMIN, falsch);
  const sechster = bestaetigeCode(ADMIN, falsch);
  assert.equal(sechster.error, "step_up_too_many_attempts");
  assert.equal(bestaetigeCode(ADMIN, richtig).error, "step_up_code_missing",
    "ein verbrannter Code darf nicht durch Nachreichen des richtigen wiederbelebt werden");
  assert.equal(istErhoeht(ADMIN), false);
});

test("ein abgelaufener Code zieht nicht mehr", async () => {
  const gesendet = [];
  let jetzt = 1_000_000;
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet), now: () => jetzt });
  jetzt += 10 * 60 * 1000 + 1;
  const ergebnis = bestaetigeCode(ADMIN, codeAus(gesendet), { now: () => jetzt });
  assert.equal(ergebnis.error, "step_up_code_expired");
  assert.equal(istErhoeht(ADMIN, { now: () => jetzt }), false);
});

test("das Schreibfenster schliesst sich nach 15 Minuten von selbst", async () => {
  const gesendet = [];
  let jetzt = 1_000_000;
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet), now: () => jetzt });
  bestaetigeCode(ADMIN, codeAus(gesendet), { now: () => jetzt });
  assert.equal(istErhoeht(ADMIN, { now: () => jetzt + 14 * 60 * 1000 }), true);
  assert.equal(istErhoeht(ADMIN, { now: () => jetzt + 15 * 60 * 1000 + 1 }), false);
});

test("scheitert die Mail, ist KEIN Code im Umlauf", async () => {
  const ergebnis = await fordereCode(ADMIN, {
    env: ENV, mail: async () => ({ sent: false, reason: "IDrive e2 write failed: 403" })
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "step_up_mail_failed");
  assert.match(ergebnis.reason, /403/, "der echte Grund gehoert nach oben — genau der war am 15.08. der Hinweis");
  assert.equal(bestaetigeCode(ADMIN, "000000").error, "step_up_code_missing");
});

test("eine gescheiterte Mail schliesst ein bereits offenes Fenster NICHT", async () => {
  const gesendet = [];
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  bestaetigeCode(ADMIN, codeAus(gesendet));
  assert.equal(istErhoeht(ADMIN), true);

  await fordereCode(ADMIN, { env: ENV, mail: async () => ({ sent: false, reason: "Postfach weg" }) });
  assert.equal(istErhoeht(ADMIN), true, "wer schon erhoeht ist, verliert das nicht durch einen Mailfehler");
});

test("ein neuer Code verlaengert ein offenes Fenster nicht", async () => {
  const gesendet = [];
  let jetzt = 1_000_000;
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet), now: () => jetzt });
  bestaetigeCode(ADMIN, codeAus(gesendet), { now: () => jetzt });
  const endeVorher = jetzt + 15 * 60 * 1000;

  jetzt += 5 * 60 * 1000;
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet), now: () => jetzt });
  assert.equal(istErhoeht(ADMIN, { now: () => endeVorher + 1 }), false,
    "sonst koennte man das Fenster durch blosses Anfordern endlos offen halten");
});

test("Passkey oeffnet das Fenster ohne Mail — und entwertet einen offenen Code", async () => {
  const gesendet = [];
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  const code = codeAus(gesendet);

  assert.equal(oeffneFenster(ADMIN).ok, true);
  assert.equal(istErhoeht(ADMIN), true);
  assert.equal(bestaetigeCode(ADMIN, code).error, "step_up_code_missing",
    "nach dem Passkey darf kein gueltiger Mail-Code mehr herumliegen");
});

test("ohne Adresse geht gar nichts", async () => {
  assert.equal((await fordereCode("", { env: ENV, mail: mailAttrappe() })).error, "step_up_email_missing");
  assert.equal(oeffneFenster("").error, "step_up_email_missing");
});

test("Gross-/Kleinschreibung und Leerzeichen trennen keine Konten", async () => {
  const gesendet = [];
  await fordereCode("  Chefin@Example.Invalid  ", { env: ENV, mail: mailAttrappe(gesendet) });
  assert.equal(bestaetigeCode(ADMIN, codeAus(gesendet)).ok, true);
  assert.equal(istErhoeht("CHEFIN@EXAMPLE.INVALID"), true);
});

test("das Fenster einer Adresse erhoeht keine andere", async () => {
  const gesendet = [];
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  bestaetigeCode(ADMIN, codeAus(gesendet));
  assert.equal(istErhoeht("jemand.anderes@example.invalid"), false);
});

test("der Code steht in der Mail und die Mail sagt, was er bewirkt", async () => {
  const gesendet = [];
  await fordereCode(ADMIN, { env: ENV, mail: mailAttrappe(gesendet) });
  const mail = gesendet.at(-1);
  assert.equal(mail.to, ADMIN, "der Code geht an die Adresse des Kontos, nicht irgendwohin");
  assert.match(mail.text, /\d{6}/);
  assert.match(mail.text, /10 Minuten/);
  assert.match(mail.text, /Wenn du das nicht warst/, "ein zweiter Faktor muss sagen, was bei Missbrauch zu tun ist");
});
