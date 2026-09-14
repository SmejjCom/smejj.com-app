// smejj.com — Modell-Katalog-Wache (Autopilot Nr. 62): fragt einmal täglich
// die /models-Endpunkte aller Anbieter mit gesetztem Schlüssel und prüft, ob
// die Modelle, die der Router WIRKLICH wählen würde (Katalog + Env-Overrides,
// alle Profile), dort noch existieren.
//
// WARUM ES SIE GIBT: Groqs Llama-Einträge starben beim Anbieter (jeder Aufruf
// HTTP 404), der Katalog zeigte tagelang auf tote Namen — und weil zwei
// verschiedene Modellnamen denselben Fehler gaben, sah es nach einem kaputten
// Schlüssel aus. Der /models-Endpunkt trennt "Modell weg" von "Schlüssel
// kaputt" in einem Aufruf (Vorlage: scripts/diagnose/groq-zugang-pruefen.mjs).
//
// EHRLICH GEMESSEN: Ein Anbieter ohne /models-Endpunkt ist "nicht prüfbar"
// und wird in der Meldung BENANNT, macht aber nicht dauerhaft rot — rot ist
// nur ein NACHWEISLICH fehlendes Modell (es steht nicht in der gelieferten
// Liste) oder eine Lage, in der gar nichts messbar war.
import { createRecordStore } from "../admin/recordStore.js";
import {
  PROVIDER_CATALOG, ROUTING_PROFILES,
  providerBackendFromEnv, openrouterBackendFromEnv
} from "../llm/modelRouter.js";

const ABFRAGE_ABSTAND_MS = 24 * 60 * 60 * 1000;
// Eine gescheiterte Nachpruefung eines roten Ablage-Stands wird fruehestens
// nach dieser Frist wiederholt; hoechstens so viele Kleinstanfragen je Tageslauf.
const NACHPRUEF_ABSTAND_MS = 6 * 60 * 60 * 1000;
const PROBEN_DECKEL = 5;
const ABLAGE_ID = "modell-katalog-stand";

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("modelle/katalog", { maximal: 10 });
  return ablageStandard;
}

/**
 * Die Modelle, die der Router für einen Anbieter je Profil WIRKLICH wählen
 * würde — inklusive Env-Overrides. Genau diese Namen müssen leben; den
 * rohen Katalog zu prüfen wäre die falsche Frage.
 * @returns {string[]} eindeutige Modell-Kennungen
 */
export function gewaehlteModelle(name, env) {
  const modelle = new Set();
  for (const profil of ROUTING_PROFILES) {
    const backend = name === "openrouter"
      ? openrouterBackendFromEnv(env, profil)
      : providerBackendFromEnv(name, env, profil);
    if (backend?.model) modelle.add(backend.model);
  }
  return [...modelle];
}

/**
 * Vergleicht gewählte Modelle mit der gelieferten /models-Liste.
 * Getrennt testbar — der Kern der Wache.
 * @param {string[]} modelle was der Router wählen würde
 * @param {Iterable<string>} verfuegbar Modell-Kennungen des Anbieters
 * @returns {string[]} die nachweislich fehlenden Kennungen
 */
export function fehlendeModelle(modelle = [], verfuegbar = []) {
  const vorhanden = new Set(verfuegbar);
  return modelle.filter((m) => !vorhanden.has(m));
}

/** Selbsttest: ein fehlendes Modell MUSS auffallen, ein vorhandenes nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = fehlendeModelle(["lebt", "tot-seit-gestern"], ["lebt", "anderes"]);
  if (kaputt.length !== 1 || kaputt[0] !== "tot-seit-gestern") {
    fehler.push(`kaputte Probe: ${JSON.stringify(kaputt)} statt ["tot-seit-gestern"]`);
  }
  const gesund = fehlendeModelle(["lebt"], ["lebt", "anderes"]);
  if (gesund.length !== 0) fehler.push("gesunde Probe erzeugt fälschlich Funde");
  const leer = fehlendeModelle([], []);
  if (leer.length !== 0) fehler.push("leere Wahl erzeugt fälschlich Funde");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Fragt GET {baseUrl}/models (OpenAI-kompatible Form: data[].id).
 * @returns {Promise<{ids: string[]} | {unpruefbar: string}>}
 */
