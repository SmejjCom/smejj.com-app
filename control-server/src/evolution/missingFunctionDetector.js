// smejj.com — Missing Function Detector: was können die anderen, das smejj
// nicht kann — und lohnt es sich?
//
// WARUM ES DIESE DATEI GIBT: Der Konkurrenz-Radar (Autopilot Nr. 04) läuft seit
// Wochen und schreibt Berichte. Aus einem Bericht wurde aber nie eine AUFGABE —
// er landete in docs/ und wartete darauf, dass ein Mensch ihn liest. Zwischen
// "wir wissen es" und "wir tun etwas" lag niemand.
//
// DIE REGEL, die diese Datei trägt: EINE FÄHIGKEIT OHNE BELEG IST KEINE
// FÄHIGKEIT. Jeder Eintrag im smejj-Register nennt die Datei, in der die
// Funktion wirklich steckt. pruefeBelege() schaut nach, ob es diese Datei noch
// gibt. Fehlt sie, gilt die Fähigkeit als NICHT vorhanden — und der Detector
// meldet sie als Lücke. So kann das Register nicht heimlich zur Wunschliste
// werden (dieselbe Lehre wie bei den 29 Autopilot-Attrappen, die "grün"
// meldeten, ohne zu laufen).
//
// EHRLICHKEIT ÜBER DIE KONKURRENZ-QUELLE: KONKURRENZ_STAND unten ist ein
// HANDGEPFLEGTER Stand mit Datum, keine Live-Messung. Er ist als solcher
// gekennzeichnet und trägt je Eintrag eine Quelle. Sobald der Konkurrenz-Radar
// strukturierte Funktionslisten liefert, wird er als Quelle durchgereicht —
// erkenneLuecken() nimmt jede Liste derselben Form entgegen.

import { bewerteVerbesserung, prioritaetAus, aufgabenId } from "./aiEvolutionEngine.js";

/**
 * Was smejj.com heute kann — jeder Eintrag mit der Datei, die es beweist.
 * `art` verbindet die Fähigkeit mit der Quality-Engine und dem zuständigen
 * Autopiloten.
 */
export const SMEJJ_FAEHIGKEITEN = Object.freeze([
  { id: "chat", name: "Text-Chat mit Streaming", art: "text", beleg: "public/chat-bridge.js" },
  { id: "websuche", name: "Websuche mit Quellenangabe", art: "recherche", beleg: "src/search/webSearch.js" },
  { id: "tiefe-recherche", name: "Mehrstufige Recherche", art: "recherche", beleg: "control-server/src/autopilots/deepResearchAutopilot.js" },
  { id: "projektwissen", name: "Projektwissen im Prompt (RAG)", art: "recherche", beleg: "control-server/src/rag/agentContext.js" },
  { id: "bilder-malen", name: "Bilder erzeugen", art: "bild", beleg: "public/chat-bridge-bilder.js" },
  { id: "bilder-verstehen", name: "Bilder verstehen", art: "bild", beleg: "public/chat-bridge-vision.js" },
  { id: "video", name: "Video erzeugen (MP4 mit Ton)", art: "video", beleg: "public/chat-bridge-bilder.js" },
  { id: "stimme", name: "Sprachein- und -ausgabe", art: "audio", beleg: "public/voice-realtime.js" },
  { id: "code-sandkasten", name: "Code ausführen", art: "code", beleg: "control-server/src/autopilots/codeInterpreterAutopilot.js" },
  { id: "werkzeuge", name: "Werkzeugaufrufe im Modell-Kreis", art: "werkzeug", beleg: "control-server/src/llm/toolLoop.js" },
  { id: "gedaechtnis", name: "Langzeitgedächtnis über Sitzungen", art: "text", beleg: "control-server/src/autopilots/memoryAutopilot.js" },
  { id: "arbeitsbereich", name: "Dateien im Arbeitsbereich", art: "dokument", beleg: "public/workspace-bridge.js" },
  { id: "live-vorschau", name: "Sofort-Vorschau im Browser", art: "code", beleg: "control-server/src/autopilots/instantWebContainerAutopilot.js" },
  { id: "verlauf-suche", name: "Suche über den Verlauf", art: "text", beleg: "public/search.js" }
]);

/**
 * Handgepflegter Konkurrenz-Stand. NICHT live gemessen — Datum und Quelle
 * stehen an jedem Eintrag, damit niemand ihn für eine Messung hält.
 * `nutzen`, `haeufigkeit`, `machbarkeit` sind Schätzungen 0..1.
 */
