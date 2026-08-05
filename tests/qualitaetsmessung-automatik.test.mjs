// smejj.com — Tests fuer die automatische Qualitaetsmessung.
//
// Betreiber-Freigabe 2026-08-04. Die Automatik ersetzt das Einspielen von Hand,
// das dazu gefuehrt hatte, dass auf der oeffentlichen Seite fuenf Tage lang eine
// veraltete schlechte Note stand.
//
// DIE WICHTIGSTE ZUSAGE STEHT ZUERST: Ein technisch gescheiterter Lauf darf
// NIEMALS veroeffentlicht werden. Am 2026-08-04 ergab ein Lauf 0,0 %, weil der
// Endpunkt mit HTTP 401 antwortete. Waere das durchgegangen, haette die Seite
// der Welt eine Katastrophe gemeldet, die nie stattgefunden hat.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { alsVerlaufEintrag, laufIstBrauchbar } from "../scripts/verlauf/messlauf.mjs";

test("ein Transportfehler wird NIE als Note veroeffentlicht", () => {
  // Genau der Lauf vom 2026-08-04: 14 Faelle, alle http_401, Punktzahl 0.
  const derEchteFehlfall = { summary: { cases: 14, errors: 14, weightedScore: 0, passed: 0, criticalFailures: 14 } };
  const urteil = laufIstBrauchbar(derEchteFehlfall);
  assert.equal(urteil.ok, false);
  assert.match(urteil.grund, /Transportfehler/);
});

test("schon EIN fehlerhafter Fall macht den ganzen Lauf unbrauchbar", () => {
  // Sonst waere die Punktzahl ein Mischmasch aus Qualitaet und Netzbefund.
  assert.equal(laufIstBrauchbar({ summary: { cases: 14, errors: 1, weightedScore: 0.93, passed: 13 } }).ok, false);
});

test("ein echtes schlechtes Urteil darf sehr wohl durch", () => {
  // Der Schutz gilt dem TRANSPORT, nicht der Note. Eine schlechte Messung ist
  // eine Nachricht — sie zu unterdruecken waere derselbe Fehler in gruen.
  const schlecht = { summary: { cases: 14, errors: 0, weightedScore: 0.7647, passed: 11, criticalFailures: 3 } };
  assert.equal(laufIstBrauchbar(schlecht).ok, true);
});

test("unbrauchbare Berichte werden abgewiesen statt geraten", () => {
  for (const kaputt of [null, {}, { summary: null }, { summary: { cases: 0 } },
                        { summary: { cases: 14, errors: 0, weightedScore: null } },
                        { summary: { cases: 14, errors: 0, weightedScore: 1.5 } }]) {
    assert.equal(laufIstBrauchbar(kaputt).ok, false, JSON.stringify(kaputt));
  }
});

test("der Verlaufseintrag erfindet nichts und benennt die wackeligen Faelle", () => {
  const bericht = {
    run: { startedAt: "2026-08-05T01:09:23.275Z" },
    verdict: "passed",
    summary: {
      cases: 14, weightedScore: 0.9804, passed: 13, failed: 0, errors: 0,
      criticalFailures: 0, wackelig: 1, wiederholungen: 3,
      latencyMsP95: 20059, latencyMsMedian: 683
    },
    cases: [
      { caseId: "naming-schreibweise", wackelig: false, laeufe: 3, bestanden: 3 },
      { caseId: "halluzination-unbekannte-zahl", wackelig: true, laeufe: 3, bestanden: 1 }
    ]
  };
  const eintrag = alsVerlaufEintrag(bericht);
  assert.equal(eintrag.zeitpunkt, "2026-08-05T01:09:23.275Z");
  assert.equal(eintrag.punktzahl, 0.9804);
  assert.equal(eintrag.kritischeFehler, 0);
  assert.equal(eintrag.urteil, "passed");
  assert.deepEqual(eintrag.wackeligeFaelle, [{ fall: "halluzination-unbekannte-zahl", laeufe: 3, bestanden: 1 }]);
  assert.equal(eintrag.abgelegt, false);
});

// Ohne diese Zeile im Service Worker waere die ganze Automatik wirkungslos:
// die Datei laege cache-first, und wiederkehrende Nutzer saehen ewig den alten
// Stand — ohne dass es jemand merkt.
test("die Messdaten kommen netz-zuerst, nicht aus dem Cache", async () => {
  const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /LIVE_DATEN_PFADE = new Set\(\["\/verlauf-messwerte\.json"\]\)/);
  // Die Netz-zuerst-Weiche muss VOR der cache-first-Weiche stehen, sonst greift
  // sie nie.
  assert.ok(sw.indexOf("LIVE_DATEN_PFADE.has(url.pathname)") < sw.indexOf("PRECACHE_PATHS.has(url.pathname)"),
    "die Live-Daten-Weiche muss vor der Precache-Weiche stehen");
  // Und die Datei bleibt im Precache, damit sie offline ueberhaupt vorliegt.
  assert.match(sw, /"\/verlauf-messwerte\.json"/);
});

test("der Zeitplan nimmt nur die eine Datei mit, nie den ganzen Baum", async () => {
  const skript = await readFile(new URL("../scripts/verlauf/messlauf-taeglich.sh", import.meta.url), "utf8");
  // Nur der ausfuehrbare Teil zaehlt: der Kopf des Skripts WARNT ausdruecklich
  // vor `git add -A` — dieser Hinweis darf den Test nicht ausloesen.
  const befehle = skript.split("\n").filter((zeile) => !zeile.trim().startsWith("#")).join("\n");
  assert.ok(!/git add -A|git add \./.test(befehle),
    "an diesem Arbeitsplatz laufen Sitzungen parallel — nie den ganzen Baum aufnehmen");
  assert.match(skript, /git add -- "\$DATEI"/);
  assert.match(skript, /git diff --quiet -- "\$DATEI"/, "ohne Aenderung wird nichts committet");
  assert.match(skript, /set -u/);
});