export async function frageModelle(backend, { fetchImpl = fetch } = {}) {
  let antwort;
  try {
    antwort = await fetchImpl(`${backend.baseUrl}/models`, {
      headers: { [backend.apiKeyHeader]: `Bearer ${backend.apiKey}` },
      signal: AbortSignal.timeout(15_000)
    });
  } catch (f) {
    return { unpruefbar: `Netz: ${String(f?.message || f).slice(0, 60)}` };
  }
  if (!antwort.ok) return { unpruefbar: `HTTP ${antwort.status} auf /models` };
  let daten;
  try { daten = await antwort.json(); } catch { return { unpruefbar: "Antwort ist kein JSON" }; }
  const ids = (Array.isArray(daten?.data) ? daten.data : [])
    .map((m) => String(m?.id || "").trim())
    .filter(Boolean);
  if (!ids.length) return { unpruefbar: "Liste leer oder fremdes Format" };
  return { ids };
}

/**
 * Bestätigt ein Modell, das in /models FEHLT, mit der kleinstmöglichen echten
 * Anfrage (max_tokens 1). Warum: der Zhipu-Coding-Endpunkt listet glm-4.5-flash
 * (Freikontingent) nicht in /models, antwortet aber — gemessen 2026-09-14
 * (HTTP 200, reasoning_content kommt). Die Wache stand deshalb seit dem 08.09.
 * auf Rot, während jede echte Anfrage bedient wurde. Ein Katalog, der lückenhaft
 * ist, darf keine Ampel färben — nur eine Anfrage, die wirklich scheitert.
 * @returns {Promise<{antwortet: boolean, grund: string}>}
 */
export async function bestaetigeModell(backend, modell, { fetchImpl = fetch } = {}) {
  try {
    const antwort = await fetchImpl(`${backend.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { [backend.apiKeyHeader]: `Bearer ${backend.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modell, messages: [{ role: "user", content: "ok" }], max_tokens: 1 }),
      // 8 s reichen fuer ein Token; 20 s je Modell haetten einen Lauf mit
      // lueckenhaftem Katalog minutenlang aufgehalten (Review 14.09.).
      signal: AbortSignal.timeout(8_000)
    });
    if (antwort.ok) return { antwortet: true, grund: "" };
    return { antwortet: false, grund: `HTTP ${antwort.status}` };
  } catch (f) {
    return { antwortet: false, grund: `Netz: ${String(f?.message || f).slice(0, 60)}` };
  }
}

/** Die Anbieter, die mit dem gegebenen Env wirklich aktiv wären. */
export function aktiveAnbieter(env) {
  const namen = Object.keys(PROVIDER_CATALOG)
    .filter((name) => providerBackendFromEnv(name, env) !== null);
  if (openrouterBackendFromEnv(env)) namen.push("openrouter");
  return namen;
}

/**
 * Der Lauf im Takt: Selbsttest, dann täglich die echte Abfrage; dazwischen
 * der gemessene Stand aus der Ablage (Bauart der Abhängigkeits-Wache).
 */
