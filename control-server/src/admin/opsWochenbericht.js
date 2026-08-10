// smejj.com — Modul AP, Teil Wochenbericht (Profi-Ausbau Nr. 4, 2026-08-09).
//
// Ausgelagert aus opsAutopiloten.js am 2026-08-10 (800-Zeilen-Regel). Inhaltlich
// unveraendert; die Abhaengigkeiten (Uebersicht, Mailer, Ablage) kommen per
// Factory herein, damit dieses Modul ohne den Registry-Zustand testbar bleibt
// und opsAutopiloten.js die oeffentliche API unveraendert re-exportieren kann.
//
// Die Ampel sieht nur, wer hinschaut. Der Wochenbericht dreht das um: jeden
// Montag ab 7:00 UTC (nach dem Radar-Lauf um 6:00) EINE Mail mit der Lage der
// Woche — wie die SLA-Reports der grossen Anbieter, nur ehrlich: Quoten aus
// gemessenen LAEUFEN, Vorfaelle mit Dauer, Stillgelegtes als "gewollt".
//
// Der "schon gesendet"-Marker liegt mit in der Ablage: Salad verteilt den
// Container mehrmals taeglich neu, ein reiner Arbeitsspeicher-Marker wuerde am
// selben Montag mehrere Mails ausloesen. (Scheitert das Ablegen UND faellt der
// Container am selben Montag, kommt schlimmstens eine zweite Mail — die
// harmlosere Richtung; verschluckt wird keiner.)

export function createWochenbericht({ autopilotUebersicht, sendAuthMail, ablage, ablageStand, tagMs }) {
  const bericht = { zuletztFuer: null };

  /** Beim Start den Marker zurueckholen (Gegenstueck zu ladeWartung). */
  function ladeBerichtMarker(datensatz) {
    if (datensatz?.id !== "_wochenbericht") return false;
    if (!bericht.zuletztFuer && typeof datensatz.tag === "string") bericht.zuletztFuer = datensatz.tag;
    return true;
  }

  /** Der Berichtstext — reine Funktion, damit der Inhalt ohne Mail testbar ist. */
  function wochenberichtText({ jetztMs = Date.now() } = {}) {
    const u = autopilotUebersicht({ jetztMs });
    const grenzeMs = jetztMs - 7 * tagMs;
    const AMPELWORT = { gruen: "gruen", gelb: "GELB", rot: "ROT", grau: "keine Messung", wartung: "Wartung" };

    const zeilen = u.autopiloten.map((a) => {
      if (a.zeitplan === "stillgelegt") return `- ${a.name}: stillgelegt (gewollt, kein Alarm)`;
      const woche = (a.tage || []).filter((t) => Date.parse(t.tag) >= grenzeMs);
      const laeufe = woche.reduce((s, t) => s + (t.ok || 0) + (t.fehler || 0), 0);
      const fehler = woche.reduce((s, t) => s + (t.fehler || 0), 0);
      const messung = laeufe
        ? `${laeufe} Laeufe, ${fehler} Fehler (${Math.round(((laeufe - fehler) / laeufe) * 1000) / 10} % erfolgreich)`
        : "keine Laeufe gemessen";
      return `- ${a.name} [${AMPELWORT[a.ampel] || a.ampel}]: ${messung}`;
    });

    const wochenVorfaelle = u.vorfaelle.filter((v) => Date.parse(v.von) >= grenzeMs);
    const vorfallZeilen = wochenVorfaelle.length
      ? wochenVorfaelle.map((v) => {
        const art = v.art === "gelb" ? "Verspaetung" : "Ausfall";
        const dauer = v.bis === null ? "laeuft noch" : `${Math.max(1, Math.round((v.dauerMs || 0) / 60000))} min`;
        return `- ${v.name} (${art}, ${dauer}): ${v.grund}`;
      })
      : ["- keine"];

    return `smejj.com Autopiloten — Wochenbericht\n\n`
      + `Ampel jetzt: ${u.gruen} gruen, ${u.gelb} gelb, ${u.rot} rot, ${u.grau} ohne Messung`
      + (u.wartung ? `, ${u.wartung} in Wartung` : "") + `\n\n`
      + `Letzte 7 Tage je Autopilot:\n${zeilen.join("\n")}\n\n`
      + `Vorfaelle der letzten 7 Tage:\n${vorfallZeilen.join("\n")}\n\n`
      + `Ampel und Einzelheiten: https://smejj.com/admin/autopiloten/\n`
      + `Dieser Bericht kommt jeden Montag ab 7:00 UTC — einmal, auch wenn der Server dazwischen neu startet.`;
  }

  /** Faelligkeit pruefen und hoechstens einmal je Montag senden. */
  async function pruefeWochenbericht({ env = process.env, jetztMs = Date.now(), sende = null } = {}) {
    const jetzt = new Date(jetztMs);
    if (jetzt.getUTCDay() !== 1 || jetzt.getUTCHours() < 7) return { gesendet: false, grund: "nicht faellig" };
    const montag = jetzt.toISOString().slice(0, 10);
    if (bericht.zuletztFuer === montag) return { gesendet: false, grund: "schon gesendet" };
    const empfaenger = String(env.SMEJJ_ADMIN_OWNER_EMAILS || "").split(",")[0].trim();
    if (!empfaenger) return { gesendet: false, grund: "kein Empfaenger hinterlegt" };

    const senden = sende || ((nachricht) => sendAuthMail(nachricht, env));
    await senden({
      to: empfaenger,
      subject: `smejj.com Autopiloten — Wochenbericht ${montag}`,
      text: wochenberichtText({ jetztMs }),
      art: "autopilot-wochenbericht"
    });
    // Marker erst NACH erfolgreichem Senden: schlaegt die Mail fehl, wirft
    // senden(), nichts wird vermerkt, und der naechste Takt versucht es erneut.
    bericht.zuletztFuer = montag;
    ablage.schreib({ id: "_wochenbericht", createdAt: jetzt.toISOString(), tag: montag }, { env, timeoutMs: 20_000 })
      .catch((fehler) => { ablageStand.letzterSchreibFehler = String(fehler?.message || fehler).slice(0, 120); });
    return { gesendet: true, fuer: montag };
  }

  /** Den Wochenbericht im Takt pruefen. unref — haelt den Prozess nicht wach. */
  function starteWochenbericht({ env = process.env, intervallMs = 30 * 60 * 1000 } = {}) {
    const zeitgeber = setInterval(() => { pruefeWochenbericht({ env }).catch(() => {}); }, intervallMs);
    if (typeof zeitgeber.unref === "function") zeitgeber.unref();
    return zeitgeber;
  }

  /** Nur fuer Tests: den Marker im Arbeitsspeicher zuruecksetzen. */
  function _zuruecksetzen() {
    bericht.zuletztFuer = null;
  }

  return { ladeBerichtMarker, wochenberichtText, pruefeWochenbericht, starteWochenbericht, _zuruecksetzen };
}
