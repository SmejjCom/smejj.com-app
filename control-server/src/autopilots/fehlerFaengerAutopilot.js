// smejj.com — Fehler-Fänger (Autopilot Nr. 50): sammelt die JavaScript-Fehler
// ECHTER Nutzer-Browser ein und gruppiert sie zu Befunden.
//
// WARUM ES IHN GIBT: Der unsichtbare Senden-Pfeil, das nie geladene Modul,
// die tote Stopp-Taste — alles stand live, alle Server-Ampeln grün, denn der
// Fehler passierte im Browser des Nutzers, wo kein Wächter hinsah. Jeder
// dieser Fälle hätte hier binnen Minuten eine Zahl gehabt.
//
// Der Weg: Die Seite meldet window.onerror/unhandledrejection per
// POST /api/fehler (Route: fehlerRoutes.js). Hier wohnen Ringpuffer,
// PII-Maskierung, Gruppierung und der Ampellauf. EHRLICH: Solange der
// Client-Haken nicht ausgeliefert ist, sagt die Meldung das ausdrücklich —
// "keine Fehler" und "niemand kann melden" sind zwei verschiedene Sätze.
import { scrubPiiData } from "./userFeedbackFlywheelAutopilot.js";

const RING_MAX = 500;
const ring = [];
let angenommen = 0;
let abgewiesen = 0;
let clientVerdrahtet = false;

/** Der Client-Haken meldet sich beim Start der Seite einmal an (POST /api/fehler {art:"start"}). */
export function markiereClientVerdrahtet() { clientVerdrahtet = true; }

/**
 * Nimmt eine Fehlermeldung aus dem Browser an. Wird von der Route gerufen.
 * Maskiert PII VOR dem Speichern — dieselbe Regel wie beim Daten-Schwungrad.
 */
export function nimmFehlerAn({ nachricht, quelle, zeile, stapel, seite, agent } = {}, { jetztMs = Date.now() } = {}) {
  const text = String(nachricht || "").slice(0, 300);
  if (!text.trim()) { abgewiesen += 1; return { ok: false, grund: "leere Meldung" }; }
  ring.push({
    am: jetztMs,
    nachricht: scrubPiiData(text),
    quelle: scrubPiiData(String(quelle || "").slice(0, 200)),
    zeile: Number.isFinite(Number(zeile)) ? Number(zeile) : null,
    stapel: scrubPiiData(String(stapel || "").slice(0, 500)),
    seite: String(seite || "").slice(0, 120),
    agent: String(agent || "").slice(0, 80)
  });
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  angenommen += 1;
  return { ok: true };
}

/**
 * Gruppiert Fehler zu Befunden: gleiche Nachricht + Quelle = ein Befund mit
 * Zähler. Getrennt testbar (kaputt + gesund).
 */
export function gruppiereFehler(eintraege = []) {
  const gruppen = new Map();
  for (const e of eintraege) {
    // Zahlen raus aus der Signatur: "Zeile 4711" und "Zeile 4712" sind
    // derselbe Fehler nach einem neuen Bündel, keine zwei Befunde.
    const signatur = `${String(e.nachricht || "").replace(/\d+/g, "#")}|${String(e.quelle || "").replace(/\?v=[\w-]+/g, "")}`;
    const gruppe = gruppen.get(signatur) || { nachricht: e.nachricht, quelle: e.quelle, anzahl: 0, seiten: new Set() };
    gruppe.anzahl += 1;
    if (e.seite) gruppe.seiten.add(e.seite);
    gruppen.set(signatur, gruppe);
  }
  return [...gruppen.values()]
    .map((g) => ({ nachricht: g.nachricht, quelle: g.quelle, anzahl: g.anzahl, seiten: [...g.seiten] }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

/** Selbsttest: Gruppierung und PII-Maskierung müssen beide tragen. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const gruppen = gruppiereFehler([
    { nachricht: "TypeError: x is undefined at line 12", quelle: "app.js?v=1" },
    { nachricht: "TypeError: x is undefined at line 99", quelle: "app.js?v=2" },
    { nachricht: "ReferenceError: y is not defined", quelle: "chat.js" }
  ]);
  if (gruppen.length !== 2) fehler.push(`Gruppierung: ${gruppen.length} statt 2 Befunde (gleiche Fehler müssen zusammenfallen)`);
  if (gruppen[0]?.anzahl !== 2) fehler.push("der häufigste Befund muss 2 Vorkommen zählen");
  const probe = nimmFehlerAn({ nachricht: "Fehler bei mail an alan.best@example.com", seite: "/" }, { jetztMs: 0 });
  const letzter = ring[ring.length - 1];
  if (!probe.ok || letzter.nachricht.includes("alan.best@example.com")) {
    fehler.push("PII-Maskierung greift nicht — Mailadresse überlebt die Annahme");
  }
  ring.pop(); // die Probe gehört nicht in den echten Bestand
  angenommen -= 1;
  const leer = nimmFehlerAn({ nachricht: "   " });
  if (leer.ok) fehler.push("leere Meldung wird fälschlich angenommen");
  else abgewiesen -= 1; // die Probe zählt nicht als echte Abweisung
  return { bestanden: fehler.length === 0, fehler };
}

/** Nur für Tests. */
export function _fehlerFaengerZuruecksetzen() {
  ring.length = 0;
  angenommen = 0;
  abgewiesen = 0;
  clientVerdrahtet = false;
}

/**
 * Der Lauf im Takt: Selbsttest, dann der echte Bestand. Browserfehler machen
 * die Ampel ROT ab 3 Vorkommen desselben Befunds — einmal kann ein
 * Browser-Zufall sein, dreimal ist ein Muster.
 */
export function laufFehlerFaenger({ jetztMs = Date.now(), fensterMs = 24 * 60 * 60 * 1000 } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Fehler-Fänger besteht den Selbsttest nicht: ${probe.fehler.join("; ")}` };
  }
  const frisch = ring.filter((e) => jetztMs - e.am < fensterMs);
  const gruppen = gruppiereFehler(frisch);
  const muster = gruppen.filter((g) => g.anzahl >= 3);
  if (muster.length) {
    const top = muster[0];
    return {
      ok: false,
      meldung: `${muster.length} wiederkehrende(r) Browserfehler in 24 h — häufigster: "${String(top.nachricht).slice(0, 60)}" (${top.anzahl}x, ${top.quelle || "ohne Quelle"})`
    };
  }
  if (!clientVerdrahtet && angenommen === 0) {
    return {
      ok: true,
      meldung: "Selbsttest 3/3; Annahme bereit — aber noch KEIN Client hat sich gemeldet: der Browser-Haken ist noch nicht ausgeliefert (offener Punkt, steht in der Tagesmappe)"
    };
  }
  return {
    ok: true,
    meldung: `Selbsttest 3/3; ${frisch.length} Browserfehler in 24 h, ${gruppen.length} Befund(e), kein wiederkehrendes Muster (${angenommen} angenommen / ${abgewiesen} abgewiesen seit Start)`
  };
}