export async function laufModellKatalogWache({ mitNetz = true, ablage = null, fetchImpl = fetch, jetztMs = Date.now(), env = process.env } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Modell-Katalog-Wache besteht den Selbsttest nicht: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeAblage(ablage);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* unten neu gemessen */ }
  const standAlterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;

  if (Number.isFinite(standAlterMs) && standAlterMs < ABFRAGE_ABSTAND_MS && stand) {
    const stunden = Math.round(standAlterMs / 3_600_000);
    if (stand.fehlend > 0) {
      // Ein Rot aus der Ablage wird NACHGEPRUEFT, bevor es gemeldet wird: das
      // Beispiel-Modell bekommt die Kleinstanfrage. Antwortet es, war der
      // Katalog lueckenhaft (Zhipu 08.–14.09.), und der Stand wird sofort
      // korrigiert — sonst bliebe die Ampel bis zur naechsten Tagesabfrage rot.
      // Review-Befunde 14.09.: (1) nur bei GENAU EINEM fehlenden Modell — bei
      // mehreren kennt die Ablage nur das Beispiel, die uebrigen blieben
      // ungeprueft und wuerden fuer lebendig erklaert; (2) eine gescheiterte
      // Nachpruefung wird vermerkt und fruehestens nach NACHPRUEF_ABSTAND_MS
      // wiederholt, statt in jedem Takt das tote Modell anzufragen.
      const beispiel = String(stand.beispiel || "");
      const [anbieterName, ...rest] = beispiel.split(":");
      const modellName = rest.join(":").replace(/ \(.*\)$/, "");
      const kennung = `${anbieterName}:${modellName}`;
      const zuletztMs = Date.parse(stand.nachgeprueft || 0);
      const wiederFaellig = !Number.isFinite(zuletztMs) || jetztMs - zuletztMs >= NACHPRUEF_ABSTAND_MS;
      if (mitNetz && stand.fehlend === 1 && anbieterName && modellName && wiederFaellig) {
        const backend = anbieterName === "openrouter" ? openrouterBackendFromEnv(env) : providerBackendFromEnv(anbieterName, env);
        if (backend) {
          const probe = await bestaetigeModell(backend, modellName, { fetchImpl });
          if (probe.antwortet) {
            try {
              await speicher.schreib({ ...stand, id: ABLAGE_ID, fehlend: 0, beispiel: "", ungelistet: [stand.ungelistet, kennung].filter(Boolean).join(", "), nachgeprueft: new Date(jetztMs).toISOString() });
            } catch { /* die Meldung unten stimmt auch ohne Ablage */ }
            return { ok: true, meldung: `Nachgeprüft: ${kennung} fehlt in /models, antwortet aber (Stand vor ${stunden} h korrigiert)` };
          }
          try { await speicher.schreib({ ...stand, id: ABLAGE_ID, nachgeprueft: new Date(jetztMs).toISOString() }); } catch { /* still */ }
        }
      }
      return { ok: false, meldung: `${stand.fehlend} gewählte(s) Modell(e) beim Anbieter verschwunden — Stand vor ${stunden} h, z. B. ${String(stand.beispiel || "").slice(0, 60)}` };
    }
    return { ok: true, meldung: `Abfrage aktuell (vor ${stunden} h): ${stand.geprueft} Modell(e) bei ${stand.anbieter} Anbieter(n) bestätigt${stand.ungelistet ? `; nicht in /models gelistet, antwortet aber: ${stand.ungelistet}` : ""}${stand.unpruefbar ? `; nicht prüfbar: ${stand.unpruefbar}` : ""}` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: "Abfrage fällig — läuft im nächsten Netz-Takt" };
  }

  const namen = aktiveAnbieter(env);
  if (!namen.length) {
    // Ohne einen einzigen Anbieter-Schlüssel ist die Katalog-Kette leer und
    // ungenutzt (fail-closed des Routers) — es gibt nichts zu prüfen.
    return { ok: true, meldung: "Kein Anbieter-Schlüssel gesetzt — Katalog-Kette ist leer und ungenutzt, nichts zu prüfen" };
  }

  const fehlend = [];
  const unpruefbar = [];
  const ungelistet = [];
  let geprueft = 0;
  let proben = 0;
  for (const name of namen) {
    const backend = name === "openrouter" ? openrouterBackendFromEnv(env) : providerBackendFromEnv(name, env);
    const modelle = gewaehlteModelle(name, env);
    const ergebnis = await frageModelle(backend, { fetchImpl });
    if (ergebnis.unpruefbar) {
      unpruefbar.push(`${name} (${ergebnis.unpruefbar})`);
      continue;
    }
    geprueft += modelle.length;
    for (const m of fehlendeModelle(modelle, ergebnis.ids)) {
      // Nicht gelistet ist noch nicht tot: erst die echte Anfrage entscheidet.
      // Deckel je Lauf: liefert ein Anbieter /models leer, sollen nicht alle
      // gewaehlten Modelle einzeln angefragt werden (Review 14.09.).
      if (proben >= PROBEN_DECKEL) { fehlend.push(`${name}:${m} (ungeprüft, Deckel ${PROBEN_DECKEL})`); continue; }
      proben += 1;
      const probe = await bestaetigeModell(backend, m, { fetchImpl });
      if (probe.antwortet) ungelistet.push(`${name}:${m}`);
      else fehlend.push(`${name}:${m} (${probe.grund})`);
    }
  }

  if (geprueft === 0 && unpruefbar.length === namen.length) {
    return { ok: false, meldung: `Kein Anbieter war prüfbar (${unpruefbar.join("; ")}) — die Wache hat nichts gemessen` };
  }
  try {
    await speicher.schreib({
      id: ABLAGE_ID,
      createdAt: new Date(jetztMs).toISOString(),
      anbieter: namen.length - unpruefbar.length,
      geprueft,
      fehlend: fehlend.length,
      beispiel: fehlend[0] || "",
      ungelistet: ungelistet.join(", "),
      unpruefbar: unpruefbar.join("; ")
    });
  } catch { /* die Meldung unten trägt die Zahlen auch ohne Ablage */ }
  if (fehlend.length) {
    return { ok: false, meldung: `${fehlend.length} gewählte(s) Modell(e) beim Anbieter verschwunden: ${fehlend.slice(0, 3).join(", ")}${unpruefbar.length ? `; nicht prüfbar: ${unpruefbar.join("; ")}` : ""}` };
  }
  return { ok: true, meldung: `${geprueft} gewählte(s) Modell(e) bei ${namen.length - unpruefbar.length} Anbieter(n) bestätigt${ungelistet.length ? `; nicht in /models gelistet, antwortet aber: ${ungelistet.join(", ")}` : ""}${unpruefbar.length ? `; nicht prüfbar: ${unpruefbar.join("; ")}` : ""}` };
}
