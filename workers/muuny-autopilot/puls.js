// muuny AI — Puls an den con.ax-Autopiloten-Bildschirm.
//
// Der Bildschirm dort hat einen Grundsatz: KEIN Zustand wird behauptet. Jeder
// Autopilot meldet seinen Lauf selbst; bleibt die Meldung aus, steht er auf
// "braucht dich" — auch wenn sein Container laeuft. Genau daran war der alte
// Autopilot-Reiter gescheitert: neun gruene Punkte aus einem Backend, das gar
// nicht mehr lief.
//
// Darum meldet muuny nach JEDEM Takt, und zwar ehrlich:
//   * Takt sauber durch          -> ok:true  mit einer Zeile, was er gerade tut
//   * Takt mit Fehler            -> ok:false mit dem Fehlertext
//   * NOTAUS oder angehalten     -> ok:false, denn dann arbeitet er nicht
//
// Der Puls ist eine Zugabe, keine Voraussetzung: faellt con.ax aus, laeuft muuny
// weiter. Deshalb wird jeder Fehler hier geschluckt und nur vermerkt.

/** Eine Zeile, die im Admin ohne Vorwissen verstaendlich ist. */
export function pulsText(z) {
  if (z?.grenzen?.notaus) return "NOTAUS aktiv — nichts wird gestartet";
  if (z?.phase === "gestoppt") return z?.plan?.grund || "angehalten";
  // Pausiert per fehlender GPU-Freigabe: das ist ein GEWOLLTER Zustand (Owner-
  // Entscheidung 21.09.2026), kein Fehler — aber er darf auch nicht so klingen, als
  // wuerde gerade trainiert. Vorher stand hier das Ziel des naechsten Plans
  // ("Training muuny-1.12 ..."), obwohl nichts davon je gestartet wird.
  if (z?.grenzen && z.grenzen.freigabe === false && !z?.laufenderJob) {
    return "pausiert — keine GPU-Freigabe, das stabile Modell bedient weiter";
  }
  if (z?.laufenderJob) {
    const j = z.laufenderJob;
    const live = j.letzterStatus;
    const fortschritt = live?.fortschritt ? `, ${live.fortschritt}` : "";
    const schritt = live?.schritt ? ` (${live.schritt}${fortschritt})` : (j.gruppe ? ` (${j.gruppe})` : "");
    return `${j.modus} ${j.kandidat || j.version}${schritt}`;
  }
  if (z?.letzterNachschub && z?.phase === "warten_auf_daten") {
    return `Daten erzeugt: ${z.letzterNachschub.name} (${z.letzterNachschub.paare} Paare)`;
  }
  return z?.plan?.job?.ziel || z?.plan?.grund || z?.phase || "beobachtet";
}

/**
 * Arbeitet der Autopilot gerade, oder haengt er?
 * "warten_auf_daten" ist KEIN Fehler mehr, seit er sich selbst Daten erzeugt —
 * wohl aber, wenn der Start blockiert ist oder er sich abgeschaltet hat.
 */
export function pulsOk(z) {
  if (z?.grenzen?.notaus) return false;
  if (z?.phase === "gestoppt") return false;
  if (z?.letzterFehler && z?.aktualisiert && z.letzterFehler.zeit === z.aktualisiert) return false;
  if (z?.startBlockiert && !nurPausiert(z)) return false;
  return true;
}

/**
 * Ist die einzige Startsperre die fehlende GPU-Freigabe?
 *
 * Dann ist er nicht kaputt, sondern pausiert — gewollt. Live am 21.09.2026: nach
 * der Owner-Entscheidung "pausiert lassen" versuchte jeder Takt weiterhin zu
 * starten, der Kostenwaechter lehnte ab ("keine_salad_freigabe"), und der Puls
 * meldete das als Fehler. Die Kachel waere dauerhaft auf "braucht dich" gegangen —
 * fuer einen Zustand, den der Betreiber selbst so eingestellt hat.
 *
 * Jeder ANDERE Sperrgrund (Budget, Deckel, Salad nicht erreichbar) bleibt rot.
 */
function nurPausiert(z) {
  const gruende = z?.startBlockiert?.gruende || [];
  return z?.grenzen?.freigabe === false && gruende.length > 0
    && gruende.every((g) => String(g).startsWith("keine_salad_freigabe"));
}

/**
 * Meldet einen Takt. Schluckt jeden Fehler.
 * @returns {{gemeldet:boolean, grund?:string}}
 */
export async function meldePuls(z, { env = process.env, fetchImpl = fetch, timeoutMs = 5000, log = () => {} } = {}) {
  const url = String(env.MUUNY_PULS_URL || "").trim();
  const token = String(env.MUUNY_PULS_TOKEN || "").trim();
  const key = String(env.MUUNY_PULS_KEY || "muuny-ai").trim();
  if (!url || !token) return { gemeldet: false, grund: "puls_nicht_konfiguriert" };
  const ok = pulsOk(z);
  try {
    const antwort = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-conax-internal": token },
      body: JSON.stringify({ key, ok, detail: pulsText(z).slice(0, 300) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!antwort.ok) return { gemeldet: false, grund: `puls_${antwort.status}` };
    return { gemeldet: true };
  } catch (fehler) {
    log("Puls nicht zugestellt:", String(fehler?.message || fehler).slice(0, 120));
    return { gemeldet: false, grund: "puls_unerreichbar" };
  }
}
