// Waechter fuer den Nachlader der Code-Flaeche.
//
// Nachladen hat genau eine gefaehrliche Fehlerart: das Modul kommt NIE, und ein
// nicht geladenes Modul ist von einem funktionslosen Knopf nicht zu
// unterscheiden (Memory "Modul laedt nie, kein Test merkt es" — dort waren 127
// gruene Tests blind, weil alle nur den Quelltext lasen). Diese Tests loesen
// deshalb den echten Weg aus: Klassenwechsel rein, Ladevorgang raus.
import test from "node:test";
import assert from "node:assert/strict";

// --- Kleinstes Dokument, das der Nachlader braucht ---------------------------
class FakeKlassen {
  constructor() { this.werte = new Set(); }
  contains(n) { return this.werte.has(n); }
  add(n) { this.werte.add(n); this.melde(); }
  remove(n) { this.werte.delete(n); this.melde(); }
  melde() { for (const b of this.beobachter || []) b(); }
}
function fakeDokument({ mitCode = true, aktiv = false } = {}) {
  const classList = new FakeKlassen();
  classList.beobachter = [];
  if (aktiv) classList.werte.add("is-active");
  const bereich = { classList };
  return { getElementById: (id) => (id === "code" && mitCode ? bereich : null), _bereich: bereich };
}
function mitFakeObserver(lauf) {
  const echt = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(rueckruf) { this.rueckruf = rueckruf; }
    observe(ziel) { ziel.classList.beobachter.push(() => this.rueckruf()); this.ziel = ziel; }
    disconnect() { this.abgemeldet = true; if (this.ziel) this.ziel.classList.beobachter = []; }
  };
  try { return lauf(); } finally { globalThis.MutationObserver = echt; }
}

const { codeIstOffen, haengeCodeNachladerEin } = await import("../public/code-nachladen.js");

test("direkter Aufruf von /code laedt SOFORT", async () => {
  let geladen = 0;
  const art = haengeCodeNachladerEin(fakeDokument(), { pathname: "/code" }, async () => { geladen += 1; });
  assert.equal(art, "sofort");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(geladen, 1, "wer /code direkt aufruft, wartet sonst auf ein Ereignis, das nie kommt");
});

test("ist der Bereich schon offen, wird ebenfalls sofort geladen", async () => {
  let geladen = 0;
  const art = haengeCodeNachladerEin(fakeDokument({ aktiv: true }), { pathname: "/" }, async () => { geladen += 1; });
  assert.equal(art, "sofort");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(geladen, 1);
});

test("auf der Startseite wird NICHT geladen — erst beim Wechsel", async () => {
  await mitFakeObserver(async () => {
    let geladen = 0;
    const dok = fakeDokument();
    const art = haengeCodeNachladerEin(dok, { pathname: "/" }, async () => { geladen += 1; });
    assert.equal(art, "beobachtet");
    assert.equal(geladen, 0, "genau darum geht die ganze Uebung — die Startseite zahlt nicht mehr");

    // Der Router macht den Bereich sichtbar:
    dok._bereich.classList.add("is-active");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geladen, 1, "jetzt MUSS es kommen, sonst bleibt der Bereich leer");
  });
});

test("ein Klassenwechsel, der NICHT is-active setzt, loest nichts aus", async () => {
  await mitFakeObserver(async () => {
    let geladen = 0;
    const dok = fakeDokument();
    haengeCodeNachladerEin(dok, { pathname: "/" }, async () => { geladen += 1; });
    dok._bereich.classList.add("irgendwas-anderes");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geladen, 0);
  });
});

test("mehrfaches Hin und Her laedt genau EINMAL", async () => {
  await mitFakeObserver(async () => {
    let geladen = 0;
    const dok = fakeDokument();
    haengeCodeNachladerEin(dok, { pathname: "/" }, async () => { geladen += 1; });
    dok._bereich.classList.add("is-active");
    await new Promise((r) => setTimeout(r, 0));
    dok._bereich.classList.remove("is-active");
    dok._bereich.classList.add("is-active");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geladen, 1, "nach Erfolg meldet sich der Beobachter ab");
  });
});

test("nach einem Fehlschlag wird beim naechsten Wechsel ERNEUT versucht", async () => {
  // Sonst waere der Code-Bereich nach einem einzigen Netzfehler dauerhaft tot —
  // und zwar still.
  await mitFakeObserver(async () => {
    let versuche = 0;
    const dok = fakeDokument();
    haengeCodeNachladerEin(dok, { pathname: "/" }, async () => {
      versuche += 1;
      if (versuche === 1) throw new Error("Netz weg");
    });
    dok._bereich.classList.add("is-active");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(versuche, 1);

    dok._bereich.classList.remove("is-active");
    dok._bereich.classList.add("is-active");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(versuche, 2, "der Beobachter darf sich nach einem Fehlschlag NICHT abgemeldet haben");
  });
});

test("fehlt der Bereich, passiert nichts Schlimmes", () => {
  assert.equal(haengeCodeNachladerEin(fakeDokument({ mitCode: false }), { pathname: "/" }, async () => {}), "kein-ziel");
});

test("codeIstOffen erkennt beide Wege", () => {
  assert.equal(codeIstOffen(fakeDokument(), { pathname: "/code" }), true);
  assert.equal(codeIstOffen(fakeDokument({ aktiv: true }), { pathname: "/" }), true);
  assert.equal(codeIstOffen(fakeDokument(), { pathname: "/" }), false);
  assert.equal(codeIstOffen(fakeDokument({ mitCode: false }), { pathname: "/" }), false);
});
