// smejj.com — jeder Knopf, der ein Modul braucht, muss es auch ausloesen.
//
// DER FALL, der diese Probe ausgeloest hat (live gemessen 2026-09-10):
// Die Sprachwelle baut sich einen eigenen Kamera-Knopf mit
// data-kamera-start="kamera" (voice-overlay-ui.js). bedarf-nachladen.js kannte
// als Ausloeser fuer kamera.js aber nur "#composerPlusButton" und
// "[data-start-tool]" — das Plus-Menue der Startseite. Ein Klick auf den
// Kamera-Knopf im Sprachmodus lud kamera.js nie, rief nie getUserMedia und
// oeffnete kein Overlay.
//
// WARUM ES NIEMANDEM AUFFIEL: Eine Attrappe tut nichts. "Nichts passiert" sieht
// aus wie "die Kamera darf nicht" oder "das Geraet hat keine". Gefunden wurde es
// erst, als GEMESSEN wurde, ob das Modul ueberhaupt im Netzwerk auftaucht
// (performance.getEntriesByType) — nicht durch Hinsehen.
//
// Die Probe prueft die Gegenrichtung: fuer jedes Merkmal, das einen Knopf
// kennzeichnet, muss ein Nachlader zustaendig sein.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const nachlader = lies("public/bedarf-nachladen.js");

/**
 * Alle Auswahlketten, die bedarf-nachladen.js als Ausloeser kennt.
 *
 * Zwei Muster, nicht eines: eine Auswahlkette in einfachen Anfuehrungszeichen
 * darf selbst doppelte enthalten ('[data-view="papierkorb"]') und umgekehrt.
 * Ein gemeinsames ["'] bricht genau an dieser Stelle ab und liefert Bruchstuecke
 * wie '[data-view=' — beim ersten Lauf dieser Probe genau so passiert.
 */
export function ausloeserAus(quelle) {
  return [...quelle.matchAll(/ladeBeiKlick\(\[([\s\S]*?)\]\s*,/g)]
    .flatMap((t) => [
      ...[...t[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
      ...[...t[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    ]);
}

test("der Kamera-Knopf der Sprachwelle loest das Kamera-Modul aus", () => {
  const ausloeser = ausloeserAus(nachlader);
  assert.ok(ausloeser.includes("[data-kamera-start]"),
    `data-kamera-start fehlt in den Ausloesern: ${ausloeser.join(", ")}`);
  // Und der Knopf muss es wirklich tragen — sonst schuetzt die Regel nichts.
  assert.match(lies("public/voice-overlay-ui.js"), /data-kamera-start="kamera"/);
});

test("kein data-kamera-start bleibt ohne Nachlader", () => {
  // Beide Quellen: das Markup der Startseite und die Module, die Knoepfe bauen.
  const dateien = readdirSync(new URL("../public", import.meta.url))
    .filter((n) => n.endsWith(".js")).map((n) => `public/${n}`);
  const traeger = ["public/index.html", ...dateien]
    .filter((p) => !p.endsWith("bedarf-nachladen.js") && /data-kamera-start/.test(lies(p)));
  assert.ok(traeger.length > 0, "Testgrundlage fehlt — niemand traegt das Merkmal");
  assert.ok(ausloeserAus(nachlader).includes("[data-kamera-start]"),
    `${traeger.join(", ")} tragen data-kamera-start, aber kein Nachlader hoert darauf`);
});

test("TUEV: eine lueckenhafte Ausloeser-Liste faellt auf", () => {
  // Ein Waechter, der nie ausschlaegt, schuetzt nichts. Das ist die Liste von
  // VOR der Reparatur — sie muss durchfallen.
  const alt = 'ladeBeiKlick(["#composerPlusButton", "[data-start-tool]"], () => import("./kamera.js"));';
  assert.equal(ausloeserAus(alt).includes("[data-kamera-start]"), false,
    "die alte, luecken hafte Liste muss als luecken haft erkannt werden");
  // Gegenprobe: die reparierte Liste besteht.
  const neu = 'ladeBeiKlick(["#composerPlusButton", "[data-start-tool]", "[data-kamera-start]"], () => import("./kamera.js"));';
  assert.equal(ausloeserAus(neu).includes("[data-kamera-start]"), true);
});
