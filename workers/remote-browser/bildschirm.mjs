// smejj.com — ein virtueller Bildschirm fuer den Fern-Browser.
//
// WARUM DAS HIER LIEGT UND NICHT IM CMD (teuer gelernt am 2026-08-20):
// Der erste Versuch startete den Worker mit `xvfb-run` als Wrapper im
// Dockerfile-CMD. Der Wrapper kam nicht hoch, und damit war der GANZE Dienst
// tot — live 502, der Browser fuer den Betreiber unbenutzbar. Ein Notausgang
// im Code kann das nicht auffangen: der Prozess laeuft ja nie.
//
// Deshalb: Der Bildschirm wird IM laufenden Worker gestartet. Klappt es
// nicht, laeuft der Browser eben headless weiter — schlechter getarnt, aber
// erreichbar. Verfuegbarkeit schlaegt Tarnung.
//
// WOFUER ueberhaupt: Google blockiert Anmeldungen aus automatisierten
// Browsern (Richtlinie seit Januar 2021), und headless ist das lauteste
// Signal. Mit echtem Fensterbaum sieht der Browser normal aus.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Bildschirmnummer bewusst hoch und fest: :99 ist die uebliche Wahl fuer
// Xvfb in Containern und kollidiert dort mit nichts.
const NUMMER = Number(process.env.SMEJJ_BROWSER_DISPLAY || 99);
const BREITE = 1365;
const HOEHE = 900;
const START_TIMEOUT_MS = 8000;

let gestartet = null; // { display, prozess } | null

/** Liegt Xvfb ueberhaupt im Abbild? (Playwright-Images bringen es mit.) */
export function xvfbVerfuegbar(pruefe = existsSync) {
  return ["/usr/bin/Xvfb", "/usr/local/bin/Xvfb"].some((pfad) => pruefe(pfad));
}

/**
 * Startet den Bildschirm EINMAL und merkt ihn sich.
 *
 * @returns {Promise<string|null>} DISPLAY-Wert (":99") oder null, wenn kein
 *   Bildschirm zustande kam. null ist ein gueltiges Ergebnis, kein Fehler —
 *   der Aufrufer faellt dann auf headless zurueck.
 */
export async function starteBildschirm({ spawnImpl = spawn, pruefe = existsSync, timeoutMs = START_TIMEOUT_MS } = {}) {
  if (gestartet) return gestartet.display;
  if (!xvfbVerfuegbar(pruefe)) return null;

  const display = `:${NUMMER}`;
  let prozess;
  try {
    prozess = spawnImpl("Xvfb", [display, "-screen", "0", `${BREITE}x${HOEHE}x24`, "-nolisten", "tcp"], {
      stdio: ["ignore", "ignore", "pipe"],
      detached: false
    });
  } catch {
    return null;
  }

  // Der Prozess darf den Worker nicht am Beenden hindern.
  prozess.unref?.();

  // Startet er ueberhaupt? Xvfb meldet Erfolg nicht — aber einen Fehlstart
  // schon (Port belegt, fehlende Bibliothek). Deshalb: kurz warten und
  // schauen, ob er noch lebt.
  const gescheitert = await new Promise((fertig) => {
    const timer = setTimeout(() => fertig(false), Math.min(timeoutMs, 2500));
    prozess.once("error", () => { clearTimeout(timer); fertig(true); });
    prozess.once("exit", () => { clearTimeout(timer); fertig(true); });
  });
  if (gescheitert) return null;

  gestartet = { display, prozess };
  process.env.DISPLAY = display;
  return display;
}

/** Nur fuer Tests: den gemerkten Zustand zuruecksetzen. */
export function vergissBildschirm() {
  gestartet = null;
}
