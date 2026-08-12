// smejj.com — Werkstatt-Autopilot Station 3 (Prüfen): das Tor-Urteil.
//
// Die Abnahme-Kriterien der Spezifikation als Test: ein Testfehler stoppt den
// Kreislauf, ein Angriff auf gesperrte Dateien ebenso. Ergaenzt um den Fall,
// der am 2026-08-12 real passiert ist: das Manifest wird im selben Zug neu
// eingefroren, damit die Sperre gruen bleibt.
import test from "node:test";
import assert from "node:assert/strict";

import { faelleUrteil, pruefeManifeste, SPERREN, MANIFESTE } from "../scripts/werkstatt/pruefe-tor.mjs";

const ALLE_SPERREN_OK = SPERREN.map((name) => ({ name, ok: true }));

test("Tor offen: alles bestanden", () => {
  const u = faelleUrteil({
    manifeste: { ok: true, veraendert: [] },
    sperren: ALLE_SPERREN_OK,
    suite: { ok: true }
  });
  assert.equal(u.offen, true);
  assert.deepEqual(u.gruende, []);
});

test("Abnahme 1: ein Testfehler schliesst das Tor", () => {
  const u = faelleUrteil({
    manifeste: { ok: true },
    sperren: ALLE_SPERREN_OK,
    suite: { ok: false }
  });
  assert.equal(u.offen, false);
  assert.ok(u.gruende.some((g) => g.includes("Pruefsuite")));
});

test("Abnahme 2: eine verletzte Sperre schliesst das Tor", () => {
  const sperren = ALLE_SPERREN_OK.map((s) => (s.name === "check:start-lock" ? { ...s, ok: false } : s));
  const u = faelleUrteil({ manifeste: { ok: true }, sperren, suite: { ok: true } });
  assert.equal(u.offen, false);
  assert.ok(u.gruende.some((g) => g.includes("check:start-lock")));
});

test("DIE LUECKE VOM 2026-08-12: Manifest im selben Zug neu eingefroren", () => {
  // Alle Sperren melden gruen — WEIL das Manifest mitgeaendert wurde.
  // Genau so blieben an diesem Tag sechs Commits einer Parallelsitzung
  // unbeanstandet. Das Tor muss trotzdem zu bleiben.
  const u = faelleUrteil({
    manifeste: { ok: false, veraendert: ["docs/security/security-lock-manifest.json"], grund: "seit der Bau-Basis veraendert" },
    sperren: ALLE_SPERREN_OK,
    suite: { ok: true }
  });
  assert.equal(u.offen, false, "gruene Sperren zaehlen nicht, wenn das Schloss selbst ausgetauscht wurde");
  assert.ok(u.gruende.some((g) => g.includes("security-lock-manifest.json")));
});

test("Fail-closed: was nicht geprueft wurde, gilt als NICHT bestanden", () => {
  assert.equal(faelleUrteil({}).offen, false, "ohne jeden Befund bleibt das Tor zu");

  // Nur die Haelfte der Sperren gelaufen — der Rest fehlt und wird benannt.
  const u = faelleUrteil({
    manifeste: { ok: true },
    sperren: [{ name: "check:start-lock", ok: true }],
    suite: { ok: true }
  });
  assert.equal(u.offen, false);
  assert.ok(u.gruende.some((g) => g.includes("nicht ausgefuehrt")));

  // --schnell laesst die Suite aus: bequem fuer Zwischenlaeufe, aber das Tor
  // darf davon NICHT aufgehen.
  const s = faelleUrteil({ manifeste: { ok: true }, sperren: ALLE_SPERREN_OK, suite: { ok: false, uebersprungen: true } });
  assert.equal(s.offen, false);
  assert.ok(s.gruende.some((g) => g.includes("uebersprungen")));
});

test("Manifest-Pruefung: ein kaputter Git-Vergleich schliesst das Tor", async () => {
  const r = await pruefeManifeste("gibtsnicht", async () => ({ code: 128, ausgabe: "unknown revision" }));
  assert.equal(r.ok, false);
  assert.ok(r.grund.includes("fail-closed"));
});

test("Manifest-Pruefung: unveraenderte Manifeste sind in Ordnung", async () => {
  const r = await pruefeManifeste("origin/main", async () => ({ code: 0, ausgabe: "\n" }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.veraendert, []);
});

test("Alle sechs Lock-Manifeste stehen unter Beobachtung", () => {
  // Wer eine neue Sperre einfuehrt, muss ihr Manifest hier eintragen —
  // sonst laesst sich genau diese Sperre wieder nebenbei neu einfrieren.
  assert.equal(MANIFESTE.length, 6);
  for (const pfad of MANIFESTE) assert.ok(pfad.endsWith("-lock-manifest.json"), pfad);
});
