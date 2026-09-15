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

// ---- Befristeter Alarm: der Vertrag zwischen einer Wache und der Ersten Hilfe ----
//
// WARUM (Live-Test 15.09.): Die Konto-Wache (Nr. 52) steht nach einer Änderung der
// Admin-Liste ABSICHTLICH 24 h rot — der Betreiber soll die Änderung sehen. Die Erste
// Hilfe hielt das für einen Ausfall, "belebte" die Wache dreimal (ohne jede Wirkung:
// derselbe Lauf meldet dieselbe Frist), gab auf, wurde selbst rot und schickte eine
// "Autopilot gibt auf"-Mail — nach jedem Neustart erneut. Ein Doppel-Rot ohne Aussage.
//
// Das Signal ist GENERISCH, kein Namens-Sonderfall: jede Wache, die bewusst befristet
// rot meldet, beginnt ihre Meldung mit BEFRISTETER_ALARM und dem Ende der Frist. Die
// Marke steht VORN, weil der Herzschlag die Meldung nach 200 Zeichen abschneidet.
// Drei Sicherungen gegen Missbrauch als Dauer-Ausrede:
//   - gilt nur bis zum genannten Zeitpunkt; danach ist Rot wieder ein Ausfall,
//   - gilt nur, wenn die Frist höchstens BEFRISTUNG_MAX_MS in der Zukunft liegt,
//   - wird nur im ampelGrund gelesen: dort steht die Meldung NUR, wenn der Lauf den
//     Fehler selbst gemeldet hat. Bleibt die Wache aus ("Überfällig"), ist das ein
//     echter Ausfall — auch wenn ihre letzte Meldung noch eine Frist trug.
export const BEFRISTETER_ALARM = "Befristeter Alarm bis";
export const BEFRISTUNG_MAX_MS = 48 * 60 * 60 * 1000;

/** Marke für den Anfang einer bewusst befristeten Rot-Meldung, z. B. "Befristeter Alarm bis 2026-09-16T17:38Z". */
export function befristeterAlarm(bisMs) {
  return `${BEFRISTETER_ALARM} ${new Date(bisMs).toISOString().slice(0, 16)}Z`;
}

