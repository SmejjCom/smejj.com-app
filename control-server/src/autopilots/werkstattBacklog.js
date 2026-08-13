// smejj.com — Werkstatt-Autopilot (Nr. 30), Station 1: die Sammel-Logik.
//
// WARUM SIE HIER LIEGT und nicht mehr im Skript: Das Docker-Abbild des
// Control-Servers kopiert scripts/ NICHT (siehe Dockerfile.smejj-control).
// Solange die Logik dort wohnte, konnte der Autopilot-Laeufer sie nicht
// aufrufen — Station 1 lief nur von Hand auf dem Mac und war in der Ampel
// grau. Jetzt teilen sich beide dieselbe Quelle:
//
//   scripts/werkstatt/sammle-backlog.mjs   holt die Daten per HTTP und
//                                          schreibt docs/werkstatt/BACKLOG.md
//   autopilotLaeufer.js                    ruft dieselbe Funktion in-process
//                                          auf (ohne Netz, ohne Token)
//
// DIE REGEL, die diese Datei traegt: EINE STUMME QUELLE IST KEIN LEERES
// BACKLOG. Faellt eine Quelle aus, steht sie samt Grund im Bericht — sonst
// sieht "nichts zu tun" genauso aus wie "ich konnte nicht nachsehen".

// Dringlichkeit: 1 = Nutzer merkt es jetzt, 5 = geplanter Ausbau.
export const STUFEN = Object.freeze({
  AUSFALL: 1,      // gemessener roter Vorfall — etwas ist kaputt
  REGRESSION: 2,   // roter Test — Code weicht von seiner Zusage ab
  VERSPAETUNG: 3,  // gelber Vorfall — laeuft, aber nicht puenktlich
  ZUSTELLUNG: 4,   // Mails erreichen den Empfaenger nicht
  AUSBAU: 5        // grauer Autopilot — dokumentierte offene Aufgabe
});

/**
 * Baut die priorisierte Aufgabenliste. REINE Funktion: kein Netz, keine
 * Dateien — damit sie ohne laufende Dienste pruefbar ist (Hausregel aus dem
 * Maus-Engine-Umbau: Engine-Logik immer ohne Umgebung testbar bauen).
 *
 * @param {object} quellen
 * @param {{ok: boolean, autopiloten?: Array, vorfaelle?: Array, grund?: string}} quellen.ampel
 * @param {{ok: boolean, rote?: Array<string>, grund?: string}} [quellen.tests]
 * @param {{ok: boolean, gescheitert?: number, zeitraumTage?: number, grund?: string}} [quellen.mails]
 * @returns {{aufgaben: Array, stummeQuellen: Array, gesammeltAus: Array}}
 */
