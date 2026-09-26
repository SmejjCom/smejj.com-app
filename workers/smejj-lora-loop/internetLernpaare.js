// smejj.com — Lernpaare aus dem Internet (Betreiber 26.09.2026: "Soll von
// Internet trainieren" — Wahl "Beides": schneller UND Lernpaare selbst erzeugen).
//
// WAS smejj 1 HIER LERNT — und was bewusst NICHT:
// Fakten fest ins Modell zu trainieren hat es im August schlechter gemacht
// (Messnote 95,9 % -> 36,6 %). Aktuelles Wissen holt smejj 1 zur Laufzeit aus
// Websuche und Radar. Trainiert wird darum die FAEHIGKEIT: eine Frage mit einem
// Block "Gefundene Quellen" bekommen und daraus eine kurze, richtige Antwort mit
// Quellenangabe machen — und ehrlich "weiss ich nicht" sagen, wenn die Quelle
// nicht passt. Genau dieses Format bekommt smejj 1 im Betrieb
// (control-server/src/llm/schlankeAnfrage.js, kompakteFrage).
//
// QUELLEN: die meistgelesenen Wikipedia-Artikel des Vortags (Wikimedia-Feed,
// frei, ohne Schluessel, CC BY-SA 4.0) — also das, was Menschen gerade wissen
// wollen. Die Antwort schreibt gpt-oss-120b (Apache-2.0, Rechte-Register:
// erlaubt). GLM-Antworten sind verboten und kommen hier nie vor.
//
// BREMSEN: hoechstens `jeTakt` Paare je Lauf, Pause zwischen Anfragen, Abbruch
// bei 429 oder knappem Groq-Kontingent — der Live-Chat nutzt dasselbe
// Kontingent und hat Vorrang. Ziel erreicht = nichts mehr erzeugen.
import { randomUUID } from "node:crypto";
import { kompakteFrage, SCHLANKE_ROLLE } from "../../src/training/quellenFormat.js";
import { pruefePaar } from "../con-autopilot/daten.js";

export const INTERNET_PRAEFIX = "training/fragen/lernpaare-internet/";
export const INTERNET_STAND_KEY = "smejj/lernrunde/internet-stand.json";
export const INTERNET_MODELL = "openai/gpt-oss-120b";
export const QUELLEN_LIZENZ = "CC BY-SA 4.0";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const WIKI_FEED = "https://api.wikimedia.org/feed/v1/wikipedia";
const KOPF = { "User-Agent": "smejj.com Lernpaare (smejjcom@gmail.com)" };

/** Datum als JJJJ/MM/TT (UTC). */
export function feedDatum(d) {
  const x = new Date(d);
  return `${x.getUTCFullYear()}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${String(x.getUTCDate()).padStart(2, "0")}`;
}

/** Meistgelesene Artikel eines Tages als Quellen. Nur Artikel mit brauchbarem Auszug. */
export async function holeQuellen({ datum, sprache = "de", fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`${WIKI_FEED}/${sprache}/featured/${feedDatum(datum)}`, { headers: KOPF });
  if (!r.ok) return [];
  const d = await r.json().catch(() => ({}));
  return (d?.mostread?.articles || [])
    // Listen ("Liste der ...", "Deaths in 2026") taugen nicht: ihr Auszug beschreibt die Liste, nicht einen Sachverhalt.
    .filter((a) => typeof a?.extract === "string" && a.extract.length >= 200
      && !/^(Hauptseite|Main Page|Spezial:|Special:|Liste |List of |Deaths in |Nekrolog )/.test(a?.titles?.normalized || ""))
    .map((a) => ({
      titel: String(a.titles.normalized),
      text: a.extract.replace(/\s+/g, " ").trim().slice(0, 900),
      url: String(a?.content_urls?.desktop?.page || ""),
      sprache
    }));
}

