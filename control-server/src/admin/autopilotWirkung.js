// smejj.com — Was ein Autopilot WIRKLICH tut (Master-Audit 2026-09-15).
//
// WARUM ES DIESE TABELLE GIBT: 80 von 85 Ampeln waren grün — aber 16 davon
// prüfen nur ihr eigenes Modul mit festen Beispiel-Eingaben ("2/2 Pruefungen
// bestanden"), zwei davon waren sogar still kaputt (Nr. 21, Nr. 27). Grün hieß
// dort "Baustein rechnet richtig", nicht "Funktion läuft". Der Betreiber-Auftrag
// verlangt: "Keine Funktion als OK markieren, nur weil sie sichtbar ist."
//
// Die Einstufung ist eine GEPRÜFTE Aussage über den Code (Datei:Zeile im
// Audit-Bericht docs/qa/master-audit-2026-09-15.md), keine Laufzeitmessung.
// Sie ändert keine Ampel — sie steht NEBEN ihr. Wer einen Baustein zu echter
// Arbeit ausbaut, trägt ihn hier um; der Test hält die Liste vollständig.
//
//   echt       arbeitet an Live-System oder echten Daten
//   teilweise  echte Daten, aber enger Blick (nur /health, nur Zählung, nur Empfehlung)
//   baustein   nur Selbsttest mit festen Eingaben, keine Live-Wirkung

export const WIRKUNG = Object.freeze({
  baustein: Object.freeze([
    "deep-research", "code-interpreter", "memory-sync", "self-healing", "task-orchestrator", "self-improvement",
    "smart-router", "model-lifecycle", "process-reward", "knowledge-distiller", "evolutionary-mutation",
    "multi-file-repo-architect", "live-arena-leaderboard", "instant-web-container", "realtime-voice-pair", "autonomous-git-bot"
  ]),
  teilweise: Object.freeze({
    // voice-region-check und agenten-sonde sind seit 15.09. "echt": Piper spricht,
    // Maus-Engine und Fern-Browser öffnen example.com (echteProben.js, 1× je 22 h).
    "multimodal-engine": "Bild-Maler malt 1× je 22 h ein echtes Probebild; Video-Worker nur /health (kein Kurz-Modus — jeder Auftrag malt erst ein Bild)",
    "knowledge-graph": "echter Scan, Ergebnis wird nicht weiterverwendet",
    "bug-predictor": "echter Scan, Befunde werden nicht gespeichert",
    "user-feedback-flywheel": "zählt echte Daumen, erzeugt keine Trainingspaare",
    "werkstatt-autopilot": "sammelt Aufgaben, gebaut wird von Hand",
    "angelina-autopilot": "prüft die Texte im Abbild, nicht live smejj.com",
    "selbstheilung": "wiederholt nur den Messdurchgang",
    "ai-evolution-engine": "misst meist die Autopiloten selbst; Aufgaben bleiben liegen",
    "missing-function-detector": "Konkurrenz-Stand von Hand gepflegt; Radar-Kandidaten nur als unbestätigte Hinweise",
    "rueck-roller": "empfiehlt nur, nur für den Control-Server",
    "log-wache": "nur Signale des eigenen Prozesses",
    "kosten-wache": "Tagesstand neustartfest (seit 15.09.), aber der Verbrauch der Brücke (Hauptverkehr) wird nicht gemeldet",
    "last-probe": "Last nur auf /health, nicht auf den Chat",
    "experiment-meister": "Rahmen bereit, 0 Experimente",
    "webhook-wache": "Smee ausgeschaltet",
    "modell-evolution": "zählt Zyklen, Training ruht per Beschluss"
  })
});

export function wirkungVon(id) {
  const kennung = String(id || "");
  if (WIRKUNG.baustein.includes(kennung)) return { stufe: "baustein", grund: "nur Selbsttest mit festen Eingaben, keine Live-Wirkung" };
  if (Object.hasOwn(WIRKUNG.teilweise, kennung)) return { stufe: "teilweise", grund: WIRKUNG.teilweise[kennung] };
  return { stufe: "echt", grund: "arbeitet an Live-System oder echten Daten" };
}

/**
 * Die geschlossene Verbesserungskette aus dem Betreiber-Auftrag — je Schritt, wer
 * heute zuständig ist und wo sie reißt. `luecke` ist null, wenn der Schritt trägt.
 */
export const KETTE = Object.freeze([
  { schritt: "Beobachten", ids: ["konkurrenz-radar", "realtime-internet-harvester", "fehler-faenger", "besucher-puls", "qualitaetsmessung"], luecke: null },
  { schritt: "Vergleichen", ids: ["missing-function-detector", "modell-einkaeufer"], luecke: "Radar-Kandidaten kommen nur als unbestätigte Hinweise an; bestätigt wird von Hand (Konkurrenz-Stand)" },
  { schritt: "Idee finden", ids: ["ai-evolution-engine", "modell-evolution"], luecke: "Ideen entstehen nur aus Qualitätsmängeln, nicht aus Nutzerproblemen" },
  { schritt: "Planen", ids: ["werkstatt-autopilot"], luecke: "nur Sortieren nach Dringlichkeit, kein Plan je Aufgabe" },
  { schritt: "Entwickeln", ids: [], luecke: "kein Autopilot baut — Werkstatt Station 3 läuft von Hand (Sitzung)" },
  { schritt: "Testen", ids: ["test-waechter", "synthetic-user-watchdog"], luecke: "Frontend-Tests laufen nicht im Takt" },
  { schritt: "Security-Check", ids: ["geheimnis-spaeher", "abhaengigkeits-wache", "red-team-probe", "konto-wache"], luecke: "keine Sperre je Änderung" },
  { schritt: "Staging", ids: [], luecke: "es gibt keine Staging-Umgebung (neue Kosten = Freigabe nötig)" },
  { schritt: "Eval", ids: ["qualitaetsmessung", "tiefe-spur-messung", "red-team-probe", "smejj-versions-takt"], luecke: null },
  { schritt: "Release", ids: ["bau-wache", "schutz-echtheit"], luecke: "Auslieferung per Kaskade von Hand; Autopiloten beobachten nur" },
  { schritt: "Live-Check", ids: ["brueckenwaechter", "synthetic-user-watchdog", "tuerwaechter", "web-vitals-wache", "oberflaechenwache"], luecke: null },
  { schritt: "Messen", ids: ["besucher-puls", "willkommens-wache", "abo-umsatz-wache", "kosten-wache"], luecke: "Verbrauch der Brücke (Hauptverkehr) wird nicht gemeldet" },
  { schritt: "Weiter verbessern", ids: ["modell-evolution", "experiment-meister", "rueck-roller"], luecke: "Messwerte fließen nur über rote Ampeln zurück" }
]);
