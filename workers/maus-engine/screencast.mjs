// smejj.com Maus-Engine — Live-Bild (Weg A: Film statt Diashow).
//
// Single Responsibility: Chrome filmt sich selbst und liefert JPEG-Einzelbilder;
// dieses Modul drosselt sie auf eine Bildrate und reicht sie an einen
// Veroeffentlicher weiter. Es kennt weder IDrive e2 noch Playwright — die
// CDP-Sitzung und der Veroeffentlicher werden hineingereicht (testbar ohne
// Browser).
//
// Warum CDP-Screencast und nicht wiederholte page.screenshot():
// `Page.startScreencast` liefert der Browser von sich aus, sobald sich etwas
// aendert — ohne die Seite anzuhalten. Wiederholte Screenshots blockieren
// dagegen den Renderer und wuerden den Lauf verlangsamen. Die Anzeige darf den
// Lauf nie ausbremsen.
//
// KOSTENREGEL (bewusst niedrig): Standard sind 2 Bilder/Sekunde bei JPEG-Guete
// 50 und maximal 1280x800. Das ist ein Bruchteil eines Videostroms und passt zu
// 2 vCPU / 8 GB. Wer mehr will, setzt SMEJJ_MAUS_LIVE_FPS — die Obergrenze
// liegt hart bei 10, damit ein Tippfehler keine Kostenlawine ausloest.
//
// FAIL-SAFE (verbindlich, wie live-publisher.mjs): Kein Fehler dieses Moduls
// darf den Lauf abbrechen oder verlangsamen. Alles in try/catch, im Zweifel
// still aussteigen. Der Lauf ist die Wahrheit, das Bild ist Beiwerk.

const FRAME_EVENT = "Page.screencastFrame";
const DEFAULT_FPS = 2;
const MAX_FPS = 10;
const DEFAULT_QUALITY = 50;
const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_MAX_HEIGHT = 800;

// Bildrate aus der Umgebung, hart gedeckelt und fail-closed: alles
// Unbrauchbare (leer, Text, negativ) schaltet die Funktion AUS statt zu raten.
export function resolveLiveFps(env = process.env) {
  const raw = String(env.SMEJJ_MAUS_LIVE_FPS ?? "").trim();
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), MAX_FPS);
}

/**
 * @param {object} optionen
 * @param {number} optionen.fps          Bilder pro Sekunde (0 = aus).
 * @param {(bild: Buffer) => Promise<unknown>} optionen.publish  Veroeffentlicher.
 * @param {{now: () => number}} [optionen.clock]  Fuer Tests injizierbar.
 */
export function createScreencast({
  fps = DEFAULT_FPS,
  publish,
  clock = Date,
  quality = DEFAULT_QUALITY,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT
} = {}) {
  const aktiveFps = Math.min(Math.max(Math.round(fps) || 0, 0), MAX_FPS);
  const minAbstandMs = aktiveFps > 0 ? Math.floor(1000 / aktiveFps) : 0;
  const stats = { empfangen: 0, veroeffentlicht: 0, verworfen: 0, fehler: 0 };

  let session = null;
  let handler = null;
  let letztesBildAt = 0;
  let laeuft = false;

  // WICHTIG: Jedes Einzelbild MUSS bestaetigt werden (screencastFrameAck),
  // auch ein verworfenes. Ohne Bestaetigung stellt Chrome den Strom nach
  // wenigen Bildern ein — das ist die klassische Falle bei CDP-Screencast.
  async function bestaetigen(sessionId) {
    if (sessionId === undefined || sessionId === null) return;
    try {
      await session.send("Page.screencastFrameAck", { sessionId });
    } catch {
      // Seite kann inzwischen geschlossen sein — nie eskalieren.
    }
  }

  async function aufBild(frame) {
    stats.empfangen += 1;
    await bestaetigen(frame?.sessionId);
    const jetzt = clock.now();
    if (letztesBildAt && jetzt - letztesBildAt < minAbstandMs) {
      stats.verworfen += 1;
      return;
    }
    letztesBildAt = jetzt;
    try {
      await publish(Buffer.from(String(frame?.data || ""), "base64"));
      stats.veroeffentlicht += 1;
    } catch {
      stats.fehler += 1;
    }
  }

  return {
    stats,
    get aktiv() { return laeuft; },

    // Wird aufgerufen, sobald eine Seite existiert (nach openBrowser/navigate).
    async start(cdpSession) {
      if (aktiveFps === 0 || laeuft || !cdpSession || typeof publish !== "function") return false;
      session = cdpSession;
      handler = (frame) => { void aufBild(frame); };
      try {
        session.on(FRAME_EVENT, handler);
        await session.send("Page.startScreencast", {
          format: "jpeg",
          quality,
          maxWidth,
          maxHeight,
          everyNthFrame: 1
        });
        laeuft = true;
        return true;
      } catch {
        try { session.off?.(FRAME_EVENT, handler); } catch { /* egal */ }
        session = null;
        handler = null;
        return false;
      }
    },

    async stop() {
      if (!laeuft || !session) return false;
      laeuft = false;
      try { await session.send("Page.stopScreencast"); } catch { /* Seite ggf. zu */ }
      try { session.off?.(FRAME_EVENT, handler); } catch { /* egal */ }
      session = null;
      handler = null;
      return true;
    }
  };
}
