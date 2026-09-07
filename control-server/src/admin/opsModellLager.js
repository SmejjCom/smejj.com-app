// smejj.com — Modul G2: Anbieterkette und Modell-Lager (Betriebssicht, rein lesend).
//
// Die Modelle-Seite zeigte bis 2026-09-06 nur, was in der Registry steht — also
// die Modelle, die im Chat waehlbar sind. Zwei Dinge, die den Betrieb genauso
// betreffen, fehlten darin vollstaendig:
//
//   1. DIE ANBIETERKETTE. Faellt ein Anbieter aus, uebernimmt der naechste;
//      steht die Kette bei zwei Gliedern, steht der Chat, sobald einer davon
//      hustet. Am 02.09.2026 fiel Zhipu zweimal aus und der Chat stand
//      stundenlang — bei 64 gruenen Ampeln, weil keine davon die Kettenlaenge
//      mass. Die Kette lebt in modelRouter.js und war auf keinem Bildschirm.
//
//   2. DAS MODELL-LAGER auf IDrive e2. Dort liegen zwoelf Ordner mit
//      Modelldateien. Sie kosten Speicher, sie tauchen in keiner Registry auf,
//      und ohne diese Liste weiss niemand, was davon vollstaendig ist.
//
// EHRLICHKEIT ZUR HERKUNFT: Die Kette wird bei jedem Aufruf aus der Umgebung
// GEMESSEN — sie stimmt immer. Das Lager ist ein von Hand gepflegter Messstand
// (unten LAGER_GEMESSEN_AM); e2 wird von hier aus NICHT abgefragt, denn ein
// Betriebsbildschirm darf nicht bei jedem Aufruf einen Objektspeicher listen.
// Deshalb traegt jede Lager-Antwort ihr Messdatum sichtbar mit. Ein Befund ohne
// Datum wird sonst mit der Zeit zur Behauptung — genau so stand Kimi K2.7
// zwei Monate lang als "verified-complete" im Code, waehrend der Ordner leer war.
import { PROVIDER_CATALOG } from "../llm/modelRouter.js";

/** Anbieter mit dauerhaft kostenloser Stufe (Stand 2026-09-05, Anleitung in docs/architecture/). */
const GRATIS_STUFE = Object.freeze(new Set([
  "groq", "zhipu", "gemini", "cerebras", "mistral", "openrouter", "together", "nvidia", "sambanova"
]));

/** Wann das Lager zuletzt im e2-Konto nachgesehen wurde. Bei Aenderung MITZIEHEN. */
export const LAGER_GEMESSEN_AM = "2026-09-06";

/**
 * Was am 06.09.2026 im Bucket smejj-model-files unter model-files/ lag.
 *
 * `zustand` ist bewusst dreiwertig statt "ok/kaputt":
 *   vollstaendig — Gewichte da, ladbar
 *   teilweise    — in 256-MB-Stuecke zerlegt, Ende nicht bestaetigt
 *   huelle       — nur Metadateien, keine Gewichte
 *   fehlt        — Ordner existiert nicht oder ist leer
 */
const LAGER = Object.freeze([
  { id: "Qwen3.5-4B-4bit", groesseGb: 2.83, zustand: "vollstaendig", hinweis: "Basis der eigenen Modelle" },
  { id: "microsoft_bitnet-b1.58-2B-4T", groesseGb: 1.10, zustand: "vollstaendig", hinweis: "kleinstes Modell im Lager" },
  { id: "openai_gpt-oss-20b", groesseGb: 12.80, zustand: "vollstaendig", hinweis: "mit metal- und original-Ordner" },
  { id: "Qwen3.5-2B-MLX-4bit", groesseGb: null, zustand: "vollstaendig", hinweis: "in Stuecken, Manifest teile.txt vorhanden" },
  { id: "Qwen3.8-27B-MLX-4bit", groesseGb: null, zustand: "teilweise", hinweis: "ein Stapel lief am 03.09. noch" },
  { id: "Qwen3.5-9B-MLX-4bit", groesseGb: null, zustand: "teilweise", hinweis: "Ende nicht bestaetigt" },
  { id: "google_gemma-4-26B-A4B-it", groesseGb: null, zustand: "teilweise", hinweis: "Ende nicht bestaetigt" },
  { id: "microsoft_phi-4", groesseGb: null, zustand: "teilweise", hinweis: "Ende nicht bestaetigt" },
  { id: "openai_gpt-oss-120b", groesseGb: null, zustand: "teilweise", hinweis: "config.json fehlt" },
  { id: "glm-5-2-fp8", groesseGb: 703.8, zustand: "vollstaendig", hinweis: "genutzt wird die API, nicht diese Datei" },
  { id: "zai-org_GLM-5.3", groesseGb: null, zustand: "huelle", hinweis: "6 Metadateien, Download abgebrochen" },
  { id: "smejj-1-0", groesseGb: null, zustand: "huelle", hinweis: "alte Trainingsversuche, kein fertiges Modell" },
  { id: "kimi-k2-7", groesseGb: null, zustand: "fehlt", hinweis: "554,3 GiB am 10.07. geprueft, am 06.09. leer" }
]);

