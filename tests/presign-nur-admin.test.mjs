// smejj.com — Waechter: signierte Speicheradressen sind kein Selbstbedienungsladen.
//
// BEFUND 2026-08-15 (A-bis-Z-Pruefung, Runde 3): /api/storage/presign verlangte
// nur "angemeldet" — keine Rolle. Registrieren kann sich jeder. Der Gatekeeper
// prueft den PFAD, aber nie, WER fragt. Damit konnte jedes frisch angelegte
// Konto sich eine signierte PUT-Adresse ausstellen lassen fuer:
//
//   deployments/control/*.tar.gz   <- Release-Artefakte des Control-Servers
//   model-files/**, rag/**, backups/**, objects/**, manifests/**, ...
//
// `deployments/` wiegt am schwersten: wer dort ein Artefakt austauscht, legt
// Code ab, den der Betreiber spaeter ausrollt. Das ist die Lieferkette.
//
// Gebraucht wird von normalen Nutzern genau EIN Fall: public/maus-replay.js
// liest Replay-Aufnahmen unter `capsules/maus-engine/` (operation "download").
// Genau der bleibt offen, alles andere verlangt eine Adminrolle.
import test from "node:test";
import assert from "node:assert/strict";
import { istNutzerfall } from "../control-server/src/routes/storagePresignRoutes.js";
import { normalizeObjectKey } from "../gatekeeper/policy.js";
import { readFileSync } from "node:fs";

test("der Replay-Lesefall bleibt fuer Angemeldete offen (gesunde Probe)", () => {
  // Ohne ihn haenge maus-replay.html an einer Adminrolle, die dort niemand hat.
  assert.equal(istNutzerfall({ operation: "download", key: "capsules/maus-engine/lauf-1/schritt-3.json" }), true);
  assert.equal(istNutzerfall({ operation: "download", key: "capsules/maus-engine/x.json" }), true);
});

test("alles Schreibende faellt aus dem Nutzerfall (kaputte Probe)", () => {
  // Das ist der Angriff: ein frisch registriertes Konto laedt ein
  // Release-Artefakt hoch, das der Betreiber spaeter ausrollt.
  const angriffe = [
    { operation: "upload", key: "deployments/control/smejj-control-stufe9.tar.gz" },
    { operation: "upload", key: "model-files/glm-5-2-fp8/original/modell.bin" },
    { operation: "upload", key: "rag/projektwissen.json" },
    { operation: "upload", key: "backups/alles.tar.gz" },
    { operation: "upload", key: "static-assets/app.js" },
    // Auch der Upload auf den Replay-Pfad selbst: der Gatekeeper laesst ihn
    // ohnehin nicht durch, aber der Nutzerfall darf ihn erst gar nicht tragen.
    { operation: "upload", key: "capsules/maus-engine/lauf-1/schritt-3.json" }
  ];
  for (const a of angriffe) {
    assert.equal(istNutzerfall(a), false, `${a.operation} ${a.key} galt als Nutzerfall`);
  }
});

test("Lesen ausserhalb der Replay-Aufnahmen ist ebenfalls kein Nutzerfall", () => {
  // Backups und Release-Artefakte gehen niemanden ausser den Betreiber etwas an.
  for (const key of [
    "deployments/control/smejj-control-stufe9.tar.gz",
    "backups/alles.tar.gz",
    "rag/projektwissen.json",
    "objects/irgendwas",
    "capsules/andere-engine/x.json",
    "capsules/maus-engine",          // ohne Schraegstrich: kein Treffer
    "xcapsules/maus-engine/x.json"   // vorangestellter Buchstabe: kein Treffer
  ]) {
    assert.equal(istNutzerfall({ operation: "download", key }), false, `${key} galt als Nutzerfall`);
  }
});

test("kaputte Eingaben gelten nie als Nutzerfall", () => {
  for (const fall of [undefined, null, {}, { operation: "download" }, { key: "capsules/maus-engine/x" },
    { operation: "DOWNLOAD", key: "capsules/maus-engine/x" }]) {
    assert.equal(istNutzerfall(fall || {}), false, `${JSON.stringify(fall)} galt als Nutzerfall`);
  }
});

test("der Nutzerfall passt zum Praefix im Gatekeeper", () => {
  // Zwei Stellen, eine Wahrheit: was hier als Nutzerfall gilt, muss der
  // Gatekeeper auch durchlassen — sonst signiert die Route etwas, das danach
  // abgewiesen wird (oder schlimmer: umgekehrt).
  const key = "capsules/maus-engine/lauf-1/schritt-3.json";
  assert.equal(istNutzerfall({ operation: "download", key }), true);
  assert.equal(normalizeObjectKey(key, { operation: "download" }), key,
    "der Gatekeeper laesst den Replay-Lesepfad nicht mehr durch — die beiden Listen sind auseinandergelaufen");
  // Und der Gatekeeper blockiert den Upload darauf weiterhin.
  assert.equal(normalizeObjectKey(key, { operation: "upload" }), null);
});

test("die Route verlangt fuer alles Uebrige ausdruecklich eine Adminrolle", () => {
  // Verhalten statt Quelltext waere schoener, braucht aber einen ganzen
  // Store-Stub. Hier genuegt der Nachweis, dass die Rollenpruefung ueberhaupt
  // verdrahtet ist — ohne sie waere der Nutzerfall-Filter wirkungslos.
  const quelle = readFileSync("control-server/src/routes/storagePresignRoutes.js", "utf8");
  assert.match(quelle, /resolveAdminActor/, "keine Rollenpruefung verdrahtet");
  assert.match(quelle, /if \(!istNutzerfall\(body\)\)/, "die Rollenpruefung haengt nicht am Nutzerfall");
  assert.match(quelle, /presign_admin_required/, "kein sprechender Fehlergrund");
});

