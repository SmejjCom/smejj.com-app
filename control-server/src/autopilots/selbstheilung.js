// smejj.com — Selbstheilung mit Bremse: was rot wird, wird automatisch
// wiederbelebt — aber nicht endlos.
//
// WARUM (Betreiber-Frage 2026-08-13: "wenn einer ausgeht, soll er sich
// automatisch wieder starten — wie machen das die Grossen?"):
// Bis heute passierte bei Rot genau eines — eine Mail. Niemand VERSUCHTE
// etwas. Die vier Ebenen, die grosse Systeme dafuer stapeln:
//
//   1. Prozess stuerzt ab      -> Container-Neustart (Zeabur, HEALTHCHECK)
//   2. Einzelner Lauf faellt   -> naechster Takt versucht es erneut
//   3. Ausbleiben ist Alarm    -> Ampel wird rot (Totmannschalter)
//   4. Wiederbelebung MIT BREMSE -> diese Datei
//
// Die Bremse ist der eigentliche Fachanteil. Ein Heiler ohne Bremse ist
// gefaehrlicher als keiner: Er haemmert im Sekundentakt gegen einen Dienst,
// der ohnehin am Boden liegt, verbrennt Kontingent und verdeckt die wahre
// Ursache. Deshalb: hoechstens VERSUCHE_MAX Versuche mit wachsendem
// Abstand, danach Eskalation an den Menschen und Ruhe. Der Zaehler faellt
// erst zurueck, wenn der Autopilot WIRKLICH wieder gruen ist — nicht, wenn
// ein Versuch gestartet wurde.

export const VERSUCHE_MAX = 3;
// Wachsender Abstand: sofort, nach 5 Minuten, nach 15 Minuten. Wer beim
// dritten Mal nicht wieder da ist, kommt auch beim vierten nicht zurueck —
// dann ist ein Mensch dran.
export const ABSTAENDE_MS = Object.freeze([0, 5 * 60 * 1000, 15 * 60 * 1000]);

/**
 * Entscheidet je Autopilot, was zu tun ist. REINE Funktion: kein Netz, keine
 * Uhr, kein Zustand ausserhalb des uebergebenen `zustand` — damit die Bremse
 * pruefbar ist, ohne 20 Minuten zu warten.
 *
 * @param {object} p
 * @param {Array} p.autopiloten Liste aus autopilotUebersicht().
 * @param {Map<string, {versuche: number, letzterMs: number, eskaliert: boolean}>} p.zustand
 * @param {number} p.jetztMs
 * @returns {{heilen: Array<{id: string, versuch: number}>, eskalieren: Array<{id: string, name: string, grund: string}>, warten: Array<{id: string, nochMs: number}>}}
 */
export function planeHeilung({ autopiloten = [], zustand = new Map(), jetztMs = Date.now() } = {}) {
  const heilen = [];
  const eskalieren = [];
  const warten = [];

  for (const a of autopiloten) {
    const eintrag = zustand.get(a.id);

    // Wieder gruen? Dann ist die Sache erledigt — Zaehler zurueck auf null.
    // WICHTIG: erst hier, nicht schon beim Startversuch. Sonst zaehlt ein
    // Heiler, der nichts bewirkt, ewig von vorn und die Bremse greift nie.
    if (a.ampel !== "rot") {
      if (eintrag) zustand.delete(a.id);
      continue;
    }

    // Wartung heisst: bewusst stillgelegt. Da wird nichts wiederbelebt.
    if (a.wartung) continue;

    const stand = eintrag || { versuche: 0, letzterMs: 0, eskaliert: false };
    if (stand.eskaliert) continue; // Mensch ist informiert, Ruhe bewahren.

    if (stand.versuche >= VERSUCHE_MAX) {
      stand.eskaliert = true;
      zustand.set(a.id, stand);
      eskalieren.push({
        id: a.id,
        name: a.name || a.id,
        grund: `${VERSUCHE_MAX} Wiederbelebungsversuche ohne Erfolg. Letzter Befund: ${String(a.ampelGrund || "ohne Grund").slice(0, 160)}`
      });
      continue;
    }

    const abstand = ABSTAENDE_MS[stand.versuche] ?? ABSTAENDE_MS[ABSTAENDE_MS.length - 1];
    const faelligAb = stand.letzterMs + abstand;
    if (stand.letzterMs && jetztMs < faelligAb) {
      warten.push({ id: a.id, nochMs: faelligAb - jetztMs });
      continue;
    }

    stand.versuche += 1;
    stand.letzterMs = jetztMs;
    zustand.set(a.id, stand);
    heilen.push({ id: a.id, versuch: stand.versuche });
  }

  return { heilen, eskalieren, warten };
}

/**
 * Führt den Plan aus. `heiler` ist eine Karte id -> async () => boolean;
 * fehlt ein Eintrag, ist dieser Autopilot von hier aus NICHT wiederbelebbar
 * (z. B. ein Dienst ohne erreichbare Adresse) — das wird ehrlich gemeldet
 * und sofort eskaliert, statt einen Versuch vorzutäuschen.
 */
export async function fuehreHeilungAus({ plan, heiler = {}, melde = null, sendeAlarm = null, log = () => {} } = {}) {
  const ergebnisse = [];

  for (const { id, versuch } of plan.heilen) {
    const fn = heiler[id];
    if (typeof fn !== "function") {
      ergebnisse.push({ id, versuch, ok: false, grund: "kein Wiederbelebungsweg hinterlegt" });
      if (sendeAlarm) {
        await sendeAlarm({
          id,
          grund: "Dieser Autopilot ist von hier aus nicht wiederbelebbar (kein erreichbarer Start-Weg). "
            + "Er braucht einen Handgriff im Portal."
        }).catch(() => {});
      }
      continue;
    }
    try {
      const ok = await fn();
      ergebnisse.push({ id, versuch, ok: Boolean(ok) });
      log(`[selbstheilung] ${id}: Versuch ${versuch}/${VERSUCHE_MAX} -> ${ok ? "angestossen" : "gescheitert"}`);
    } catch (fehler) {
      ergebnisse.push({ id, versuch, ok: false, grund: String(fehler?.message || fehler).slice(0, 120) });
    }
  }

  for (const e of plan.eskalieren) {
    log(`[selbstheilung] ESKALATION ${e.id}: ${e.grund}`);
    if (sendeAlarm) await sendeAlarm(e).catch(() => {});
  }

  // Der Heiler bezeugt sich selbst — sonst wüsste niemand, ob er überhaupt
  // arbeitet. Dieselbe Regel wie beim Taktgeber.
  if (melde) {
    const versucht = ergebnisse.length;
    const gelungen = ergebnisse.filter((r) => r.ok).length;
    melde("selbstheilung", {
      status: plan.eskalieren.length ? "fehler" : "ok",
      meldung: plan.eskalieren.length
        ? `${plan.eskalieren.length} Autopilot(en) nach ${VERSUCHE_MAX} Versuchen aufgegeben — Betreiber informiert`
        : versucht
          ? `${gelungen}/${versucht} Wiederbelebung(en) angestoßen, ${plan.warten.length} warten auf ihren Abstand`
          : "Nichts zu heilen — kein Autopilot steht auf rot",
      dauerMs: null
    });
  }

  return ergebnisse;
}