const AUFTRAG = (q) => [
  "Du erzeugst EIN Lernbeispiel fuer einen kleinen Assistenten.",
  `Quelle (Wikipedia, ${q.titel}): ${q.text}`,
  "Schreibe eine natuerliche Frage, wie sie ein Mensch stellen wuerde, deren Antwort vollstaendig in der Quelle steht,",
  `und die Antwort des Assistenten: hoechstens 90 Woerter, nur Fakten aus der Quelle, in der Sprache ${q.sprache === "de" ? "Deutsch" : "Englisch"},`,
  `am Ende "(${q.sprache === "de" ? "Quelle" : "Source"}: Wikipedia – ${q.titel})". Keine Einleitung, keine Aufzaehlung von Unsicherheiten.`,
  'Antworte NUR als JSON: {"frage": "...", "antwort": "..."}'
].join("\n");

/** Ein Paar von gpt-oss. Liefert {paar} oder {stopp, grund} (Kontingent schonen). */
export async function erzeugePaar(quelle, { groqKey, fetchImpl = fetch } = {}) {
  const r = await fetchImpl(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json", connection: "close" },
    body: JSON.stringify({
      model: INTERNET_MODELL, temperature: 0.4, max_tokens: 700, reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: AUFTRAG(quelle) }]
    })
  });
  if (r.status === 429) return { stopp: true, grund: "groq_kontingent_voll" };
  if (!r.ok) return { stopp: false, grund: `groq_${r.status}` };
  const rest = Number(r.headers?.get?.("x-ratelimit-remaining-tokens"));
  const j = await r.json().catch(() => ({}));
  let daten = null;
  try { daten = JSON.parse(j?.choices?.[0]?.message?.content || ""); } catch { /* unten verworfen */ }
  return { paar: daten, knapp: Number.isFinite(rest) && rest < 3000 };
}

const inhaltsworte = (t) => new Set(String(t || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 4));

/**
 * Rein: Paar pruefen und in das Laufzeitformat bringen. Die Nutzernachricht ist
 * GENAU das, was smejj 1 im Betrieb sieht (kompakteFrage).
 */
export function baueLernpaar(quelle, roh, { jetzt = new Date().toISOString(), id = randomUUID(), fremdeQuelle = null } = {}) {
  const frage = String(roh?.frage || "").replace(/\s+/g, " ").trim();
  let antwort = String(roh?.antwort || "").trim();
  if (frage.length < 10 || frage.length > 220 || !/\?$/.test(frage)) return { ok: false, grund: "frage_form" };
  const q = fremdeQuelle || quelle;
  if (fremdeQuelle) {
    // Ehrlichkeits-Beispiel: die Quelle passt nicht zur Frage.
    antwort = quelle.sprache === "de"
      ? "Die gefundenen Quellen beantworten diese Frage nicht, darum kann ich es nicht sicher sagen."
      : "The sources I found don't answer this question, so I can't say for sure.";
  } else {
    if (antwort.length < 40 || antwort.length > 900) return { ok: false, grund: "antwort_laenge" };
    const quellWorte = inhaltsworte(quelle.text);
    let gemeinsam = 0;
    for (const w of inhaltsworte(antwort)) if (quellWorte.has(w)) gemeinsam += 1;
    if (gemeinsam < 3) return { ok: false, grund: "antwort_ohne_quellbezug" };
  }
  const zeile = `- ${q.titel}: ${q.text.slice(0, 300)} (Quelle: Wikipedia, ${q.url})`;
  // Die Quellzeile muss den Kompaktfilter bestehen wie im Betrieb — sonst lernt
  // smejj 1 ein Format, das es nie sieht. Beim Ehrlichkeits-Beispiel darf sie
  // wegfallen: dann steht dort genau "keine passende Quelle".
  // Beim Ehrlichkeits-Beispiel steht die unpassende Quelle ausdruecklich da: im
  // Betrieb kommen auch halb passende Treffer an, und genau dann soll smejj 1
  // "steht nicht drin" sagen — nicht bei Fragen ganz ohne Quellenblock.
  const nutzer = fremdeQuelle
    ? `${frage}\n\nGefundene Quellen (nur verwenden, wenn sie zur Frage passen):\n${zeile}`
    : kompakteFrage(`${frage}\n\n${zeile}`);
  if (!fremdeQuelle && !nutzer.includes("Gefundene Quellen")) return { ok: false, grund: "quelle_passt_nicht" };
  const messages = [
    { role: "system", content: SCHLANKE_ROLLE },
    { role: "user", content: nutzer },
    { role: "assistant", content: antwort }
  ];
  const pruefung = pruefePaar(messages);
  if (!pruefung.ok) return { ok: false, grund: `pruefung_${pruefung.grund}` };
  return {
    ok: true,
    satz: {
      schemaVersion: 1, id, frage, antwort, messages,
      herkunft: "internet-synthese",
      quelle: { modell: INTERNET_MODELL },
      kontext: { titel: q.titel, url: q.url, lizenz: QUELLEN_LIZENZ, sprache: q.sprache, ehrlichkeit: Boolean(fremdeQuelle) },
      erfasstAm: jetzt
    }
  };
}

