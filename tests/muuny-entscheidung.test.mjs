// muuny AI — Teil 3: befoerdern nur bei messbarer Verbesserung (Owner-Auftrag 21.09.2026).
import assert from "node:assert/strict";
import test from "node:test";
import { adapterAusTraining, adapterVollstaendig, entscheide, pruefeFreigabe, schreibeFreigabe }
  from "../workers/muuny-autopilot/entscheidung.js";
import { L } from "../workers/muuny-autopilot/lager.js";

const LATTE = { "con-sprache": "a1", "con-sicherheit": "b2", "con-coding": "c3" };
const kat = (sprache, sicherheit, coding, sichKrit = 0) => ({
  sprache: { score: sprache, kritisch: 0 }, sicherheit: { score: sicherheit, kritisch: sichKrit }, coding: { score: coding, kritisch: 0 } });
const GRUND = { punktzahl: 0.90, kritisch: 2, kategorien: kat(0.90, 1.0, 0.85), suitenStand: LATTE };
const kandidat = (gesamt, kategorien = kat(0.93, 1.0, 0.90), suitenStand = LATTE) => ({ gesamt, kritisch: 1, kategorien, suitenStand });

test("OHNE Vergleichswert wird NIE befoerdert — auch nicht die erste Version", () => {
  const u = entscheide(kandidat(0.99), { grundmodell: null, stabil: null });
  assert.equal(u.entscheidung, "REJECT");
  assert.deepEqual(u.gruende, ["kein_vergleichswert_grundmodell"],
    "bei smejj waren 8 von 8 Adaptern schlechter als das Grundmodell — ohne diese Regel waere Schrott live gegangen");
});

test("Vergleichswert von einer anderen Latte zaehlt nicht", () => {
  const u = entscheide(kandidat(0.99), { grundmodell: { ...GRUND, suitenStand: { ...LATTE, "con-coding": "ALT" } } });
  assert.equal(u.entscheidung, "REJECT");
  assert.deepEqual(u.gruende, ["vergleichswert_von_anderer_latte"]);
  // Fehlt der Stand beim Kandidaten ganz, ist das ebenfalls keine gleiche Latte.
  assert.equal(entscheide({ gesamt: 0.99, kategorien: kat(1, 1, 1) }, { grundmodell: GRUND }).entscheidung, "REJECT");
});

test("SCHLECHTER als das Grundmodell -> verworfen", () => {
  const u = entscheide(kandidat(0.88, kat(0.88, 1.0, 0.85)), { grundmodell: GRUND });
  assert.equal(u.entscheidung, "REJECT");
  assert.ok(u.gruende.some((g) => g.startsWith("kein_messbarer_vorsprung")));
  assert.equal(u.referenz, "grundmodell");
});

test("Besser, aber innerhalb des Rauschens -> verworfen", () => {
  const u = entscheide(kandidat(0.905), { grundmodell: GRUND });
  assert.equal(u.entscheidung, "REJECT", "ein halber Punkt ist Messschwankung, keine Verbesserung");
  assert.ok(u.gruende.some((g) => g === "kein_messbarer_vorsprung:0.005"));
});

test("Messbar besser als der BESTWERT -> befoerdert", () => {
  const u = entscheide(kandidat(0.92), { grundmodell: GRUND });
  assert.equal(u.entscheidung, "PROMOTE");
  assert.equal(u.delta, 0.02);
  assert.equal(u.referenz, "grundmodell");
});

test("Bestwert ist das Maximum: gegen eine staerkere stabile Version reicht 'besser als Grundmodell' nicht", () => {
  const stabil = { version: "muuny-1.3", gesamt: 0.95, kritisch: 1, kategorien: kat(0.95, 1.0, 0.93), suitenStand: LATTE };
  const u = entscheide(kandidat(0.93), { grundmodell: GRUND, stabil });
  assert.equal(u.entscheidung, "REJECT");
  assert.equal(u.referenz, "muuny-1.3");
  // ... aber eine stabile Version von einer ALTEN Latte zaehlt nicht als Bestwert.
  const altStabil = { ...stabil, gesamt: 0.99, suitenStand: { ...LATTE, "con-sprache": "ALT" } };
  assert.equal(entscheide(kandidat(0.92), { grundmodell: GRUND, stabil: altStabil }).referenz, "grundmodell");
});

test("Kritischer Sicherheitsfehler -> sofort verworfen, egal wie gut der Rest ist", () => {
  const u = entscheide(kandidat(0.99, kat(1, 0.95, 1, 1)), { grundmodell: GRUND });
  assert.equal(u.entscheidung, "REJECT");
  assert.ok(u.gruende.includes("kritischer_sicherheitsfehler:1"), "ein verratenes Geheimnis ist durch nichts aufzuwiegen");
});

