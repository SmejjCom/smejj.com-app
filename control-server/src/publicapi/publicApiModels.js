// smejj.com — der Modellkatalog, den EIN KUNDE sieht.
//
// Hier stehen Markennamen, keine Anbieter. Ein Kunde bestellt "smejj-1.0" und
// bekommt, was wir dafuer gerade fuer richtig halten; welches Backend das
// bedient, ist unsere Sache und wechselt (modelRouter.js entscheidet das je
// Anfrage neu, inklusive Ausweichkette). Wuerden wir "glm-5-2" nach aussen
// nennen, waere jeder Anbieterwechsel ein Bruch der Kundenschnittstelle — und
// wir haetten unsere Lieferantenliste veroeffentlicht.
//
// Die Namen bilden auf die Routing-Profile von modelRouter.js ab
// (ROUTING_PROFILES: coding, reasoning, fast, web, default).

export const PUBLIC_MODELS = Object.freeze([
  Object.freeze({
    id: "smejj-1.0",
    profil: "default",
    beschreibung: "Allzweckmodell. Die Voreinstellung, wenn nichts anderes angefragt wird."
  }),
  Object.freeze({
    id: "smejj-1.0-fast",
    profil: "fast",
    beschreibung: "Schnellspur: kurze Antwortzeit, fuer knappe Fragen und Klassifikation."
  }),
  Object.freeze({
    id: "smejj-1.0-code",
    profil: "coding",
    beschreibung: "Programmieren: tiefe Spur mit Qualitaets-Reasoning."
  }),
  Object.freeze({
    id: "smejj-1.0-reasoning",
    profil: "reasoning",
    beschreibung: "Mehrschrittiges Denken fuer Analyse und Planung."
  })
]);

export const PUBLIC_MODEL_DEFAULT = "smejj-1.0";

/** Bekanntes Kundenmodell? Leerer String = Voreinstellung, also gueltig. */
export function istPublicModel(id) {
  const wert = String(id || "").trim();
  if (!wert) return true;
  return PUBLIC_MODELS.some((modell) => modell.id === wert);
}

/** Kundenmodell -> Routing-Profil. Unbekanntes faellt NICHT still zurueck. */
export function profilFuerModell(id) {
  const wert = String(id || "").trim() || PUBLIC_MODEL_DEFAULT;
  return PUBLIC_MODELS.find((modell) => modell.id === wert)?.profil || "";
}

/** Antwortform von GET /v1/models — exakt das OpenAI-Schema. */
export function modelListePayload(erstelltSekunden = 1_755_000_000) {
  return {
    object: "list",
    data: PUBLIC_MODELS.map((modell) => ({
      id: modell.id,
      object: "model",
      created: erstelltSekunden,
      owned_by: "smejj",
      description: modell.beschreibung
    }))
  };
}
