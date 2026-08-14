// smejj.com — Konkurrenz-Radar (Autopilot Nr. 04), jetzt mit echtem Quellenscan.
//
// WAS ER VORHER WAR (nachgesehen 2026-08-14 in workers/smejj-autopilot-jobs):
// ein Lebenszeichen. Wörtlich: "Dienst läuft planmäßig — echter Quellenscan
// noch nicht angebunden". Die Ampel war grün, gesucht wurde nie. Der eine
// Bericht in docs/konkurrenz-radar/ ist von Hand geschrieben.
//
// DIE ENTSCHEIDENDE TRENNUNG, die diese Datei trägt:
//
//   MESSUNG    ist: "Am 14.08. lieferte die Suche nach 'ChatGPT new feature'
//              diesen Treffer mit dieser Adresse und diesem Titel."
//   DEUTUNG    wäre: "ChatGPT hat jetzt Funktion X, die smejj fehlt."
//
// Das Erste kann eine Maschine belegen, das Zweite nicht. Ein Modell, das aus
// Schlagzeilen Funktionslisten destilliert, erfindet früher oder später eine —
// und der Missing-Function-Detector baut daraus eine Aufgabe, an der jemand
// arbeitet. Deshalb erzeugt der Radar KANDIDATEN mit Quelle, niemals Fakten.
// Ein Kandidat wird erst durch eine Betreiber-Entscheidung zur Funktion im
// Register (SMEJJ_FAEHIGKEITEN / KONKURRENZ_STAND).
//
// Der Radar läuft ab heute im Control-Server statt im Dienst
// smejj-autopilot-jobs — derselbe Weg, den die Voice-Region-Prüfung 2026-08-13
// gegangen ist, aus demselben Grund: der Jobs-Dienst ist von außen nicht
// erreichbar, sein Ausfall fiel zwei Tage lang niemandem auf.

import { createRecordStore } from "../admin/recordStore.js";
import { erfasseAktion } from "./aiEvolutionEngine.js";

const store = createRecordStore("evolution/radar", { maximal: 200 });
const SCHREIB_ZEITLIMIT_MS = 4_000;

/**
 * Die beobachteten Anbieter mit je EINER Suchanfrage. Bewusst wenige und
 * bewusst eng: Der Radar läuft wöchentlich, und jede Anfrage kostet
 * Suchkontingent. Wer mehr will, fügt eine Zeile hinzu — nicht zehn.
 */
export const BEOBACHTET = Object.freeze([
  { anbieter: "ChatGPT", bereich: "allgemein", anfrage: "OpenAI ChatGPT new feature announcement" },
  { anbieter: "Gemini", bereich: "allgemein", anfrage: "Google Gemini new feature announcement" },
  { anbieter: "Claude", bereich: "allgemein", anfrage: "Anthropic Claude new feature announcement" },
  { anbieter: "Perplexity", bereich: "allgemein", anfrage: "Perplexity AI new feature announcement" },
  { anbieter: "Grok", bereich: "allgemein", anfrage: "xAI Grok new feature announcement" },
  { anbieter: "Kimi", bereich: "allgemein", anfrage: "Kimi Moonshot AI new feature announcement" },

  // GEZIELTE BEREICHE (Betreiber-Auftrag 2026-08-14). Die allgemeine Suche
  // findet, was gross angekuendigt wird — sie uebersieht zuverlaessig das,
  // was in einem Nebensatz der Release Notes steht. Wer wissen will, was sich
  // bei Recherche und Stimme tut, muss danach FRAGEN.
  //
  // Anbieteruebergreifend statt je Anbieter: das kostet zwei Anfragen statt
  // zwoelf und liefert genau das Vergleichende, um das es hier geht. Der
  // Anbieter steht dann im Titel des Treffers, nicht in der Anfrage.
  { anbieter: "mehrere", bereich: "recherche", anfrage: "deep research feature update ChatGPT Gemini Perplexity Claude" },
  { anbieter: "mehrere", bereich: "audio", anfrage: "advanced voice mode update ChatGPT Gemini Grok realtime speech" }
]);

/**
 * Wörter, an denen ein Treffer WAHRSCHEINLICH von einer neuen Funktion
 * handelt. Das ist ein Vorfilter gegen Lärm, KEINE Erkennung: ein Treffer mit
 * "launches" kann trotzdem über eine Finanzierungsrunde reden. Deshalb heißt
 * das Ergebnis auch Kandidat und nicht Fund.
 */