export const KONKURRENZ_STAND = Object.freeze({
  stand: "2026-08-14",
  herkunft: "handgepflegt (Konkurrenz-Radar Nr. 04 liefert die Berichte, noch keine strukturierte Liste)",
  funktionen: Object.freeze([
    { id: "chat", anbieter: ["ChatGPT", "Gemini", "Claude", "Kimi", "Grok"], name: "Text-Chat", art: "text" },
    { id: "websuche", anbieter: ["ChatGPT", "Gemini", "Perplexity", "Grok"], name: "Websuche mit Quellen", art: "recherche" },
    { id: "tiefe-recherche", anbieter: ["ChatGPT", "Gemini", "Perplexity"], name: "Deep Research", art: "recherche" },
    { id: "bilder-malen", anbieter: ["ChatGPT", "Gemini", "Grok"], name: "Bilder erzeugen", art: "bild" },
    { id: "bilder-verstehen", anbieter: ["ChatGPT", "Gemini", "Claude"], name: "Bilder verstehen", art: "bild" },
    { id: "video", anbieter: ["Gemini", "Grok"], name: "Video erzeugen", art: "video" },
    { id: "stimme", anbieter: ["ChatGPT", "Gemini", "Grok"], name: "Sprachmodus", art: "audio" },
    { id: "code-sandkasten", anbieter: ["ChatGPT", "Gemini", "Claude"], name: "Code ausführen", art: "code" },
    { id: "gedaechtnis", anbieter: ["ChatGPT", "Gemini", "Claude"], name: "Langzeitgedächtnis", art: "text" },
    { id: "projekt-ordner", anbieter: ["ChatGPT", "Claude"], name: "Projekte mit eigenem Wissensspeicher", art: "dokument",
      nutzen: 0.7, haeufigkeit: 0.6, machbarkeit: 0.7, quelle: "Radar-Bericht 01" },
    { id: "geplante-aufgaben", anbieter: ["ChatGPT", "Gemini"], name: "Geplante Aufgaben (Tasks zu festen Zeiten)", art: "automation",
      nutzen: 0.6, haeufigkeit: 0.4, machbarkeit: 0.8, quelle: "Radar-Bericht 01" },
    { id: "geteilte-links", anbieter: ["ChatGPT", "Claude", "Gemini"], name: "Chat als Link teilen", art: "dokument",
      nutzen: 0.5, haeufigkeit: 0.5, machbarkeit: 0.8, quelle: "Radar-Bericht 01" },
    { id: "artefakte", anbieter: ["Claude", "ChatGPT"], name: "Artefakte / Canvas (Ergebnis neben dem Chat bearbeiten)", art: "dokument",
      nutzen: 0.8, haeufigkeit: 0.6, machbarkeit: 0.5, quelle: "Radar-Bericht 01" },
    { id: "eigene-assistenten", anbieter: ["ChatGPT", "Gemini"], name: "Eigene Assistenten/GPTs anlegen", art: "agent",
      nutzen: 0.6, haeufigkeit: 0.3, machbarkeit: 0.6, quelle: "Radar-Bericht 01" },
    { id: "verbinder", anbieter: ["ChatGPT", "Claude"], name: "Verbinder zu Fremdsystemen (MCP/Connectors)", art: "werkzeug",
      nutzen: 0.7, haeufigkeit: 0.4, machbarkeit: 0.4, quelle: "Radar-Bericht 01" }
  ])
});

/**
 * Prüft die Belege gegen den WIRKLICH vorhandenen Quelltext.
 *
 * @param {Array<{path:string}>} dateien Dateien, wie der Läufer sie sammelt
 * @returns {{bestaetigt: Array, unbelegt: Array}}
 */
export function pruefeBelege(faehigkeiten = SMEJJ_FAEHIGKEITEN, dateien = []) {
  // Nur prüfen, wenn überhaupt etwas zum Prüfen da ist: eine leere Dateiliste
  // wäre sonst ein Rundumschlag ("smejj kann gar nichts"), der nichts über
  // smejj aussagt, sondern über den Scan.
  if (!dateien.length) return { bestaetigt: [...faehigkeiten], unbelegt: [], ungeprueft: true };
  const pfade = new Set(dateien.map((d) => String(d?.path || "").replace(/\\/g, "/")));
  const bestaetigt = [];
  const unbelegt = [];
  for (const f of faehigkeiten) {
    // Der Scan erfasst nur .js unter control-server/src und src — Belege
    // ausserhalb (public/) kann er nicht sehen. Die als ungeprueft zu melden
    // waere richtig, sie als fehlend zu melden waere falsch.
    const scanbar = /^(control-server\/src|src)\//.test(f.beleg);
    if (!scanbar) { bestaetigt.push({ ...f, belegGeprueft: false }); continue; }
    if (pfade.has(f.beleg)) bestaetigt.push({ ...f, belegGeprueft: true });
    else unbelegt.push({ ...f, grund: `Beleg-Datei ${f.beleg} nicht im Quelltext gefunden` });
  }
  return { bestaetigt, unbelegt, ungeprueft: false };
}

/**
 * Der Kern: Konkurrenzfunktionen gegen die eigenen halten.
 *
 * @returns {{luecken: Array, vorteile: Array, gleichstand: Array}}
 */
export function erkenneLuecken({ konkurrenz = KONKURRENZ_STAND, faehigkeiten = SMEJJ_FAEHIGKEITEN } = {}) {
  const eigene = new Map(faehigkeiten.map((f) => [f.id, f]));
  const fremde = new Map((konkurrenz.funktionen || []).map((f) => [f.id, f]));

  const luecken = [];
  const gleichstand = [];
  for (const f of fremde.values()) {
    if (eigene.has(f.id)) gleichstand.push({ id: f.id, name: f.name, anbieter: f.anbieter });
    else luecken.push(f);
  }
  // Wo ist smejj VORAUS? Genauso wichtig wie die Lücke — es sagt, was man
  // nicht kaputtmachen darf.
  const vorteile = [...eigene.values()]
    .filter((f) => !fremde.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, beleg: f.beleg }));

  return { luecken, vorteile, gleichstand, stand: konkurrenz.stand, herkunft: konkurrenz.herkunft };
}

