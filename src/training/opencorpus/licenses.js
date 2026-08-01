// smejj.com — Lizenz-Tor fuer offene Trainingsdatensaetze
// (Single Responsibility: Lizenz- und Herkunftsentscheidung, fail-closed).
//
// WARUM EINE EIGENE SPUR UND NICHT src/training/policy.js:
// policy.js#evaluateTrainingEligibility entscheidet ueber Erstpartei-Records aus
// dem Produktbetrieb. Es verlangt pro Record eine aufgeloeste, frische
// Einwilligung eines authentifizierten Menschen, eine Widerrufsreferenz,
// bestaetigte Repository-Rechte und zehn Qualitaets-Gates (build, typecheck,
// lint, Tests, Rollback ...). Eine Zeile aus einem oeffentlichen Datensatz hat
// nichts davon und kann es nicht haben: es gibt keinen einwilligenden Nutzer,
// kein Repository und keinen Diff. Durch policy.js gegeben wuerde JEDE Zeile
// `denied` — die Spur waere nicht streng, sondern schlicht unbenutzbar.
//
// Diese Datei lockert policy.js deshalb NICHT und ruft es auch nicht auf. Sie
// ist eine zweite, zusaetzliche Spur mit einem eigenen, ebenso fail-closed
// Massstab: statt Einwilligung zaehlt hier die nachgewiesene Lizenz, und statt
// Provider-Rechten die nachgewiesene MENSCHLICHE Urheberschaft.
//
// DIE ZWEITE FALLE, die eine reine Lizenzpruefung uebersieht:
// Die meisten bekannten "offenen" Instruktionsdatensaetze (Alpaca, ShareGPT,
// OpenHermes, WizardLM, Capybara, UltraChat, Dolphin, CodeAlpaca) tragen zwar
// eine permissive Lizenz, ihr INHALT ist aber die Ausgabe von GPT-4/ChatGPT.
// SMEJJ_1_0_TRAINING_DATA_POLICY.md verbietet "Rohantworten ... von Z.ai-,
// Kimi- oder anderen Provider-APIs". "andere Provider-APIs" schliesst OpenAI
// und Anthropic ein. Ein Apache-2.0-Aufkleber auf destilliertem Modelloutput
// macht ihn nicht zulaessig — genau wie ein Redaction-Token laut Policy
// unzulaessige Herkunft nicht zulaessig macht.
// Deshalb hat das Tor ZWEI Bedingungen: Lizenz UND menschliche Urheberschaft.

/**
 * Zulaessige Lizenzkennungen. Bewusst genau die vom Betreiber genannte Liste
 * (Apache-2.0, MIT, CC-BY) plus die eindeutig gleichwertigen BSD-Varianten und
 * CC0/Public Domain.
 *
 * NICHT enthalten und mit Absicht nicht enthalten:
 * - cc-by-sa-*: Share-Alike. Ob ein trainiertes Modell ein "abgeleitetes Werk"
 *   im Sinne der Copyleft-Klausel ist, ist ungeklaert. Ein ungeklaertes Risiko
 *   ist nach der Projektrichtlinie ein Grund zu sperren, nicht abzuwaegen.
 *   (Betrifft z. B. databricks/databricks-dolly-15k, cc-by-sa-3.0.)
 * - gpl-*, agpl-*, lgpl-*: dasselbe Copyleft-Problem, schaerfer.
 * - cc-by-nc-*: nicht-kommerziell. smejj.com ist ein kommerzielles Produkt.
 * - "other", "unknown", leer: unklare Herkunft ist gesperrt.
 */
export const ERLAUBTE_LIZENZEN = Object.freeze(new Set([
  "apache-2.0",
  "mit",
  "bsd-2-clause",
  "bsd-3-clause",
  "cc-by-4.0",
  "cc-by-3.0",
  "cc0-1.0",
  "unlicense"
]));

/**
 * Lizenzen, die ausdruecklich als GEPRUEFT UND ABGELEHNT gelten. Der
 * Unterschied zu "unbekannt" ist nicht kosmetisch: eine unbekannte Lizenz kann
 * durch Nachtragen in ERLAUBTE_LIZENZEN freigegeben werden, eine hier gelistete
 * braucht eine schriftliche Rechtsentscheidung des Betreibers.
 */
export const ABGELEHNTE_LIZENZEN = Object.freeze(new Map([
  ["cc-by-sa-3.0", "share_alike_copyleft_ungeklaert"],
  ["cc-by-sa-4.0", "share_alike_copyleft_ungeklaert"],
  ["gpl-3.0", "copyleft"],
  ["agpl-3.0", "copyleft"],
  ["lgpl-3.0", "copyleft"],
  ["cc-by-nc-4.0", "nicht_kommerziell"],
  ["cc-by-nc-sa-4.0", "nicht_kommerziell"],
  ["openrail", "nutzungsbeschraenkungen"],
  ["llama2", "anbieterlizenz_keine_freie_nutzung"],
  ["llama3", "anbieterlizenz_keine_freie_nutzung"],
  ["other", "lizenz_nicht_bestimmbar"],
  ["unknown", "lizenz_nicht_bestimmbar"]
]));

