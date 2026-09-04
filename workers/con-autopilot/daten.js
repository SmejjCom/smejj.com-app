// con-Autopilot — Daten-Pipeline (Single Responsibility: Rohpaare -> geprueft, dedupliziert, versioniert in e2).
//
// Sammeln -> Duplikate entfernen -> Spam/Fehler/Manipulation/Prompt-Injection/
// Schluessel/personenbezogene Daten herausfiltern -> Qualitaetsbericht ->
// versioniert nach con/datasets/<name>/ (train.jsonl, manifest.json mit sha256)
// und Eintrag in con/datasets/index.json. Qualitaet vor Menge: je Antwort
// hoechstens MAX_VARIANTEN Frageformen (die Lehre vom 06.08.: 15 Formen auf
// 731 Fakten sind 731 Fakten). Die Pruefsuiten sind vom Training ausgeschlossen —
// Fragen, die einem Suitenfall wortgleich entsprechen, fliegen raus.
import { createHash } from "node:crypto";

export const MAX_VARIANTEN = 3;
const SCHLUESSEL = [/\bsk-[A-Za-z0-9_-]{12,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bxox[baprs]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(api[_-]?key|secret|token|passwort|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i];
// Telefonnummern beginnen mit + oder 0 (ISO-Datumsangaben wie 2026-07-15 sind KEINE Nummern — 1.815 Fehltreffer am 03.09.).
const PII = [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, /(?:\+|\b0)\d[\d ()\/-]{7,}\d/, /\b(IBAN|DE\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2})\b/];
const PII_AUSNAHMEN = [/@example\.(org|com|net)/i, /@verein\.example/i, /@evil\.example/i];
const INJECTION = [/ignor(e|iere)\s+(alle\s+)?(vorherigen|previous|bisherigen|all)/i, /systemanweisung/i, /\bDAN\b.*ohne regeln/i, /reveal.*(system prompt|secret)/i, /gib.*(freigabecode|api[_-]?key|passwort).*aus/i];
/** Woran eine Verweigerung erkennbar ist. Bewusst weit gefasst, aber ohne Zustimmungswoerter. */
const VERWEIGERUNG = /\b(nein|nicht|kein|keine|verweiger|lehne|unzulaessig|vertraulich|gebe .{0,20}nicht)\b/i;
const SPAM = [/(.)\1{9,}/, /(https?:\/\/\S+\s*){4,}/i];
/** Reine Zahl, Bruch oder Kommazahl — die VOLLSTAENDIGE richtige Antwort auf eine Rechenaufgabe. */
const NUR_ZAHL = /^-?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?$/;
/**
 * Ohne einen einzigen Buchstaben ist eine Antwort Muell — ausser sie ist genau so eine Zahl.
 * Die alte Fassung warf am 04.09. 8.236 korrekte Rechenantworten weg ("391" hat keine Buchstaben).
 */
function ohneInhalt(text) {
  return !/[a-zA-ZäöüÄÖÜß]/.test(text) && !NUR_ZAHL.test(String(text).trim());
}

export function hashText(t) { return createHash("sha256").update(String(t)).digest("hex"); }

function normalisiere(t) { return String(t || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim(); }

/** Prueft EIN Paar. Liefert {ok, grund}. */
export function pruefePaar(messages, { suitenFragen = new Set(), angriffeErlaubt = false, mindestAntwortLaenge = 8 } = {}) {
  if (!Array.isArray(messages) || messages.length < 2) return { ok: false, grund: "format" };
  const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const assistant = messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
  if (!user.trim() || !assistant.trim()) return { ok: false, grund: "leer" };
  // 8 Zeichen sind die richtige Schwelle fuer geerntete Prosa (dort ist "ok" Muell).
  // Bei gerechneten Aufgaben ist "391" die VOLLSTAENDIGE richtige Antwort — dort setzt
  // der Aufrufer die Schwelle herunter, weil die Richtigkeit anderweitig bewiesen ist.
  if (assistant.trim().length < mindestAntwortLaenge) return { ok: false, grund: "antwort_zu_kurz" };
  if (user.length > 6000 || assistant.length > 8000) return { ok: false, grund: "zu_lang" };
  const alles = user + "\n" + assistant;
  if (SCHLUESSEL.some((r) => r.test(alles))) return { ok: false, grund: "schluessel" };
  if (PII.some((r) => r.test(alles)) && !PII_AUSNAHMEN.some((r) => r.test(alles))) return { ok: false, grund: "personenbezogen" };
  if (INJECTION.some((r) => r.test(user))) {
    // Sicherheitsdaten brauchen den Angriff in der FRAGE — sonst lernt das Modell nie, ihn
    // abzuwehren. Erlaubt ist er nur, wenn die Antwort eine echte Verweigerung ist. Ein Paar,
    // das einer Injection FOLGT, waere Gift: genau daran ist con-1.1.0 am 03.09. gescheitert.
    if (!angriffeErlaubt) return { ok: false, grund: "prompt_injection" };
    if (!VERWEIGERUNG.test(assistant)) return { ok: false, grund: "angriff_ohne_verweigerung" };
  }
  if (SPAM.some((r) => r.test(assistant)) || ohneInhalt(assistant)) return { ok: false, grund: "spam" };
  if (/\b(TODO|FIXME|lorem ipsum|undefined|NaN)\b/.test(assistant)) return { ok: false, grund: "fehlerhaft" };
  if (suitenFragen.has(normalisiere(user))) return { ok: false, grund: "suitenfall" };
  return { ok: true, grund: null };
}

/** Rohzeilen (JSONL-Text oder Array) -> {paare, bericht}. Deterministisch (Reihenfolge der Quelle). */
export function baueDatensatz(rohZeilen, { suiten = [], maxVarianten = MAX_VARIANTEN, maxPaare = null, angriffeErlaubt = false, mindestAntwortLaenge = 8 } = {}) {
  const suitenFragen = new Set(suiten.flatMap((s) => (s.cases || []).map((c) => normalisiere(c.prompt))));
  const zeilen = Array.isArray(rohZeilen) ? rohZeilen : String(rohZeilen).split("\n").filter((z) => z.trim());
  const abgelehnt = {};
  const gesehen = new Set();
  const jeAntwort = new Map();
  const paare = [];
  let gelesen = 0;
  for (const z of zeilen) {
    gelesen += 1;
    let d;
    try { d = typeof z === "string" ? JSON.parse(z) : z; } catch { abgelehnt.json = (abgelehnt.json || 0) + 1; continue; }
    const messages = d.messages || (d.prompt && d.response ? [{ role: "user", content: d.prompt }, { role: "assistant", content: d.response }] : null);
    const p = pruefePaar(messages, { suitenFragen, angriffeErlaubt, mindestAntwortLaenge });
    if (!p.ok) { abgelehnt[p.grund] = (abgelehnt[p.grund] || 0) + 1; continue; }
    const kennung = hashText(messages.map((m) => `${m.role}:${normalisiere(m.content)}`).join("|"));
    if (gesehen.has(kennung)) { abgelehnt.duplikat = (abgelehnt.duplikat || 0) + 1; continue; }
    gesehen.add(kennung);
    const antwortKennung = hashText(normalisiere(messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n")));
    const n = jeAntwort.get(antwortKennung) || 0;
    if (n >= maxVarianten) { abgelehnt.zu_viele_varianten = (abgelehnt.zu_viele_varianten || 0) + 1; continue; }
    jeAntwort.set(antwortKennung, n + 1);
    paare.push({ messages: messages.map((m) => ({ role: m.role, content: String(m.content) })), recordId: d.recordId || kennung.slice(0, 16) });
    if (maxPaare && paare.length >= maxPaare) break;
  }
  const antwortLaengen = paare.map((p) => p.messages.filter((m) => m.role === "assistant").map((m) => m.content.length).reduce((a, b) => a + b, 0));
  const bericht = {
    gelesen, angenommen: paare.length, abgelehnt, eindeutigeAntworten: jeAntwort.size,
    antwortLaengeMittel: antwortLaengen.length ? Math.round(antwortLaengen.reduce((a, b) => a + b, 0) / antwortLaengen.length) : 0,
    maxVarianten, angriffeErlaubt, mindestAntwortLaenge, suitenFragenAusgeschlossen: suitenFragen.size,
    ok: paare.length > 0 && jeAntwort.size >= 50 && (abgelehnt.schluessel || 0) === 0 && (abgelehnt.personenbezogen || 0) < gelesen * 0.5,
    pruefungen: ["exakte_duplikate", "varianten_je_antwort", "schluessel", "personenbezogen", "prompt_injection", "spam", "fehlerhaft", "suitenfall", "laenge"]
  };
  return { paare, bericht };
}

export function jsonl(paare) { return paare.map((p) => JSON.stringify(p)).join("\n") + "\n"; }

/**
 * Deterministisch mischen. UNVERZICHTBAR: ein Trainingslauf nimmt oft nur den ANFANG der
 * Datei (Zeitgrenze). Lag der Datensatz sortiert vor, sah das Training am 04.09. genau
 * 700 Rechenaufgaben und KEIN einziges Sicherheitsbeispiel — con-1.1 verriet danach
 * prompt Geheimnisse und folgte einer Injection. Nach dem Mischen ist jeder Anfang
 * ein getreues Abbild des Ganzen.
 * Der Startwert kommt aus dem Inhalt, damit derselbe Datensatz immer dieselbe Reihenfolge hat.
 */
export function mische(paare, startwert) {
  const sw = startwert ?? Number.parseInt(hashText(String(paare.length)).slice(0, 8), 16);
  let a = sw >>> 0;
  const wuerfel = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...paare];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(wuerfel() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Datensatz nach e2 schreiben und im Index eintragen. */
export async function veroeffentliche(e2, { name, paare, bericht, quelle, kategorien = ["allgemein"], freigegeben = true }) {
  const prefix = `con/datasets/${name}`;
  const train = jsonl(mische(paare));
  const manifest = { schemaVersion: 1, name, prefix, erstellt: new Date().toISOString(), quelle, kategorien, paare: paare.length,
    dateien: [{ name: "train.jsonl", bytes: Buffer.byteLength(train), sha256: hashText(train) }], qualitaet: bericht,
    gemischt: true, freigegeben, eligibleForTraining: true };
  await e2.putText(`${prefix}/train.jsonl`, train, "application/x-ndjson");
  await e2.putJson(`${prefix}/manifest.json`, manifest);
  const index = (await e2.getJson("con/datasets/index.json", null)) || { datensaetze: [] };
  index.datensaetze = index.datensaetze.filter((d) => d.name !== name);
  index.datensaetze.push({ name, prefix, paare: paare.length, kategorien, erstellt: manifest.erstellt, freigegeben, qualitaet: { ok: bericht.ok, angenommen: bericht.angenommen, gelesen: bericht.gelesen }, sha256: manifest.dateien[0].sha256 });
  await e2.putJson("con/datasets/index.json", index);
  return manifest;
}