export function baueBacklog({ ampel, tests, mails } = {}) {
  const aufgaben = [];
  const stummeQuellen = [];
  const gesammeltAus = [];

  if (ampel?.ok) {
    gesammeltAus.push("Autopiloten-Ampel");
    const offene = (ampel.vorfaelle || []).filter((v) => v && v.bis === null);
    for (const v of offene) {
      aufgaben.push({
        stufe: v.art === "rot" ? STUFEN.AUSFALL : STUFEN.VERSPAETUNG,
        quelle: "Ampel-Vorfall",
        betrifft: v.id,
        titel: `${v.art === "rot" ? "Ausfall" : "Verspaetung"}: ${v.name || v.id}`,
        befund: String(v.grund || "").slice(0, 200),
        seit: v.von || null
      });
    }
    for (const a of ampel.autopiloten || []) {
      if (a.ampel !== "grau") continue;
      aufgaben.push({
        stufe: STUFEN.AUSBAU,
        quelle: "Ampel-grau",
        betrifft: a.id,
        titel: `Messung anschliessen: ${a.name || a.id}`,
        befund: String(a.ampelGrund || "").slice(0, 200),
        seit: null
      });
    }
  } else {
    stummeQuellen.push({ quelle: "Autopiloten-Ampel", grund: ampel?.grund || "nicht abgefragt" });
  }

  if (tests?.ok) {
    gesammeltAus.push("Pruefsuite");
    for (const datei of tests.rote || []) {
      aufgaben.push({
        stufe: STUFEN.REGRESSION,
        quelle: "Pruefsuite",
        betrifft: datei,
        titel: `Roter Test: ${datei}`,
        befund: "Die Datei faellt in der Pruefsuite. Ursache klaeren und beheben — nicht den Test anpassen, bis der Befund verstanden ist.",
        seit: null
      });
    }
  } else if (tests) {
    stummeQuellen.push({ quelle: "Pruefsuite", grund: tests.grund || "nicht ausgefuehrt" });
  }

  if (mails?.ok) {
    gesammeltAus.push("Mail-Zustellprotokoll");
    if (Number(mails.gescheitert) > 0) {
      aufgaben.push({
        stufe: STUFEN.ZUSTELLUNG,
        quelle: "Mail-Protokoll",
        betrifft: "email-zustellung",
        titel: `${mails.gescheitert} Mails haben den Server nicht verlassen`,
        befund: `Gemessen ueber ${mails.zeitraumTage || "?"} Tage. Gruende stehen im Versandprotokoll (Adminbereich, Ansicht V).`,
        seit: null
      });
    }
  } else if (mails) {
    stummeQuellen.push({ quelle: "Mail-Zustellprotokoll", grund: mails.grund || "nicht abgefragt" });
  }

  aufgaben.sort((a, b) => a.stufe - b.stufe || String(a.betrifft).localeCompare(String(b.betrifft)));
  return { aufgaben, stummeQuellen, gesammeltAus };
}

/** Der Bericht als Markdown — fuer Menschen lesbar, in Git nachvollziehbar. */
export function alsMarkdown({ aufgaben, stummeQuellen, gesammeltAus }, jetzt) {
  const zeilen = [];
  zeilen.push("# Werkstatt-Backlog (Autopilot Nr. 30, Station 1)");
  zeilen.push("");
  zeilen.push(`Gesammelt am ${jetzt} aus ECHTEN Messungen — nicht aus Vermutungen.`);
  zeilen.push("Erzeugt von `scripts/werkstatt/sammle-backlog.mjs`. Diese Datei wird bei jedem Lauf neu geschrieben.");
  zeilen.push("");
  zeilen.push(`**Quellen, die geantwortet haben:** ${gesammeltAus.length ? gesammeltAus.join(", ") : "keine"}`);
  if (stummeQuellen.length) {
    zeilen.push("");
    zeilen.push("**STUMME QUELLEN — hier wurde NICHT nachgesehen:**");
    for (const s of stummeQuellen) zeilen.push(`- ${s.quelle}: ${s.grund}`);
    zeilen.push("");
    zeilen.push("> Eine stumme Quelle ist kein leeres Backlog. Was hier fehlt, ist ungeprueft, nicht erledigt.");
  }
  zeilen.push("");
  zeilen.push(`## ${aufgaben.length} Aufgaben, nach Dringlichkeit`);
  zeilen.push("");
  if (!aufgaben.length) {
    zeilen.push("Keine Aufgaben gefunden. Das gilt nur fuer die oben genannten Quellen.");
  }
  const namen = { 1: "1 — Ausfall", 2: "2 — Regression", 3: "3 — Verspaetung", 4: "4 — Zustellung", 5: "5 — Ausbau" };
  let letzteStufe = null;
  for (const a of aufgaben) {
    if (a.stufe !== letzteStufe) {
      zeilen.push("");
      zeilen.push(`### Stufe ${namen[a.stufe] || a.stufe}`);
      zeilen.push("");
      letzteStufe = a.stufe;
    }
    zeilen.push(`- **${a.titel}**`);
    zeilen.push(`  - Betrifft: \`${a.betrifft}\` · Quelle: ${a.quelle}${a.seit ? ` · offen seit ${a.seit}` : ""}`);
    if (a.befund) zeilen.push(`  - Befund: ${a.befund}`);
  }
  zeilen.push("");
  return zeilen.join("\n");
}