/**
 * Erlaubte Urheberschaften. "human" = von Menschen geschrieben.
 * "permissively-licensed-source-code" = echter Quelltext unter permissiver
 * Lizenz (z. B. bigcode/the-stack), ebenfalls von Menschen geschrieben.
 */
export const ERLAUBTE_URHEBERSCHAFTEN = Object.freeze(new Set([
  "human",
  "permissively-licensed-source-code"
]));

/**
 * Urheberschaften, die permanent gesperrt sind. Diese Liste ist der Grund,
 * warum das Tor nicht allein auf die Lizenz schaut.
 */
export const GESPERRTE_URHEBERSCHAFTEN = Object.freeze(new Map([
  ["model-generated", "provider_modell_ausgabe"],
  ["llm-distilled", "provider_modell_ausgabe"],
  ["gpt-generated", "provider_modell_ausgabe"],
  ["synthetic", "provider_modell_ausgabe"],
  ["unknown", "urheberschaft_nicht_belegt"]
]));

function normalisiere(wert) {
  return String(wert ?? "").trim().toLowerCase();
}

/**
 * Eine Datensatzquelle ist nur dann zulaessig, wenn Lizenz UND Urheberschaft
 * ausdruecklich positiv belegt sind. Alles andere — fehlend, leer, unbekannt,
 * widerspruechlich — ist gesperrt.
 *
 * @param {object} quelle
 * @param {string} quelle.datasetId      z. B. "OpenAssistant/oasst2"
 * @param {string} quelle.revision       unveraenderliche Revision (Commit-SHA)
 * @param {string} quelle.license        Lizenzkennung, klein geschrieben
 * @param {string} quelle.authorship     siehe ERLAUBTE_URHEBERSCHAFTEN
 * @param {string} [quelle.licenseUrl]   Beleg-Adresse
 * @returns {{erlaubt: boolean, gruende: string[], quelle: object}}
 */
export function pruefeDatensatzQuelle(quelle) {
  const gruende = [];
  const datasetId = String(quelle?.datasetId ?? "").trim();
  const revision = String(quelle?.revision ?? "").trim();
  const license = normalisiere(quelle?.license);
  const authorship = normalisiere(quelle?.authorship);

  // Ohne Kennung und unveraenderliche Revision ist die Quelle spaeter nicht
  // nachpruefbar — dann ist auch die Lizenzaussage wertlos.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(datasetId)) {
    gruende.push("dataset_id_ungueltig");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,120}$/.test(revision)) {
    gruende.push("dataset_revision_fehlt");
  }

  if (!license) {
    gruende.push("lizenz_fehlt");
  } else if (ABGELEHNTE_LIZENZEN.has(license)) {
    gruende.push(`lizenz_abgelehnt:${ABGELEHNTE_LIZENZEN.get(license)}`);
  } else if (!ERLAUBTE_LIZENZEN.has(license)) {
    gruende.push(`lizenz_nicht_auf_allowlist:${license}`);
  }

  if (!authorship) {
    gruende.push("urheberschaft_fehlt");
  } else if (GESPERRTE_URHEBERSCHAFTEN.has(authorship)) {
    gruende.push(`urheberschaft_gesperrt:${GESPERRTE_URHEBERSCHAFTEN.get(authorship)}`);
  } else if (!ERLAUBTE_URHEBERSCHAFTEN.has(authorship)) {
    gruende.push(`urheberschaft_nicht_auf_allowlist:${authorship}`);
  }

  return {
    erlaubt: gruende.length === 0,
    gruende,
    quelle: Object.freeze({
      datasetId,
      revision,
      license,
      authorship,
      licenseUrl: String(quelle?.licenseUrl ?? "").slice(0, 300)
    })
  };
}

/**
 * Einzelne Zeile eines an sich erlaubten Datensatzes.
 *
 * Auch in einem menschlich erzeugten Datensatz koennen einzelne Zeilen
 * maschinell erzeugt sein. OpenAssistant/oasst2 fuehrt dafuer ein eigenes Feld
 * `synthetic`. Wird es nicht ausgewertet, laufen Modellausgaben trotz sauberer
 * Quellpruefung ins Training — die Quellpruefung allein genuegt also nicht.
 *
 * Fail-closed: `synthetic` muss ausdruecklich `false` sein. `undefined` (Feld
 * nicht gelesen) zaehlt als synthetisch, nicht als sauber.
 */
export function pruefeZeilenHerkunft(zeile, { synthetischesFeld = "synthetic" } = {}) {
  const wert = zeile?.[synthetischesFeld];
  if (wert === false) return { erlaubt: true, gruende: [] };
  if (wert === undefined || wert === null) {
    return { erlaubt: false, gruende: ["zeile_synthetik_kennzeichen_fehlt"] };
  }
  return { erlaubt: false, gruende: ["zeile_ist_synthetisch"] };
}