/**
 * Aus Lücken werden Improvement-Aufgaben — mit allem, was der Auftrag
 * (Abschnitt 4) verlangt: Funktion, Grund, Konkurrenzvergleich, Nutzen,
 * technische Anforderung, Priorität, Zuständiger, Testanforderung, Status.
 */
export function baueLueckenAufgaben(luecken = []) {
  return luecken.map((l) => {
    const score = bewerteVerbesserung({
      nutzen: l.nutzen ?? 0.5,
      haeufigkeit: l.haeufigkeit ?? 0.4,
      // Je mehr Anbieter es haben, desto klarer ist es Standard geworden.
      wettbewerb: Math.min(1, (l.anbieter?.length || 1) / 4),
      machbarkeit: l.machbarkeit ?? 0.5,
      kosten: 0.4,
      risiko: 0.3,
      sicherheit: 0,
      strategie: 0.5
    });
    return {
      id: aufgabenId({ art: l.art || "produkt", klasse: "fehlende-funktion", betrifft: l.id }),
      titel: `Fehlende Funktion: ${l.name}`,
      art: l.art || "produkt",
      klasse: "fehlende-funktion",
      quelle: "Missing-Function-Detector",
      betrifft: l.id,
      befund: `Vorhanden bei ${(l.anbieter || []).join(", ") || "mindestens einem Anbieter"}, bei smejj.com nicht. `
        + `Stand ${KONKURRENZ_STAND.stand}, Quelle: ${l.quelle || KONKURRENZ_STAND.herkunft}.`,
      beleg: `smejj-Fähigkeitsregister enthält keinen Eintrag "${l.id}"`,
      score,
      prioritaet: prioritaetAus(score),
      // Der Werkstatt-Autopilot ist der einzige, der WIRKLICH baut. Alles
      // andere wäre eine Aufgabe an einen Autopiloten, der sie nicht annehmen
      // kann — und damit eine Aufgabe, die nie jemand macht.
      zustaendig: "werkstatt-autopilot",
      testanforderung: `Ein echter Nutzerweg für "${l.name}" muss messbar durchlaufen (E2E), bevor die Funktion als vorhanden gilt.`,
      risiko: "mittel",
      // Eine neue Produktfunktion ist nie eine Kleinigkeit: der Betreiber
      // entscheidet, was gebaut wird — die Maschine sortiert nur vor.
      freigabe: "betreiber",
      status: "neu"
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Selbsttest: bekannte Lücke muss gefunden, bekannte Fähigkeit darf NICHT als
 * Lücke gemeldet werden — und ein unbelegter Eintrag muss auffallen.
 */
export function fuehreDetectorSelbsttestAus() {
  const fehler = [];
  const probeKonkurrenz = {
    stand: "test",
    herkunft: "selbsttest",
    funktionen: [
      { id: "chat", anbieter: ["A"], name: "Chat", art: "text" },
      { id: "gibt-es-bei-smejj-nicht", anbieter: ["A", "B"], name: "Erfundene Funktion", art: "dokument" }
    ]
  };
  const { luecken, gleichstand, vorteile } = erkenneLuecken({ konkurrenz: probeKonkurrenz });
  if (!luecken.some((l) => l.id === "gibt-es-bei-smejj-nicht")) fehler.push("bekannte Lücke nicht erkannt");
  if (luecken.some((l) => l.id === "chat")) fehler.push("vorhandene Fähigkeit als Lücke gemeldet (Fehlalarm)");
  if (!gleichstand.some((g) => g.id === "chat")) fehler.push("Gleichstand nicht erkannt");
  if (!vorteile.length) fehler.push("kein einziger eigener Vorteil erkannt — das Register wird nicht gelesen");

  const aufgaben = baueLueckenAufgaben(luecken);
  if (!aufgaben.length || !aufgaben[0].zustaendig || !aufgaben[0].testanforderung) {
    fehler.push("aus der Lücke entstand keine vollständige Aufgabe");
  }
  if (aufgaben.some((a) => a.freigabe !== "betreiber")) fehler.push("neue Produktfunktion ohne Betreiber-Freigabe");

  // Der Beleg-Wächter: eine erfundene Fähigkeit mit erfundener Datei muss
  // durchfallen, sobald wirklich gescannt wurde.
  const gefaelscht = [{ id: "phantom", name: "Phantom", art: "text", beleg: "control-server/src/gibt-es-nicht.js" }];
  const { unbelegt } = pruefeBelege(gefaelscht, [{ path: "control-server/src/server.js" }]);
  if (!unbelegt.length) fehler.push("unbelegte Fähigkeit wurde nicht entlarvt");

  return { bestanden: fehler.length === 0, fehler };
}
