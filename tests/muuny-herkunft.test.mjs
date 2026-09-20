// muuny AI — die Umbenennung darf die Herkunft nicht verschlucken.
//
// Neun Versionen, vier Datensaetze und alle Noten stammen aus der con-Zeit. Wer
// beim Umbenennen die alten Namen unlesbar macht, wirft genau die Belege weg,
// wegen derer eine Version verworfen wurde — und der Autopilot wiederholt einen
// Versuch, der schon bezahlt und schon gescheitert ist.
import assert from "node:assert/strict";
import test from "node:test";
import { formatVersion, naechsteVersion, parseVersion } from "../workers/muuny-autopilot/registry.js";
import { FAMILIE, lagerPrefix, schluessel, wert } from "../workers/muuny-autopilot/lager.js";

test("Alte con-Nummern bleiben LESBAR, geschrieben wird nur muuny", () => {
  // Lesen: beide Schreibweisen, auch die alte dreistellige.
  assert.deepEqual(parseVersion("con-1.3"), { major: 1, minor: 3 });
  assert.deepEqual(parseVersion("con-1.0.0"), { major: 1, minor: 0 });
  assert.deepEqual(parseVersion("muuny-1.3"), { major: 1, minor: 3 });
  assert.equal(parseVersion("fremd-1.3"), null);
  // Schreiben: ausschliesslich muuny.
  assert.equal(formatVersion({ major: 1, minor: 7 }), "muuny-1.7");
  assert.equal(FAMILIE, "muuny");
});

test("Eine verbrauchte Nummer wird nie neu vergeben — auch nicht ueber die Umbenennung hinweg", () => {
  const stabil = { version: "muuny-1.3", basisPrefix: "muuny/base/qwen3.8-27b" };
  const vergeben = ["muuny-1.0", "muuny-1.1", "muuny-1.2", "muuny-1.3", "muuny-1.4", "muuny-1.5", "muuny-1.6"];
  // Nach muuny-1.3 kommt NICHT 1.4 (verworfen), sondern die erste freie Nummer: 1.7.
  assert.equal(naechsteVersion(stabil, { basisPrefix: "muuny/base/qwen3.8-27b", vergeben }), "muuny-1.7");
  // Ein neues Basismodell erhoeht die erste Stelle.
  assert.equal(naechsteVersion(stabil, { basisPrefix: "muuny/base/anderes", vergeben }), "muuny-2.0");
});

test("Das Lager liegt unter muuny/ und steht an genau einer Stelle", () => {
  assert.equal(lagerPrefix({}), "muuny/");
  const k = schluessel({});
  assert.equal(k.registry, "muuny/registry.json");
  assert.equal(k.zustand, "muuny/autopilot/zustand.json");
  assert.equal(k.kostenGesamt, "muuny/logs/kosten/gesamt.json");
  for (const [name, pfad] of Object.entries(k)) {
    if (name === "prefix") continue;
    assert.ok(pfad.startsWith("muuny/"), `${name} zeigt auf ${pfad} statt ins muuny-Lager`);
  }
  // Umstellbar, ohne eine einzige andere Datei anzufassen.
  assert.equal(schluessel({ MUUNY_LAGER_PREFIX: "probe" }).registry, "probe/registry.json");
});

test("Der neue Schaltername gewinnt, der alte traegt die Uebergangszeit", () => {
  assert.equal(wert({ MUUNY_SALAD_FREIGABE: "YES" }, "SALAD_FREIGABE"), "YES");
  assert.equal(wert({ CON_SALAD_FREIGABE: "YES" }, "SALAD_FREIGABE"), "YES",
    "der Zeabur-Dienst traegt seine Variablen noch unter den alten Namen");
  assert.equal(wert({ MUUNY_SALAD_FREIGABE: "YES", CON_SALAD_FREIGABE: "NO" }, "SALAD_FREIGABE"), "YES",
    "sind beide gesetzt, gilt der neue");
  assert.equal(wert({ MUUNY_SALAD_FREIGABE: "  ", CON_SALAD_FREIGABE: "YES" }, "SALAD_FREIGABE"), "YES",
    "ein leerer neuer Wert darf den alten nicht verdecken");
  assert.equal(wert({}, "SALAD_FREIGABE"), undefined);
});
