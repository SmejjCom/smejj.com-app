// smejj.com — Transparenz nach EU-KI-Verordnung (Single Responsibility: Kennzeichnung).
//
// Ab 2026-08-02 gilt die Durchsetzung. Zwei Pflichten werden hier bedient:
//   Art. 50 Abs. 1 — Menschen muessen erkennen, dass sie mit einem KI-System
//                    zu tun haben.
//   Art. 50 Abs. 2 — KI-erzeugte Inhalte sind maschinenlesbar zu kennzeichnen.
//
// Reine Datenstruktur plus Header-Bau: kein I/O, keine Abhaengigkeit auf
// Laufzeitzustand. Die Einstufungen stammen aus
// docs/compliance/EU_AI_ACT_BESTANDSVERZEICHNIS.md und
// docs/compliance/RISIKOEINSTUFUNG_MAUS_ENGINE.md — dieses Modul ist die
// maschinenlesbare Fassung derselben Aussage, damit Dokument und Laufzeit nicht
// auseinanderlaufen koennen.

export const AI_ACT_ENFORCEMENT_DATE = "2026-08-02";

/** Einstufungen. "limited" = begrenztes Risiko mit Transparenzpflicht. */
export const RISK = Object.freeze({ minimal: "minimal", limited: "limited", high: "high", prohibited: "prohibited" });

export const AI_SYSTEMS = Object.freeze([
  Object.freeze({
    id: "glm-5.2", zweck: "Chat, Codeerzeugung, Reasoning", anbieter: "Zhipu / Z.ai",
    risiko: RISK.limited, transparenzpflicht: true, protokolliert: true
  }),
  Object.freeze({
    id: "llama-4-70b", zweck: "Schnellantworten", anbieter: "Groq",
    risiko: RISK.limited, transparenzpflicht: true, protokolliert: true
  }),
  Object.freeze({
    id: "kimi-k2.7", zweck: "Reserve-Fundament", anbieter: "Moonshot",
    risiko: RISK.limited, transparenzpflicht: true, protokolliert: true
  }),
  // Ox Alpha (2026-08-30): aktives Chat-Modell über OpenRouter — nach dem
  // Drift-Befund der EU-AI-Act-Wache (Nr. 68) ins Verzeichnis aufgenommen.
  Object.freeze({
    id: "ox-alpha", zweck: "Chat-Antworten (Menü Nr. 3)", anbieter: "Stealth / OpenRouter",
    risiko: RISK.limited, transparenzpflicht: true, protokolliert: true
  }),
  Object.freeze({
    id: "cline-bridge", zweck: "Coding-Agent", anbieter: "Cline",
    risiko: RISK.limited, transparenzpflicht: true, protokolliert: true
  }),
  Object.freeze({
    id: "maus-engine-v2", zweck: "autonome Browser-Steuerung", anbieter: "smejj.com",
    risiko: RISK.limited, transparenzpflicht: true, verschaerft: true, protokolliert: true,
    einstufung: "docs/compliance/RISIKOEINSTUFUNG_MAUS_ENGINE.md"
  }),
  Object.freeze({
    id: "voice-tts-premium", zweck: "Sprachausgabe", anbieter: "smejj.com",
    risiko: RISK.limited, transparenzpflicht: true, protokolliert: true
  }),
  Object.freeze({
    id: "embed-bm25", zweck: "Suche und RAG", anbieter: "smejj.com",
    risiko: RISK.minimal, transparenzpflicht: false, protokolliert: false
  })
]);

const HINWEIS_ALLGEMEIN =
  "Diese Antwort wurde von einem KI-System erzeugt. Inhalte koennen fehlerhaft sein und "
  + "sind vor der Verwendung zu pruefen.";

const HINWEIS_MAUS_ENGINE =
  "Achtung: Ein KI-System bedient hier eigenstaendig einen Browser. Es klickt, tippt und "
  + "navigiert ohne Rueckfrage bei jedem Einzelschritt. Der Lauf laesst sich jederzeit "
  + "abbrechen; jeder Schritt wird protokolliert.";

export function findAiSystem(id) {
  const key = String(id || "").trim().toLowerCase();
  return AI_SYSTEMS.find((system) => system.id.toLowerCase() === key) || null;
}

/** Der Hinweistext fuer ein System. Die Maus-Engine bekommt den verschaerften. */
export function transparencyNotice(systemId) {
  const system = findAiSystem(systemId);
  if (system?.verschaerft) return HINWEIS_MAUS_ENGINE;
  return HINWEIS_ALLGEMEIN;
}

/**
 * Maschinenlesbare Kennzeichnung als Antwort-Header (Art. 50 Abs. 2).
 * Bewusst als Header und nicht im Text: der Text gehoert dem Nutzer, die
 * Kennzeichnung gehoert dem Protokoll. Ein Header ueberlebt Kopieren und
 * Weiterverarbeiten nicht — deshalb steht der Hinweis zusaetzlich im
 * Transparenz-Endpunkt und in der Oberflaeche.
 */
export function aiTransparencyHeaders(systemId) {
  const system = findAiSystem(systemId);
  return {
    "x-smejj-ai-generated": "true",
    "x-smejj-ai-system": system ? system.id : String(systemId || "unbekannt").slice(0, 60),
    "x-smejj-ai-risk": system ? system.risiko : RISK.limited,
    "x-smejj-ai-notice": encodeURIComponent(transparencyNotice(systemId))
  };
}

/** Der oeffentliche Transparenzbericht — Grundlage von /api/compliance/ai-systems. */
export function transparencyReport({ nowIso = new Date().toISOString() } = {}) {
  return {
    ok: true,
    plattform: "smejj.com",
    stand: nowIso,
    rechtsrahmen: {
      name: "Verordnung (EU) 2024/1689 (KI-Verordnung)",
      durchsetzungAb: AI_ACT_ENFORCEMENT_DATE,
      rolle: "Betreiber angebundener Modelle; Anbieter der eigenen Automatisierung"
    },
    hochrisiko: false,
    hochrisikoBegruendung:
      "Kein Anwendungsfall aus Anhang III: keine Biometrie, keine kritische Infrastruktur, "
      + "keine Bildungs-, Beschaeftigungs- oder Kreditentscheidungen, kein Einsatz in "
      + "Strafverfolgung, Migration oder Justiz.",
    hinweise: { allgemein: HINWEIS_ALLGEMEIN, mausEngine: HINWEIS_MAUS_ENGINE },
    systeme: AI_SYSTEMS.map((system) => ({ ...system })),
    dokumentation: [
      "docs/compliance/EU_AI_ACT_BESTANDSVERZEICHNIS.md",
      "docs/compliance/RISIKOEINSTUFUNG_MAUS_ENGINE.md"
    ],
    aufbewahrung: { dokumentation: "10 Jahre", auditLog: "10 Jahre, unveraenderlich", jobProtokolle: "90 Tage" }
  };
}