/** Ende der Frist in ms aus einem Text, oder null, wenn keine (lesbare) Marke darin steht. */
export function befristeterAlarmBis(text) {
  const m = /Befristeter Alarm bis (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})Z/.exec(String(text || ""));
  if (!m) return null;
  const ms = Date.parse(`${m[1]}:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function inBefristetemAlarm(a, jetztMs) {
  const bis = befristeterAlarmBis(a.ampelGrund);
  return bis !== null && jetztMs < bis && bis - jetztMs <= BEFRISTUNG_MAX_MS ? bis : null;
}

/**
 * Entscheidet je Autopilot, was zu tun ist. REINE Funktion: kein Netz, keine
 * Uhr, kein Zustand ausserhalb des uebergebenen `zustand` — damit die Bremse
 * pruefbar ist, ohne 20 Minuten zu warten.
 *
 * @param {object} p
 * @param {Array} p.autopiloten Liste aus autopilotUebersicht().
 * @param {Map<string, {versuche: number, letzterMs: number, eskaliert: boolean}>} p.zustand
 * @param {number} p.jetztMs
 * @param {Set<string>|null} [p.erreichbar] Kennungen, fuer die ein Start-Weg
 *   existiert. Ist die Menge gesetzt und ein roter Autopilot fehlt darin
 *   (Mac-Cron, fremder Dienst), gibt es KEINEN Versuch und KEINE Eskalation:
 *   er landet einmal je Rot-Phase unter `betreiber`. Audit 03.09.: Erste
 *   Hilfe stand tagelang rot, weil sie zwei Mac-Jobs "nach 3 Versuchen
 *   aufgab", die sie nie haette starten koennen — ein Doppel-Rot ohne
 *   Aussage, denn die Mac-Jobs sind selbst schon rot und tragen den Grund.
 * Ein roter Autopilot mit befristetem Alarm (siehe BEFRISTETER_ALARM) ist KEIN
 * Ausfall: kein Versuch, kein Zähler, keine Eskalation — er steht nur unter `befristet`.
 * @returns {{heilen: Array<{id: string, versuch: number}>, eskalieren: Array<{id: string, name: string, grund: string}>, warten: Array<{id: string, nochMs: number}>, betreiber: Array<{id: string, name: string}>, befristet: Array<{id: string, name: string, bisMs: number}>}}
 */
export function planeHeilung({ autopiloten = [], zustand = new Map(), jetztMs = Date.now(), erreichbar = null } = {}) {
  const heilen = [];
  const eskalieren = [];
  const warten = [];
  const betreiber = [];
  const befristet = [];

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

    // Bewusst befristet rot (z. B. Konto-Wache nach Admin-Listen-Änderung): Ein
    // Neustart der Wache ändert daran nichts, also zählt es weder als Versuch noch
    // als Aufgabe. Ein alter Zähler aus der Zeit VOR der Marke fällt weg — sonst
    // eskalierte die Erste Hilfe beim Ablauf der Frist sofort mit Altlast.
    const bisMs = inBefristetemAlarm(a, jetztMs);
    if (bisMs !== null) {
      if (eintrag) zustand.delete(a.id);
      befristet.push({ id: a.id, name: a.name || a.id, bisMs });
      continue;
    }

    // Kein Start-Weg von hier aus: Betreiber-Punkt, genau einmal je Rot-Phase.
    if (erreichbar && !erreichbar.has(a.id)) {
      if (!eintrag?.betreiber) {
        zustand.set(a.id, { versuche: 0, letzterMs: jetztMs, eskaliert: false, betreiber: true });
        betreiber.push({ id: a.id, name: a.name || a.id });
      }
      continue;
    }

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

  return { heilen, eskalieren, warten, betreiber, befristet };
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
  // Betreiber-Punkte nur ins Log: die Rot-Mail je Episode schickt schon die
  // Alarm-Wache fuer den betroffenen Autopiloten selbst — eine zweite Mail
  // waere derselbe Alarm in anderer Verpackung.
  const betreiber = plan.betreiber || [];
  for (const b of betreiber) log(`[selbstheilung] BETREIBER-PUNKT ${b.id}: kein Start-Weg von hier (Mac/extern), Grund steht an seiner Ampel`);
  for (const b of plan.befristet || []) log(`[selbstheilung] BEFRISTET ${b.id}: bewusster Alarm bis ${new Date(b.bisMs).toISOString()} — keine Wiederbelebung`);

  // Der Heiler bezeugt sich selbst — sonst wüsste niemand, ob er überhaupt
  // arbeitet. Dieselbe Regel wie beim Taktgeber.
  if (melde) {
    const versucht = ergebnisse.length;
    const gelungen = ergebnisse.filter((r) => r.ok).length;
    const befristet = plan.befristet || [];
    const anhang = (betreiber.length ? `; ${betreiber.length} ohne Start-Weg (Mac/extern) = Betreiber-Punkt, nicht eskaliert` : "")
      + (befristet.length ? `; ${befristet.length} bewusst befristet rot (${befristet.map((b) => b.name).join(", ")}) = kein Ausfall, nicht wiederbelebt` : "");
    melde("selbstheilung", {
      status: plan.eskalieren.length ? "fehler" : "ok",
      meldung: (plan.eskalieren.length
        ? `${plan.eskalieren.length} Autopilot(en) nach ${VERSUCHE_MAX} Versuchen aufgegeben — Betreiber informiert`
        : versucht
          ? `${gelungen}/${versucht} Wiederbelebung(en) angestoßen, ${plan.warten.length} warten auf ihren Abstand`
          : "Nichts zu heilen — kein wiederbelebbarer Autopilot steht auf rot") + anhang,
      dauerMs: null
    });
  }

  return ergebnisse;
}
