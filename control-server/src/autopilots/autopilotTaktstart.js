// smejj.com — der Taktstart des Autopilot-Läufers, ausgelagert aus
// autopilotLaeufer.js (die 800-Zeilen-Regel; der Taktgeber selbst wohnt
// weiter dort). Hier steht nur: WANN gelaufen wird.
import { laufeAlle, heileWasRotIst } from "./autopilotLaeufer.js";

/**
 * Den Läufer im Takt starten. Standard: alle 30 Minuten — oft genug, damit
 * ein Ausfall binnen einer Stunde auffällt, selten genug, dass der Scan
 * (einige hundert Dateien) den Server nicht beschäftigt.
 * `unref()` hält den Prozess nicht wach.
 */
export function starteAutopilotLaeufer({ intervallMs = 30 * 60 * 1000, sendeAlarm = null } = {}) {
  const tick = () => {
    // Erst arbeiten, dann nachsehen, ob etwas liegen geblieben ist. Die
    // Reihenfolge ist Absicht: Der Heiler soll die FRISCHEN Ergebnisse
    // bewerten, nicht die von vor 30 Minuten.
    laufeAlle()
      .then(() => heileWasRotIst({ sendeAlarm, log: console.log }))
      .catch(() => {});
  };
  // ZWEI Anlauf-Stufen statt einer, damit die Ampel nach einem Deploy nicht
  // minutenlang grau steht:
  //   Stufe 1 (Boot+20 s, OHNE Netz): füllt die Ampel aus Dateiscans und
  //     Ablage-Ständen — reine CPU-Arbeit von wenigen Sekunden. Nicht bei
  //     Sekunde 0, damit die Startsonde zuerst durchkommt (502-Vorfall
  //     2026-08-13: ein Container, der sofort 265 Dateien scannt, kann seine
  //     eigene Startsonde verpassen und wird im Kreis neu gestartet).
  //   Stufe 2 (Boot+90 s, MIT Netz + Heiler): der volle Durchgang wie bisher.
  const anlauf = setTimeout(() => { laufeAlle({ mitNetz: false }).catch(() => {}); }, 20_000);
  if (typeof anlauf.unref === "function") anlauf.unref();
  const vollAnlauf = setTimeout(tick, 90_000);
  if (typeof vollAnlauf.unref === "function") vollAnlauf.unref();
  const zeitgeber = setInterval(tick, intervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}
