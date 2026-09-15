// smejj.com — Changelog-Wache (Teil von Autopilot Nr. 04), Master-Audit 2026-09-15.
// Kaputte UND gesunde Probe: Grundstand, echte neue Zeile, unveränderte Seite,
// stumme Seite, Anbindung an den Radar-Lauf.
import test from "node:test";
import assert from "node:assert/strict";

import { pruefeChangelogs, textZeilen, neueZeilen, fuehreChangelogSelbsttestAus, CHANGELOGS, MAX_NEU_JE_SEITE } from "./changelogWache.js";
import { fuehreRadarAus } from "./konkurrenzRadar.js";

const speicherMock = () => { const m = new Map(); return { lies: async (id) => m.get(id) || null, schreib: async (d) => { m.set(d.id, d); return d; }, m }; };
const seite = (html, status = 200) => new Response(html, { status, headers: { "content-type": "text/html" } });
const ZIEL = [{ id: "probe", anbieter: "Probe", url: "https://changelog.test/notes" }];

test("Changelog-Wache: Selbsttest grün, Adressliste eindeutig und nur HTTPS", () => {
  const s = fuehreChangelogSelbsttestAus();
  assert.equal(s.bestanden, true, s.fehler.join("; "));
  assert.ok(CHANGELOGS.length >= 12, "mindestens die zwölf Hauptprodukte");
  for (const name of ["Cursor", "Claude Code", "Kimi Code", "DeepSeek", "Mistral", "Manus"]) {
    assert.ok(CHANGELOGS.some((c) => c.anbieter === name), `${name} fehlte im alten Radar`);
  }
});

test("Changelog-Wache: erster Lauf legt nur den Grundstand an, zweiter meldet genau die neue Zeile", async () => {
  const ablage = speicherMock();
  let html = "<h2>September 1, 2026</h2><p>Introducing checkpoints for every agent turn in the editor.</p>";
  const fetchImpl = async () => seite(html);
  const erst = await pruefeChangelogs({ ziele: ZIEL, fetchImpl, ablage, jetztMs: 1 });
  assert.equal(erst.kandidaten.length, 0, "ohne alten Stand ist keine Zeile 'neu'");
  assert.equal(erst.grundstaende, 1);

  const gleich = await pruefeChangelogs({ ziele: ZIEL, fetchImpl, ablage, jetztMs: 2 });
  assert.equal(gleich.unveraendert, 1);
  assert.equal(gleich.kandidaten.length, 0);

  html = "<h2>September 12, 2026</h2><p>Background agents now run in the cloud for up to 24 hours.</p>" + html;
  const neu = await pruefeChangelogs({ ziele: ZIEL, fetchImpl, ablage, jetztMs: Date.parse("2026-09-15T00:00:00Z") });
  assert.equal(neu.kandidaten.length, 1, JSON.stringify(neu.kandidaten));
  const k = neu.kandidaten[0];
  assert.match(k.auszug, /Background agents now run in the cloud/);
  assert.equal(k.bereich, "changelog");
  assert.equal(k.bestaetigt, false, "eine neue Zeile ist Messung, nie eine bestätigte Funktion");
  assert.equal(k.url, ZIEL[0].url);
});

test("Changelog-Wache: stumme Seite ist ein Befund, keine 'keine Neuigkeiten'; Flut wird gedeckelt", async () => {
  const ablage = speicherMock();
  const r = await pruefeChangelogs({ ziele: ZIEL, fetchImpl: async () => seite("weg", 403), ablage });
  assert.equal(r.stumm.length, 1);
  assert.equal(r.stumm[0].grund, "http_403");
  const geworfen = await pruefeChangelogs({ ziele: ZIEL, fetchImpl: async () => { throw new Error("DNS"); }, ablage });
  assert.match(geworfen.stumm[0].grund, /DNS/);

  const b = speicherMock();
  await pruefeChangelogs({ ziele: ZIEL, fetchImpl: async () => seite("<p>Eine erste Zeile, die lang genug für den Filter ist.</p>"), ablage: b });
  const viele = Array.from({ length: 30 }, (_, i) => `<p>Neue Funktion Nummer ${i} mit ausreichend langem Text.</p>`).join("");
  const flut = await pruefeChangelogs({ ziele: ZIEL, fetchImpl: async () => seite(viele), ablage: b });
  assert.equal(flut.kandidaten.length, MAX_NEU_JE_SEITE, "eine umgebaute Seite darf den Radar nicht fluten");
});

test("Changelog-Wache: Textzerlegung ignoriert Skripte und Menüs, Vergleich ist reihenfolgetreu", () => {
  const z = textZeilen("<script>alert('x neue Funktion lang genug')</script><ul><li>Docs</li></ul># Release 2.4.0 — parallel subagents in the terminal");
  assert.deepEqual(z, ["Release 2.4.0 — parallel subagents in the terminal"]);
  assert.deepEqual(textZeilen("<p>What&#x27;s New in Cursor &#8212; Latest Updates here</p>"), ["What's New in Cursor — Latest Updates here"]);
  assert.deepEqual(neueZeilen(["a".repeat(30)], ["b".repeat(30), "a".repeat(30), "c".repeat(30)]), ["b".repeat(30), "c".repeat(30)]);
});

test("Radar: Changelog-Kandidaten stehen vorn, und eine lebende Changelog-Quelle hält den Lauf grün, wenn die Suche stumm ist", async () => {
  const suche = async () => { throw new Error("Suchdienst weg"); };
  const changelogs = async () => ({ geprueft: 2, stumm: [], grundstaende: 0, unveraendert: 1, kandidaten: [{ anbieter: "Cursor", bereich: "changelog", titel: "t", url: "https://cursor.com/changelog", auszug: "t", bestaetigt: false }] });
  const r = await fuehreRadarAus({ suche, env: {}, jetztMs: 1, beobachtet: [{ anbieter: "ChatGPT", anfrage: "x" }], changelogs });
  assert.equal(r.ok, true);
  assert.equal(r.kandidaten[0].bereich, "changelog");
  const kaputt = await fuehreRadarAus({ suche, env: {}, jetztMs: 1, beobachtet: [{ anbieter: "ChatGPT", anfrage: "x" }], changelogs: async () => { throw new Error("boom"); } });
  assert.equal(kaputt.ok, false, "Suche UND Changelogs weg = rot");
});