// ENG gefasst, und das ist eine Lehre aus dem eigenen Test: Der erste Entwurf
// hatte ein blosses `new` in der Liste — und liess damit "OpenAI hires a new
// CFO" durch. Ein Radar, der Personalien als Funktionsankuendigung meldet,
// wird nach der dritten Meldung nicht mehr gelesen. "new" zaehlt deshalb nur
// noch zusammen mit einem Produktwort.
const FUNKTIONS_WORT = new RegExp(
  [
    "\\b(feature|features|capability|capabilities)\\b",
    "\\b(launch|launches|launched|launching)\\b",
    "\\bintroducing\\b",
    "\\bannounce[sd]?\\b",
    "\\bnow available\\b",
    "\\brolls? out\\b",
    "\\bnew\\s+\\w*\\s?(feature|model|mode|tool|app|version|capability)\\b"
  ].join("|"),
  "i"
);

/** Ein Treffer, auf das Nötige reduziert — und ohne Deutung. */
function alsKandidat(anbieter, treffer, jetztMs, bereich = "allgemein") {
  const url = String(treffer?.url || treffer?.href || "").slice(0, 300);
  if (!/^https?:\/\//.test(url)) return null;
  const titel = String(treffer?.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!titel) return null;
  return {
    anbieter,
    bereich,
    titel,
    url,
    auszug: String(treffer?.snippet || treffer?.text || "").replace(/\s+/g, " ").trim().slice(0, 300),
    gesehenAm: new Date(jetztMs).toISOString(),
    // AUSDRÜCKLICH: niemand hat das bestätigt. Erst eine Betreiber-Entscheidung
    // macht daraus einen Eintrag im Konkurrenz-Stand.
    bestaetigt: false
  };
}

/**
 * Ein Radar-Durchlauf. Sucht je Anbieter einmal und legt die Kandidaten ab.
 *
 * Fail-closed und ehrlich: Faellt die Suche fuer einen Anbieter aus, steht das
 * als stumme Quelle im Ergebnis — nie als "keine Neuigkeiten". Eine stumme
 * Quelle ist kein leeres Ergebnis (dieselbe Regel wie in der Werkstatt).
 *
 * @param {{suche: Function}} deps `searchWebDetailed`-kompatibel
 */
export async function fuehreRadarAus({ suche, jetztMs = Date.now(), env = process.env, fetchImpl = fetch, beobachtet = BEOBACHTET } = {}) {
  if (typeof suche !== "function") return { ok: false, grund: "keine Suchfunktion uebergeben" };

  const kandidaten = [];
  const stummeQuellen = [];
  for (const ziel of beobachtet) {
    let befund;
    try {
      befund = await suche(ziel.anfrage, { limit: 5, region: "us" });
    } catch (fehler) {
      stummeQuellen.push({ anbieter: ziel.anbieter, bereich: ziel.bereich || "allgemein", grund: String(fehler?.message || fehler).slice(0, 100) });
      continue;
    }
    const treffer = Array.isArray(befund) ? befund : (befund?.results || []);

    // DER RADAR IST SELBST EINE RECHERCHE (Betreiber-Auftrag 2026-08-14).
    // Er sucht acht Mal die Woche — und wurde dabei nie gemessen, obwohl im
    // Dashboard "recherche" als Medientyp ohne einzige Meldung stand. Ein
    // Rechercheur, der andere prueft und sich selbst nicht, ist genau die
    // Sorte blinder Fleck, gegen die diese Schicht gebaut ist.
    //
    // Der Pruefer misst hier das, was eine Recherche ausmacht: Kamen Quellen,
    // und haben sie eine Adresse? Eine Suche ohne Treffer faellt damit als
    // "quellen-fehlen" auf, statt nur als leere Zeile im Bericht.
    try {
      erfasseAktion({
        art: "recherche",
        prompt: ziel.anfrage,
        ergebnis: {
          text: treffer.map((t) => String(t?.title || "")).join("\n"),
          quellen: treffer.map((t) => ({ url: String(t?.url || t?.href || "") }))
        },
        quelle: `radar:${ziel.bereich || "allgemein"}`,
        betrifft: "konkurrenz-radar"
      });
    } catch { /* eine Messung, die den gemessenen Weg kaputtmacht, ist keine */ }

    if (!treffer.length) {
      stummeQuellen.push({ anbieter: ziel.anbieter, bereich: ziel.bereich || "allgemein", grund: "Suche lieferte keinen Treffer" });
      continue;
    }
    for (const t of treffer) {
      const titelUndText = `${t?.title || ""} ${t?.snippet || t?.text || ""}`;
      if (!FUNKTIONS_WORT.test(titelUndText)) continue;
      const kandidat = alsKandidat(ziel.anbieter, t, jetztMs, ziel.bereich || "allgemein");
      if (kandidat) kandidaten.push(kandidat);
    }
  }

  const id = `radar-${new Date(jetztMs).toISOString().slice(0, 10)}`;
  let abgelegt = false;
  let ablageGrund = null;
  try {
    await store.schreib({
      id,
      tag: id.slice(6),
      createdAt: new Date(jetztMs).toISOString(),
      kandidaten: kandidaten.slice(0, 40),
      stummeQuellen,
      hinweis: "Kandidaten sind SUCHTREFFER mit Quelle, keine bestaetigten Funktionen. "
        + "Erst eine Betreiber-Entscheidung traegt eine Funktion in den Konkurrenz-Stand ein."
    }, { env, fetchImpl, timeoutMs: SCHREIB_ZEITLIMIT_MS });
    abgelegt = true;
  } catch (fehler) {
    ablageGrund = String(fehler?.message || fehler).slice(0, 120);
  }

  return { ok: stummeQuellen.length < beobachtet.length, kandidaten, stummeQuellen, abgelegt, ablageGrund, tag: id.slice(6) };
}

/** Die zuletzt abgelegten Kandidaten — fuer das Dashboard. */
export async function holeKandidaten({ env = process.env, fetchImpl = fetch, limit = 5 } = {}) {
  try {
    const gelesen = await store.liste({ env, fetchImpl, limit });
    if (!gelesen.ok) return { ok: false, grund: gelesen.error || "Radar-Ablage nicht lesbar" };
    const saetze = gelesen.datensaetze || [];
    const jueng = saetze[0] || null;
    return {
      ok: true,
      laeufe: saetze.length,
      letzterLauf: jueng?.createdAt || null,
      kandidaten: jueng?.kandidaten || [],
      stummeQuellen: jueng?.stummeQuellen || []
    };
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

/**
 * Selbsttest: Der Radar muss aus einer bekannten Trefferliste die richtigen
 * Kandidaten ziehen — und den Laerm liegen lassen. Ohne diese Probe waere
 * "0 Kandidaten" nicht von "der Filter ist kaputt" zu unterscheiden.
 */
export const RADAR_PROBEN = Object.freeze([
  { title: "OpenAI launches new Canvas feature for ChatGPT", url: "https://example.com/a", erwartet: true },
  { title: "OpenAI raises funding round", url: "https://example.com/b", erwartet: false },
  // Aus dem eigenen Test gelernt: ein blosses "new" liess Personalien durch.
  { title: "OpenAI hires a new CFO", url: "https://example.com/d", erwartet: false },
  { title: "Introducing scheduled tasks in Gemini", url: "https://example.com/c", erwartet: true },
  { title: "Kein Titel taugt ohne Adresse", url: "nicht-http", erwartet: false }
]);

export function fuehreRadarSelbsttestAus({ jetztMs = Date.now() } = {}) {
  const fehler = [];
  for (const probe of RADAR_PROBEN) {
    const passt = FUNKTIONS_WORT.test(probe.title);
    const kandidat = passt ? alsKandidat("Probe", probe, jetztMs) : null;
    const erkannt = Boolean(kandidat);
    if (erkannt !== probe.erwartet) {
      fehler.push(`"${probe.title.slice(0, 40)}" wurde ${erkannt ? "erkannt" : "verworfen"}, erwartet war das Gegenteil`);
    }
    if (kandidat && kandidat.bestaetigt !== false) fehler.push("ein Kandidat kam als bestaetigt heraus — das darf nie passieren");
  }
  return { bestanden: fehler.length === 0, fehler, geprueft: RADAR_PROBEN.length };
}
