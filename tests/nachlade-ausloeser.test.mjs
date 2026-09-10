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

test("ein Knopf, den es beim Start noch NICHT gab, loest trotzdem aus", async () => {
  // Das ist der Kern des Falls: voice-overlay-ui.js baut den Kamera-Knopf erst
  // beim Oeffnen des Sprachmodus. Ein Nachlader, der beim Start einmal
  // querySelectorAll laeuft und an die gefundenen Knoepfe bindet, sieht ihn nie.
  const zuhoerer = new Map();
  const dok = {
    addEventListener: (typ, fn) => zuhoerer.set(typ, fn),
    removeEventListener: () => zuhoerer.clear(),
    querySelectorAll: () => { throw new Error("darf nicht mehr beim Start abfragen"); }
  };
  const echtesDokument = globalThis.document;
  const echtesMouseEvent = globalThis.MouseEvent;
  const echtesFenster = globalThis.window;
  globalThis.document = dok;
  globalThis.MouseEvent = class { constructor(typ) { this.type = typ; } };
  // Der Wiederholungsklick baut ein MouseEvent mit `view: window`. Ohne ein
  // window wirft das in Node einen ReferenceError, der im .catch des Nachladers
  // landet — der Klick bleibt aus, und es sieht nach einem Fehler im Code aus.
  globalThis.window = globalThis.window || {};
  try {
    const { ladeBeiKlick } = await import(`../public/nachladen.js?fall=${Math.random()}`);
    let geladen = 0;
    ladeBeiKlick(["[data-kamera-start]"], async () => { geladen += 1; });
    // Der Knopf entsteht ERST JETZT — nach der Anmeldung des Nachladers.
    let wiederholt = 0;
    const spaeterKnopf = {
      closest: (auswahl) => (auswahl.includes("[data-kamera-start]") ? spaeterKnopf : null),
      dispatchEvent: () => { wiederholt += 1; return true; }
    };
    const klick = zuhoerer.get("click");
    assert.ok(klick, "kein Zuhoerer am Dokument — die Delegation fehlt");
    klick({ target: spaeterKnopf, preventDefault() {}, stopPropagation() {} });
    // hole() haengt das Laden an eine Promise-Kette; der Wiederholungsklick
    // kommt erst danach. Ein einzelnes setTimeout(0) trifft das nicht
    // zuverlaessig — beim ersten Lauf dieser Probe fehlte genau deshalb der
    // Klick, und es sah nach einem Fehler im Code aus.
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    assert.equal(geladen, 1, "das Modul wurde nicht geladen");
    assert.equal(wiederholt, 1, "der angehaltene Klick wurde nicht wiederholt");
  } finally {
    globalThis.document = echtesDokument;
    globalThis.MouseEvent = echtesMouseEvent;
    globalThis.window = echtesFenster;
  }
});

test("ein fremder Klick loest NICHT aus", async () => {
  // Gegenprobe: Delegation darf nicht jeden Klick der Seite zum Nachladen machen.
  const zuhoerer = new Map();
  const echtesDokument = globalThis.document;
  globalThis.document = { addEventListener: (t, f) => zuhoerer.set(t, f), removeEventListener: () => {} };
  try {
    const { ladeBeiKlick } = await import(`../public/nachladen.js?fall=${Math.random()}`);
    let geladen = 0;
    ladeBeiKlick(["[data-kamera-start]"], async () => { geladen += 1; });
    zuhoerer.get("click")({ target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geladen, 0, "ein Klick woanders darf nichts nachladen");
  } finally { globalThis.document = echtesDokument; }
});
