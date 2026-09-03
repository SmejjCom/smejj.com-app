// smejj.com — Modul AP: die Bereiche, in denen die Autopiloten auf der Seite
// stehen (Design-Vorschlag "Adminbereich" vom 26.06./15.08.2026, uebernommen
// am 2026-08-23).
//
// WARUM BEREICHE STATT NUMMERN: "Bei einer Stoerung sucht man nach dem
// Bereich, nicht nach der Nummer." 42 Zeilen untereinander sind eine Liste,
// keine Uebersicht. Die Nummer bleibt als Feld erhalten (Notizen, Zettel).
//
// Die Zuordnung wohnt HIER und nicht in der Registry, damit die 800-Zeilen-
// Regel haelt und die Frage "wo steht was" an einer Stelle beantwortet ist.
// Jede Kennung der Registry MUSS hier vorkommen — der Test erzwingt es.

export const BEREICHE = Object.freeze([
  "Antwortqualität & Sprache",
  "Code & Bauen",
  "Sicherheit & Wachdienst",
  "Modelle & Wissen",
  "Medien & Sprache",
  "Betrieb & Auslieferung"
]);

const ZUORDNUNG = Object.freeze({
  "Antwortqualität & Sprache": [
    "antwort-tuev", "angelina-autopilot", "process-reward", "user-feedback-flywheel",
    "self-improvement", "self-healing", "ai-evolution-engine", "autopilot-supervisor"
  ],
  "Code & Bauen": [
    "werkstatt-autopilot", "autonomous-git-bot", "instant-web-container",
    "multi-file-repo-architect", "code-interpreter", "task-orchestrator", "knowledge-graph"
  ],
  "Sicherheit & Wachdienst": [
    "nachweis-kette", "synthetic-user-watchdog", "bug-predictor", "evolutionary-mutation",
    "brueckenwaechter", "container-puls", "support-sla", "oberflaechenwache", "selbstheilung", "sync-waechter",
    // Nr. 44-54 (2026-08-24): der Schutz-Block aus dem 135-Piloten-Vergleich.
    "rueck-roller", "log-wache", "daten-sicherung", "wiederherstellungs-probe",
    "geheimnis-spaeher", "zertifikats-wache", "missbrauchs-wache", "konto-wache",
    "inhalts-schutz", "abhaengigkeits-wache",
    // Nr. 67+68 (2026-08-30): Fristen- und Bestands-Wächter — Recht ist Wachdienst.
    "dsgvo-fristen", "ai-act-wache",
    // Nr. 61 (2026-08-24): taegliche Unit-Tests des Control-Servers (Mac-Cron).
    "test-waechter",
    // Nr. 73 (2026-09-03, Audit): der Tuerwaechter lief seit 14.08. ohne Registry-Eintrag.
    "tuerwaechter"
  ],
  // (Nr. 63/64 stehen unten bei "Betrieb & Auslieferung" — Performance und Speicher sind Betriebsfragen.)
  "Modelle & Wissen": [
    // Nr. 62 (2026-08-24): taeglicher /models-Abgleich gegen die Router-Wahl.
    "modell-katalog-wache",
    "modell-einkaeufer", "live-arena-leaderboard", "knowledge-distiller", "model-lifecycle",
    "realtime-internet-harvester", "smart-router", "memory-sync", "missing-function-detector",
    "konkurrenz-radar", "training-loop",
    // Nr. 65 (2026-08-26): die Reife der Trainingsdaten gehört zu den Modellen.
    "trainings-reife",
    // Nr. 72 (2026-09-03): der Modell-Evolutions-Takt — Messen, Schwaeche, Tore, Zyklus-Protokoll.
    "modell-evolution"
  ],
  "Medien & Sprache": [
    "realtime-voice-pair", "multimodal-engine", "deep-research", "voice-region-check"
  ],
  "Betrieb & Auslieferung": [
    "codeberg-spiegel", "qualitaetsmessung", "autopilot-laeufer", "evolution-ablage",
    // Nr. 50, 55-60 (2026-08-24): Nutzersicht, Kosten, Last, Wachstum, Mappe.
    "fehler-faenger", "kosten-wache", "last-probe", "auffindbarkeits-wache",
    "willkommens-wache", "experiment-meister", "tagesmappe",
    // Nr. 63/64 (2026-08-24, Optimierungs-Runde): Web-Vitals-Budgets und Paket-Fuellstand.
    "web-vitals-wache", "speicher-wache",
    // Nr. 66/69/70 (2026-08-30): Mail-Zustellung, Umsatz-Seite, Flags — Betriebsfragen.
    "email-zustell", "abo-umsatz-wache", "flaggen-wache",
    // Nr. 71 (2026-09-02): die Zeabur-Umgebung selbst — Coding-Adresse und Pflichtschluessel.
    "umgebungs-wache"
  ]
});

const BEREICH_VON_ID = new Map();
for (const [bereich, ids] of Object.entries(ZUORDNUNG)) {
  for (const id of ids) BEREICH_VON_ID.set(id, bereich);
}

/** Der Bereich einer Kennung; unbekannte landen sichtbar in "Betrieb & Auslieferung". */
export function bereichVon(id) {
  return BEREICH_VON_ID.get(String(id)) || BEREICHE[BEREICHE.length - 1];
}

/** Fuer den Test: Kennungen, die in der Zuordnung stehen. */
export function zugeordneteKennungen() {
  return [...BEREICH_VON_ID.keys()];
}
