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
// Karenz nach einem Neustart: der langsamste Autopilot-Takt sind 30 Minuten,
// darum erst danach graue Ampeln als echte Aufgaben werten.
export const AMPEL_TAKT_KARENZ_MS = 35 * 60 * 1000;

export const STUFEN = Object.freeze({
  AUSFALL: 1,      // gemessener roter Vorfall — etwas ist kaputt
  SICHERHEIT: 2,   // bekannte Schwachstelle in einer benutzten Bibliothek
  REGRESSION: 3,   // roter Test — Code weicht von seiner Zusage ab
  VERSPAETUNG: 4,  // gelber Vorfall — laeuft, aber nicht puenktlich
  ZUSTELLUNG: 5,   // Mails erreichen den Empfaenger nicht
  AUSBAU: 6        // grauer Autopilot — dokumentierte offene Aufgabe
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
 * @param {{ok: boolean, negative?: Array<{promptSample: string, antwortSample?: string, createdAt: string}>, grund?: string}} [quellen.antworten]
 * @param {{ok: boolean, funde?: Array<{name: string, version: string, id: string, herkunft: string}>, grund?: string}} [quellen.cve]
 * @param {{ok: boolean, aufgaben?: Array, grund?: string}} [quellen.verbesserungen] Fertige
 *   Aufgaben aus der AI Evolution Engine (Quality-Engine und Missing-Function-Detector).
 *   Sie bringen ihre eigene Priorität mit — hier wird sie nur in die Stufen-Skala
 *   der Werkstatt übersetzt, damit EINE Rangfolge gilt und nicht zwei.
 * @param {number} [quellen.laufzeitMs] Wie lange der Control-Server schon laeuft
 *   (aus /api/health `gestartetAm`). Fehlt der Wert, wird von einem lange
 *   laufenden Server ausgegangen — graue Ampeln zaehlen dann wie bisher.
 * @returns {{aufgaben: Array, stummeQuellen: Array, gesammeltAus: Array}}
 */
export function baueBacklog({ ampel, tests, mails, antworten, cve, verbesserungen, laufzeitMs } = {}) {
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
    // Nach einem Neustart hat noch KEIN Autopilot getaktet — dann steht alles
    // auf grau, ohne dass irgendetwas kaputt waere. Gemessen 2026-08-14: zwei
    // Minuten nach einem Deploy meldete dieselbe Ampel 30 graue; 120 Sekunden
    // spaeter wieder 34 gruen. Ungefiltert haette der Nachtbau an einer von 30
    // Phantom-Aufgaben gebaut. Der langsamste Takt ist 30 Minuten, deshalb die
    // Schwelle darueber.
    // Fail-closed wie ueberall in der Werkstatt: die grauen werden NICHT still
    // verworfen, sondern als stumme Quelle gemeldet — ungeprueft ist nicht
    // erledigt ([[Werkstatt Station 1]]).
    const jungeLaufzeitMs = Number.isFinite(laufzeitMs) ? laufzeitMs : Infinity;
    const nochNichtGetaktet = jungeLaufzeitMs < AMPEL_TAKT_KARENZ_MS;
    if (nochNichtGetaktet) {
      const graue = (ampel.autopiloten || []).filter((a) => a.ampel === "grau").length;
      if (graue > 0) {
        stummeQuellen.push({
          quelle: "Ampel-grau",
          grund: `Server erst seit ${Math.round(jungeLaufzeitMs / 60000)} min neu gestartet — `
            + `${graue} Autopilot(en) hatten noch keinen Takt. Grau heisst hier "noch nicht gemessen", nicht "kaputt".`
        });
      }
    } else {
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

  // Bekannte Schwachstellen in benutzten Bibliotheken (osv.dev). Eine Aufgabe
  // je PAKET, nicht je Fund: `aiohttp 3.11.11` traegt allein 66 Eintraege —
  // 191 einzelne Backlog-Zeilen waeren unbedienbar, die Arbeit ist ohnehin
  // eine einzige (Version anheben und neu bauen).
  if (cve?.ok) {
    gesammeltAus.push("CVE-Waechter");
    const jePaket = new Map();
    for (const f of cve.funde || []) {
      const schluessel = `${f.name}@${f.version}`;
      if (!jePaket.has(schluessel)) jePaket.set(schluessel, { ...f, anzahl: 0, ids: [] });
      const eintrag = jePaket.get(schluessel);
      eintrag.anzahl += 1;
      if (eintrag.ids.length < 3) eintrag.ids.push(f.id);
    }
    for (const p of jePaket.values()) {
      aufgaben.push({
        stufe: STUFEN.SICHERHEIT,
        quelle: "CVE-Waechter",
        betrifft: `bibliothek:${p.name}`,
        titel: `${p.name} ${p.version}: ${p.anzahl} bekannte Schwachstelle(n)`,
        befund: `Gemeldet von osv.dev. Beispiele: ${p.ids.join(", ")}. `
          + `Quelle: ${p.herkunft}. Behebung = Version anheben und den Dienst neu bauen.`,
        seit: null
      });
    }
  } else if (cve) {
    stummeQuellen.push({ quelle: "CVE-Waechter", grund: cve.grund || "nicht abgefragt" });
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

  // Daten-Schwungrad (2026-08-13): Nicht-hilfreich-Klicks der Nutzer. EINE
  // gebuendelte Aufgabe je Sammelrunde statt einer je Klick — zehn Daumen
  // runter sind EIN Arbeitsauftrag ("Antwortqualitaet pruefen"), kein
  // zehnfach aufgeblaehtes Backlog. Die Kostproben stehen im Befund.
  if (antworten?.ok) {
    gesammeltAus.push("Nutzer-Feedback");
    const negative = antworten.negative || [];
    if (negative.length > 0) {
      const kostproben = negative.slice(0, 3)
        .map((n) => `"${String(n.promptSample || "").slice(0, 60)}"`)
        .join(", ");
      aufgaben.push({
        stufe: STUFEN.REGRESSION,
        quelle: "Nutzer-Feedback",
        betrifft: "chat-antworten",
        titel: `${negative.length} Antwort(en) in 7 Tagen als "nicht hilfreich" markiert`,
        befund: `Betroffene Fragen (PII-bereinigt): ${kostproben}${negative.length > 3 ? ` und ${negative.length - 3} weitere` : ""}.`,
        seit: negative[negative.length - 1]?.createdAt || null
      });
    }
  } else if (antworten) {
    stummeQuellen.push({ quelle: "Nutzer-Feedback", grund: antworten.grund || "nicht abgefragt" });
  }

  // AI Evolution Engine (2026-08-14): Befunde der Quality-Engine und Lücken
  // aus dem Missing-Function-Detector. Sie kommen als FERTIGE Aufgaben an —
  // mit Score, Zuständigem und Testanforderung — und werden hier nur in die
  // Stufen-Skala übersetzt. Zwei Rangfolgen nebeneinander wären eine zu viel.
  if (verbesserungen?.ok) {
    gesammeltAus.push("Evolution-Engine");
    for (const v of verbesserungen.aufgaben || []) {
      aufgaben.push({
        stufe: stufeAusPrioritaet(v),
        quelle: v.quelle || "Evolution-Engine",
        betrifft: v.betrifft,
        titel: v.titel,
        befund: `${v.befund} Beleg: ${v.beleg}. `
          + `Score ${v.score} (${v.prioritaet}), zustaendig: ${v.zustaendig}, Freigabe: ${v.freigabe}. `
          + `Test: ${v.testanforderung}`,
        seit: null
      });
    }
  } else if (verbesserungen) {
    stummeQuellen.push({ quelle: "Evolution-Engine", grund: verbesserungen.grund || "nicht abgefragt" });
  }

  aufgaben.sort((a, b) => a.stufe - b.stufe || String(a.betrifft).localeCompare(String(b.betrifft)));
  return { aufgaben, stummeQuellen, gesammeltAus };
}

/**
 * Uebersetzt die Prioritaet einer Evolution-Aufgabe in eine Werkstatt-Stufe.
 * Eine fehlende Funktion ist NIE dringender als ein Ausfall: was kaputt ist,
 * geht vor dem, was fehlt — sonst baut die Werkstatt Neues, waehrend Altes
 * brennt.
 */
function stufeAusPrioritaet(v) {
  if (v?.klasse === "fehlende-funktion") return STUFEN.AUSBAU;
  if (v?.risiko === "hoch") return STUFEN.SICHERHEIT;
  if (v?.prioritaet === "critical" || v?.prioritaet === "high") return STUFEN.REGRESSION;
  return STUFEN.AUSBAU;
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
  // Muss zu STUFEN passen — sonst traegt eine Aufgabe im Bericht den Namen
  // einer fremden Kategorie (beim Einfuegen von SICHERHEIT genau passiert).
  const namen = {
    [STUFEN.AUSFALL]: "1 — Ausfall",
    [STUFEN.SICHERHEIT]: "2 — Sicherheit",
    [STUFEN.REGRESSION]: "3 — Regression",
    [STUFEN.VERSPAETUNG]: "4 — Verspaetung",
    [STUFEN.ZUSTELLUNG]: "5 — Zustellung",
    [STUFEN.AUSBAU]: "6 — Ausbau"
  };
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

