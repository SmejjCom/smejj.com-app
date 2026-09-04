// smejj.com — TUEV des Phantom-Waechters (Betreiber-Auftrag 2026-09-04 abends).
//
// Er schliesst eine Luecke, die jede bestehende Sperre hat: check-*-lock.mjs
// vergleicht das Manifest mit der ARBEITSKOPIE. Beide koennen uebereinstimmen
// und trotzdem beide falsch sein — dann meldet die Sperre gruen und bewacht
// eine Fassung, die niemand bekommt. Genau das war am 04.09. den ganzen Tag der
// Fall (composer-plus-menu.js, index.html, app.js, sw.js).
//
// Die Proben laufen OHNE Netz: die Auslieferung wird eingesetzt. Ein Test, der
// smejj.com braucht, waere bei jedem Netzhaenger rot und damit wertlos.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MANIFESTE, adresseVon, pruefeManifest } from "../scripts/check-schutz-echtheit.mjs";

const hash = (t) => createHash("sha256").update(t).digest("hex");

/** Ein Manifest-Gerippe mit genau einer geschuetzten Datei. */
function manifestMit(datei, eingefroren) {
  const ordner = mkdtempSync(path.join(tmpdir(), "smejj-echt-"));
  const pfad = path.join(ordner, "probe-lock-manifest.json");
  writeFileSync(pfad, JSON.stringify({ frozenAt: "2026-09-04T00:00:00.000Z", files: { [datei]: eingefroren } }));
  return { name: "probe", pfad: path.relative(path.resolve(new URL("..", import.meta.url).pathname), pfad) };
}

test("die echten Manifeste stimmen mit der Auslieferung ueberein", async () => {
  // Diese eine Probe darf ans Netz — sie ist der eigentliche Zweck. Faellt das
  // Netz aus, liefert `holen` null und die Datei gilt als nicht messbar, nicht
  // als Verstoss. Rot wird sie also nur bei einem echten Befund.
  for (const eintrag of MANIFESTE) {
    const b = await pruefeManifest(eintrag);
    if (b.fehlt) continue;
    assert.deepEqual(b.phantome, [], `${b.name} bewacht Fassungen, die smejj.com nicht ausliefert`);
  }
});

test("ein STUMMES Phantom faellt auf — Manifest gleich Arbeitskopie, aber nicht gleich Auslieferung", async () => {
  // Der gefaehrliche Fall: die eigene Sperre meldet gruen.
  const echt = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url));
  const eintrag = manifestMit("public/manifest.webmanifest", hash(echt));
  const b = await pruefeManifest(eintrag, "https://beispiel.test", async () => Buffer.from("etwas ganz anderes"));
  assert.equal(b.phantome.length, 1, "das stumme Phantom wurde nicht erkannt");
  assert.equal(b.phantome[0].datei, "public/manifest.webmanifest");
  assert.deepEqual(b.veraltet, [], "es ist kein Veraltungs-Fall — die Arbeitskopie passt zum Manifest");
});

test("ein VERALTETES Manifest wird benannt, faellt aber nicht durch", async () => {
  // Die eigene Sperre ist hier schon rot; zweimal denselben Befund zu melden
  // laesst zweimal suchen.
  const eintrag = manifestMit("public/manifest.webmanifest", hash("laengst ueberholt"));
  const b = await pruefeManifest(eintrag, "https://beispiel.test", async () => Buffer.from("die neue Fassung"));
  assert.equal(b.veraltet.length, 1);
  assert.deepEqual(b.phantome, [], "veraltet ist kein Phantom");
});

test("ein gebuendeltes Artefakt wird NICHT gegen seine Quelle gehascht", async () => {
  // Der erste Entwurf meldete /chat-bridge.js als Phantom: Quelle 36 KB,
  // ausgeliefert 813 KB, zusammengesetzt aus einem Dutzend Dateien. Ein
  // Artefakt gegen seine Quelle zu haschen beantwortet die falsche Frage.
  const echt = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url));
  const eintrag = manifestMit("public/manifest.webmanifest", hash(echt));
  const b = await pruefeManifest(eintrag, "https://beispiel.test",
    async () => Buffer.from("// ERZEUGTE DATEI — nicht von Hand bearbeiten.\n// Gebuendelt aus a.js, b.js\nalles moegliche"));
  assert.deepEqual(b.phantome, []);
  assert.deepEqual(b.artefakte, ["public/manifest.webmanifest"]);
});

test("eine nicht abrufbare Datei ist kein Verstoss", async () => {
  // Serverdateien liefert niemand aus. "Nicht messbar" darf nie "verletzt"
  // heissen — dieselbe Regel wie in der Stempel-Kaskade.
  const eintrag = manifestMit("control-server/src/admin/adminAuth.js", "egal");
  const b = await pruefeManifest(eintrag, "https://beispiel.test", async () => null);
  assert.deepEqual(b.phantome, []);
  assert.equal(b.nichtMessbar.length, 1);
  assert.equal(b.geprueft, 0);
});

test("nur oeffentliche Dateien bekommen ueberhaupt eine Adresse", () => {
  assert.equal(adresseVon("public/app.js", "https://smejj.com"), "https://smejj.com/app.js");
  assert.equal(adresseVon("public/ai/router.js", "https://smejj.com"), "https://smejj.com/ai/router.js");
  assert.equal(adresseVon("control-server/src/admin/adminAuth.js"), null);
  assert.equal(adresseVon("src/shared/controlAccessPolicy.js"), null);
  assert.equal(adresseVon("public/views.test.js"), null, "Tests gehen nie ins Netz");
});

test("alle acht Sperr-Manifeste sind erfasst", () => {
  const namen = MANIFESTE.map((m) => m.name);
  for (const pflicht of ["start-lock", "security-lock", "admin-lock", "favicon-lock"]) {
    assert.ok(namen.includes(pflicht), `${pflicht} fehlt in der Liste`);
  }
  assert.ok(MANIFESTE.length >= 8);
});