export function internetSchluessel(jetzt, id) {
  const tag = String(jetzt).slice(0, 10);
  return `${INTERNET_PRAEFIX}${tag.slice(0, 4)}/${tag.slice(5, 7)}/${tag.slice(8, 10)}/${id}.json`;
}

/**
 * EIN Takt: bis zu `jeTakt` neue Paare, solange `ziel` nicht erreicht ist.
 * @returns {Promise<{erzeugt:number, verworfen:object, grund:string}>}
 */
export async function internetTakt({ e2, groqKey, jetzt = () => new Date(), fetchImpl = fetch, warte = (ms) => new Promise((r) => setTimeout(r, ms)),
  jeTakt = 6, ziel = 600, pauseMs = 20_000, ehrlichkeitsAnteil = 0.15, zufall = Math.random, log = () => {} } = {}) {
  if (!e2 || !groqKey) return { erzeugt: 0, verworfen: {}, grund: "nicht_eingerichtet" };
  const stand = (await e2.getJson(INTERNET_STAND_KEY, null)) || { erledigt: {}, anzahl: 0 };
  if (stand.anzahl >= ziel) return { erzeugt: 0, verworfen: {}, grund: "ziel_erreicht" };
  const gestern = new Date(jetzt().getTime() - 86_400_000);
  const quellen = [...await holeQuellen({ datum: gestern, sprache: "de", fetchImpl }).catch(() => []),
    ...await holeQuellen({ datum: gestern, sprache: "en", fetchImpl }).catch(() => [])]
    .filter((q) => !stand.erledigt[`${q.sprache}:${q.titel}`]);
  if (!quellen.length) return { erzeugt: 0, verworfen: {}, grund: "keine_neuen_quellen" };
  const verworfen = {};
  let erzeugt = 0;
  let grund = "takt_fertig";
  for (let i = 0; i < quellen.length && erzeugt < jeTakt; i += 1) {
    const q = quellen[i];
    stand.erledigt[`${q.sprache}:${q.titel}`] = jetzt().toISOString().slice(0, 10);
    const antwort = await erzeugePaar(q, { groqKey, fetchImpl }).catch((f) => ({ stopp: false, grund: `fehler:${String(f?.message || f).slice(0, 40)}` }));
    if (antwort.stopp) { grund = antwort.grund; break; }
    if (!antwort.paar) { verworfen[antwort.grund || "kein_json"] = (verworfen[antwort.grund || "kein_json"] || 0) + 1; continue; }
    const fremd = zufall() < ehrlichkeitsAnteil ? quellen.find((x) => x !== q && x.sprache === q.sprache) : null;
    const zeit = jetzt().toISOString();
    const lp = baueLernpaar(q, antwort.paar, { jetzt: zeit, fremdeQuelle: fremd || null });
    if (!lp.ok) { verworfen[lp.grund] = (verworfen[lp.grund] || 0) + 1; continue; }
    await e2.putJson(internetSchluessel(zeit, lp.satz.id), lp.satz);
    erzeugt += 1;
    stand.anzahl += 1;
    if (antwort.knapp) { grund = "groq_kontingent_knapp"; break; }
    if (erzeugt < jeTakt) await warte(pauseMs);
  }
  await e2.putJson(INTERNET_STAND_KEY, stand);
  log(`[smejj-lora-loop] Internet-Lernpaare: ${erzeugt} neu (gesamt ${stand.anzahl}/${ziel}), verworfen ${JSON.stringify(verworfen)}, ${grund}`);
  return { erzeugt, verworfen, grund };
}