/**
 * Die Anbieterkette, gemessen aus der Umgebung.
 * @returns {{gesamt:number, besetzt:number, warnung:(string|null), anbieter:Array}}
 */
export function anbieterKette({ env = process.env } = {}) {
  const anbieter = Object.keys(PROVIDER_CATALOG).map((name) => {
    const gross = name.toUpperCase();
    const variable = `SMEJJ_LLM_${gross}_API_KEY`;
    const hatSchluessel = Boolean(String(env[variable] || env[`SMEJJ_LLM_${gross}_API_KEYS`] || "").trim());
    return {
      name,
      variable,
      hatSchluessel,
      gratisStufe: GRATIS_STUFE.has(name),
      standardModell: PROVIDER_CATALOG[name]?.models?.default || null,
      basisUrl: PROVIDER_CATALOG[name]?.baseUrl || null
    };
  });

  const besetzt = anbieter.filter((a) => a.hatSchluessel).length;
  // Unter drei Gliedern ist die Kette kein Netz, sondern ein Seil. Die Zahl
  // steht hier und nicht nur in der Umgebungs-Wache, damit sie jemand sieht,
  // BEVOR der Chat steht.
  const warnung = besetzt < 3
    ? `Nur ${besetzt} von ${anbieter.length} Anbietern hat einen Schluessel — faellt einer aus, steht der Chat.`
    : null;

  return {
    gesamt: anbieter.length,
    besetzt,
    warnung,
    // Besetzte zuerst, dann die mit Gratis-Stufe: so steht oben, was traegt,
    // und direkt darunter, was ohne Geld dazukommen koennte.
    anbieter: anbieter.sort((a, b) => {
      if (a.hatSchluessel !== b.hatSchluessel) return a.hatSchluessel ? -1 : 1;
      if (a.gratisStufe !== b.gratisStufe) return a.gratisStufe ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
  };
}

/**
 * Das Modell-Lager auf e2 — ein Messstand, kein Live-Blick.
 * @returns {{gemessenAm:string, gesamt:number, vollstaendig:number, dateien:Array, hinweis:string}}
 */
export function modellLager() {
  const dateien = LAGER.map((d) => ({ ...d }));
  return {
    gemessenAm: LAGER_GEMESSEN_AM,
    gesamt: dateien.length,
    vollstaendig: dateien.filter((d) => d.zustand === "vollstaendig").length,
    teilweise: dateien.filter((d) => d.zustand === "teilweise").length,
    unbrauchbar: dateien.filter((d) => d.zustand === "huelle" || d.zustand === "fehlt").length,
    // Sortiert nach Brauchbarkeit: was laufen koennte, steht oben.
    dateien: dateien.sort((a, b) => {
      const rang = { vollstaendig: 0, teilweise: 1, huelle: 2, fehlt: 3 };
      const d = rang[a.zustand] - rang[b.zustand];
      return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
    }),
    hinweis: `Nachgesehen am ${LAGER_GEMESSEN_AM} im e2-Konto. Diese Liste wird NICHT live abgefragt — `
      + "sie ist ein Messstand und altert. Wer eine Datei loescht oder ergaenzt, muss sie hier nachziehen. "
      + "Eine Datei im Lager rechnet nichts: zum Antworten braucht sie eine GPU."
  };
}