test("Sicherheit schlechter als die Referenz -> verworfen, auch ohne kritischen Fehler", () => {
  const u = entscheide(kandidat(0.99, kat(1, 0.98, 1)), { grundmodell: GRUND });
  assert.equal(u.entscheidung, "REJECT");
  assert.ok(u.gruende.some((g) => g.startsWith("sicherheit_schlechter")));
});

test("Wissen gegen Koennen: ein Einbruch in einer Kategorie verhindert den Aufstieg", () => {
  // Gesamt steigt, aber Coding faellt um 5 Punkte. Genau das verdeckt ein einzelner Wert.
  const u = entscheide(kandidat(0.95, kat(1.0, 1.0, 0.80)), { grundmodell: GRUND });
  assert.equal(u.entscheidung, "REJECT");
  assert.ok(u.gruende.some((g) => g.startsWith("einbruch:coding")));
});

test("Freigabe: eine HALBE Adapterangabe wird nie geschrieben", async () => {
  const geschrieben = {};
  const e2 = { putJson: async (k, v) => { geschrieben[k] = v; }, getJson: async (k) => geschrieben[k] ?? null };
  const voll = { datei: "muuny-1.12-lora.gguf", sha256: "a".repeat(64), sizeBytes: 12345, ablageort: "muuny/versions/muuny-1.12/adapter-gguf" };
  for (const halb of [
    null,
    { ...voll, sha256: undefined },
    { ...voll, sha256: "zu-kurz" },
    { ...voll, sizeBytes: 0 },
    { ...voll, sizeBytes: 12.5 },
    { ...voll, datei: "" },
    { ...voll, datei: "../../etc/passwd" },
    { ...voll, ablageort: undefined }
  ]) {
    const r = await schreibeFreigabe(e2, { modell: "Qwen/Qwen3.8-27B", version: "muuny-1.12", punktzahl: 0.93, adapter: halb });
    assert.equal(r.geschrieben, false, `darf nicht geschrieben werden: ${JSON.stringify(halb)}`);
    assert.equal(geschrieben[L.freigabe], undefined);
  }
  const ok = await schreibeFreigabe(e2, { modell: "Qwen/Qwen3.8-27B", version: "muuny-1.12", punktzahl: 0.93, adapter: voll });
  assert.equal(ok.geschrieben, true);
  assert.equal(geschrieben[L.freigabe].adapter.sha256, voll.sha256);
});

test("Freigabe: Schreiben gilt erst nach Rueckpruefung — keine stille Luege", async () => {
  const e2 = { putJson: async () => {}, getJson: async () => null }; // schluckt alles
  const r = await schreibeFreigabe(e2, { modell: "m", version: "muuny-1.12", punktzahl: 0.9,
    adapter: { datei: "x.gguf", sha256: "b".repeat(64), sizeBytes: 9, ablageort: "muuny/x" } });
  assert.equal(r.geschrieben, false);
  assert.equal(r.grund, "rueckpruefung_fehlgeschlagen");
});

test("Freigabe lesen: jede Luecke macht sie ungueltig", () => {
  const f = { modell: "Qwen/Qwen3.8-27B", version: "muuny-1.12", punktzahl: 0.93,
    adapter: { datei: "a.gguf", sha256: "c".repeat(64), sizeBytes: 1, ablageort: "muuny/a" } };
  assert.equal(pruefeFreigabe(f).gueltig, true);
  assert.equal(pruefeFreigabe(null).grund, "keine_freigabe");
  assert.equal(pruefeFreigabe({ ...f, version: "con-1.3" }).grund, "version_ungueltig");
  assert.equal(pruefeFreigabe({ ...f, punktzahl: "hoch" }).grund, "punktzahl_fehlt");
  assert.equal(pruefeFreigabe({ ...f, adapter: { ...f.adapter, sizeBytes: undefined } }).grund, "adapter_unvollstaendig");
});

test("Ohne GGUF-Umwandlung gibt es keine Adapterangabe", () => {
  assert.equal(adapterAusTraining({ adapterGguf: null }), null, "so war es bei jedem Lauf bis heute");
  assert.equal(adapterVollstaendig(adapterAusTraining({})), false);
  const a = adapterAusTraining({ adapterGguf: { datei: "m.gguf", sha256: "d".repeat(64), sizeBytes: 5, prefix: "muuny/v/g", version: "muuny-1.12" } });
  assert.deepEqual(a, { datei: "m.gguf", sha256: "d".repeat(64), sizeBytes: 5, ablageort: "muuny/v/g" });
  assert.equal(adapterVollstaendig(a), true);
});
