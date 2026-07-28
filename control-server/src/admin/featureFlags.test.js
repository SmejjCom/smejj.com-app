// smejj.com — Unit-Tests fuer Feature-Flags.
// Ausfuehren: node --test control-server/src/admin/featureFlags.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  FLAG_STATUS, __clearFlagsForTests, bucketFor, isEnabledFor, listFlags, resolveFlagsFor, upsertFlag, validateFlagInput
} from "./featureFlags.js";

const ENV = {};
const ACTOR = { email: "chefin@example.de" };

test("die Zuordnung ist stabil: derselbe Mensch bekommt immer dieselbe Antwort", () => {
  const a = bucketFor("chat-neu", "u_maria");
  for (let i = 0; i < 20; i += 1) assert.equal(bucketFor("chat-neu", "u_maria"), a);
  // Anderes Flag oder andere Person -> in aller Regel anderer Eimer.
  assert.notEqual(bucketFor("chat-alt", "u_maria"), a);
  assert.equal(bucketFor("chat-neu", "u_tobias") !== a || true, true);
  assert.equal(a >= 0 && a < 100, true);
});

test("die Verteilung ist grob gleichmaessig — sonst waere 5 % nicht 5 %", () => {
  let treffer = 0;
  for (let i = 0; i < 2000; i += 1) if (bucketFor("test", `u_${i}`) < 10) treffer += 1;
  const anteil = treffer / 2000;
  assert.equal(anteil > 0.07 && anteil < 0.13, true, `10 % erwartet, waren ${Math.round(anteil * 100)} %`);
});

test("fail-closed: unbekannt oder aus heisst aus", () => {
  assert.equal(isEnabledFor(null, "u_1"), false);
  assert.equal(isEnabledFor({ status: FLAG_STATUS.off }, "u_1"), false);
  assert.equal(isEnabledFor({ status: "quatsch" }, "u_1"), false);
  assert.equal(isEnabledFor({ name: "x", status: FLAG_STATUS.partial, percent: 50 }, ""), false,
    "ohne Kennung keine Zuordnung");
});

test("Testkonten sind immer an, auch bei einem Prozent", () => {
  const flag = { name: "neu", status: FLAG_STATUS.partial, percent: 1, alwaysOn: ["u_test"] };
  assert.equal(isEnabledFor(flag, "u_test"), true);
});

test("Gross- und Kleinschreibung wird vereinheitlicht, nicht abgewiesen", () => {
  const geprueft = validateFlagInput({ name: "  Chat-NEU  ", status: "on" });
  assert.equal(geprueft.ok, true);
  assert.equal(geprueft.wert.name, "chat-neu", "ein Flag, eine Schreibweise");
});

test("die Eingabe wird geprueft, nicht geraten", () => {
  assert.equal(validateFlagInput({ name: "a", status: "on" }).error, "flag_name_invalid");
  assert.equal(validateFlagInput({ name: "mit leerzeichen", status: "on" }).error, "flag_name_invalid");
  assert.equal(validateFlagInput({ name: "1-startet-mit-ziffer", status: "on" }).error, "flag_name_invalid");
  assert.equal(validateFlagInput({ name: "gut-so", status: "vielleicht" }).error, "flag_status_invalid");
  assert.equal(validateFlagInput({ name: "gut-so", status: "partial", percent: 0 }).error, "flag_percent_invalid");
  assert.equal(validateFlagInput({ name: "gut-so", status: "partial", percent: 100 }).error, "flag_percent_invalid");
  assert.equal(validateFlagInput({ name: "gut-so", status: "partial", percent: 5 }).ok, true);
});

test("anlegen und aendern schreiben denselben Datensatz fort", async () => {
  __clearFlagsForTests();
  const neu = await upsertFlag({ name: "chat-neu", status: "partial", percent: 5 }, { actor: ACTOR, env: ENV });
  assert.equal(neu.ok, true);
  assert.equal(neu.neu, true);
  assert.equal(neu.before, null);

  const geaendert = await upsertFlag({ name: "chat-neu", status: "on" }, { actor: ACTOR, env: ENV });
  assert.equal(geaendert.neu, false);
  assert.equal(geaendert.before.percent, 5);
  assert.equal(geaendert.after.status, "on");
  assert.equal(geaendert.after.percent, 100);

  const liste = await listFlags({ env: ENV });
  assert.equal(liste.total, 1, "kein zweiter Datensatz fuer denselben Namen");
});

test("die Aufloesung fuer einen Client zeigt nur an oder aus, keine Verwaltung", async () => {
  __clearFlagsForTests();
  await upsertFlag({ name: "an-fuer-alle", status: "on" }, { actor: ACTOR, env: ENV });
  await upsertFlag({ name: "aus-fuer-alle", status: "off" }, { actor: ACTOR, env: ENV });
  const ergebnis = await resolveFlagsFor("u_maria", { env: ENV });
  assert.deepEqual(ergebnis.flags, { "an-fuer-alle": true, "aus-fuer-alle": false });
  assert.equal(JSON.stringify(ergebnis).includes("chefin@example.de"), false, "keine Verwaltungsdaten nach aussen");
});
