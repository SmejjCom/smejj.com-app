// smejj.com control-server — Planer-Client der Maus-Engine.
// Wortgleich aus mausEngineRoutes.js ausgelagert am 2026-08-24 (800-Zeilen-
// Regel); mausEngineRoutes.js re-exportiert, die Schnittstelle ist unveraendert.
import { resolveChain, resolveModelRequest, executeWithFallback } from "../llm/modelRouter.js";

// Je Modellversuch beim PLANEN. Begruendung im Funktionskommentar unten;
// die Plattformgrenze (300 s) lebt als GATEWAY_HARTGRENZE_MS in mausEngineRoutes.js.
export const PLANER_TIMEOUT_MS = 100_000;

// RATENLIMIT DER SCHNELLEN KETTE: KURZ WARTEN STATT LANGSAM AUSWEICHEN.
//
// Gemessen 2026-09-09: Groq (openai/gpt-oss-20b, 8.000 Tokens je Minute)
// antwortet in 2–4 s, meldet aber nach einem grossen Schritt HTTP 429 mit
// "reset in 12 s". Der bisherige Weg wich sofort auf GLM-4.5-flash aus:
// 47–100 s, oft in die Zeitgrenze (502). 15 s Warten und Groq noch einmal
// fragen ist in jedem gemessenen Fall schneller. Die Zahl ist einreichbar,
// damit der Test nicht schlafen muss.
export const RATENLIMIT_WARTEZEIT_MS = 15_000;
export const RATENLIMIT_WARTEZEIT_MAX_MS = 45_000;
// Sagt der Anbieter, wann es weitergeht, gilt seine Zahl — nie unter dem
// Standard, nie ueber dem Deckel (laenger als GLM braucht, lohnt sich nicht).
export function wartezeitAus(attempts, standard = RATENLIMIT_WARTEZEIT_MS, maximum = RATENLIMIT_WARTEZEIT_MAX_MS) {
  const genannt = (attempts || []).map((a) => Number(a?.retryAfterMs)).filter((v) => Number.isFinite(v) && v > 0);
  if (!genannt.length) return standard;
  return Math.min(maximum, Math.max(standard, Math.max(...genannt) + 1000));
}

const nurRatenlimit = (attempts) => Array.isArray(attempts) && attempts.length > 0 && attempts.every((a) => a?.error === "http_429");

async function inhaltAus(result) {
  if (!result?.ok) return "";
  const payload = await result.response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

export function buildPlannerClient({
  env = process.env, fetchImpl = fetch, requestedModel = "", melde = null,
  warteMs = RATENLIMIT_WARTEZEIT_MS,
  schlafe = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  return async (prompt) => {
    const begonnen = performance.now();
    // ZWEI PROFILE HINTEREINANDER, nicht nur eines.
    //
    // BEFUND 2026-08-18: Jeder Maus-Auftrag endete mit
    // "planer_nicht_erreichbar" — obwohl /api/chat einwandfrei antwortete.
    // Grund: der Planer fragte NUR die "coding"-Kette, und deren Anbieter
    // sind auf diesem Server nicht hinterlegt. Mit einem ausdruecklich
    // genannten Modell lief derselbe Auftrag sofort durch.
    //
    // Ein Planer, der ausfaellt, weil EIN Profil unbesetzt ist, obwohl ein
    // anderes Modell bereitsteht, ist zu streng: er soll planen, nicht ein
    // bestimmtes Modell durchsetzen. Deshalb haengt die Standardkette hinten
    // an — dieselbe, mit der der Chat arbeitet.
    // SCHNELLE KETTE ZUERST — und das ist keine Bequemlichkeit.
    //
    // GEMESSEN 2026-08-18: Ein zweiteiliger Auftrag ("lies X und scrolle")
    // brauchte mit GLM-5.2 ueber 100 s und lief in die Zeitgrenze; jedes
    // Kettenglied verbrannte seine Frist, am Ende stand "nicht erreichbar".
    // Der Auftrag selbst ist mit rund 5300 Zeichen klein — es liegt nicht an
    // der Groesse, sondern am Tempo des Modells.
    //
    // Warum ein schnelles Modell hier VERTRETBAR ist: Der Plan wird danach
    // fail-closed VALIDIERT. Ein schlechter Plan wird abgelehnt und neu
    // angefordert; er kommt nie zur Ausfuehrung. Die Sicherheit haengt an der
    // Pruefung, nicht an der Groesse des Modells — anders als bei einer
    // Chat-Antwort, die der Nutzer ungeprueft liest.
    //
    // Reihenfolge: schnell (Groq) -> coding -> default. Faellt die schnelle
    // Kette aus, aendert sich nur die Wartezeit, nicht das Ergebnis.
    // resolveChain STATT resolveModelRequest — und das ist der ganze Punkt.
    //
    // GEMESSEN 2026-08-18, nachdem ein erster Versuch wirkungslos blieb:
    //   resolveModelRequest("fast") -> zhipu/glm-5.2, groq/llama-3.1-8b, zhipu
    //   resolveChain("fast")        -> groq/llama-3.1-8b, zhipu/glm-5.2
    // resolveModelRequest stellt die REGISTRY-Modelle voran (hier glm-5-2).
    // Deshalb kam Groq nie dran, obwohl es in der Anbieterliste steht und ich
    // die "schnelle Kette" bereits nach vorn gesetzt hatte: sie begann selbst
    // mit GLM. Eine Umstellung, die nichts umstellt, sieht im Code richtig aus.
    //
    // Merkregel: wer eine Reihenfolge aendert, muss sie sich AUSGEBEN lassen.
    // Zwei Zeilen Messung haetten den ersten Anlauf gespart.
    //
    // Ein ausdruecklich gewuenschtes Modell hat weiter Vorrang: dann zaehlt
    // der Wunsch, nicht das Tempo.
    const chain = [];
    const gesehen = new Set();
    const anhaengen = (backends) => {
      for (const backend of backends || []) {
        const schluessel = `${backend.name}:${backend.model || ""}`;
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        chain.push(backend);
      }
    };
    if (requestedModel) {
      anhaengen(resolveModelRequest("coding", requestedModel, env).chain);
    } else {
      anhaengen(resolveChain("fast", env));
    }
    anhaengen(resolveModelRequest("coding", requestedModel, env).chain);
    anhaengen(resolveModelRequest("default", requestedModel, env).chain);
    if (!chain.length) throw new Error("kein_planer_backend_konfiguriert");
    // ZWEITES MODELL DESSELBEN ANBIETERS NACH VORN (gemessen 10.09.):
    // Groq zaehlt sein Kontingent JE MODELL. Die Kette war
    // groq/gpt-oss-20b -> zhipu/glm-4.5-flash -> groq/gpt-oss-120b — also lag
    // hinter jedem Ratenlimit des schnellen Modells zuerst das langsame GLM
    // (47–100 s je Antwort), obwohl daneben ein freies Groq-Kontingent lag.
    // Jetzt stehen die Modelle desselben Anbieters beieinander: faellt eines
    // ins Limit, antwortet das andere in Sekunden.
    const ersterAnbieter = chain[0]?.name;
    chain.sort((a, b) => (a.name === ersterAnbieter ? 0 : 1) - (b.name === ersterAnbieter ? 0 : 1));
    // Modellneutral: KEINE feste temperature. Provider wie Moonshot/Kimi-Coding
    // erzwingen modellabhaengige Werte und lehnen andere mit HTTP 400 ab
    // (Live-Befund 2026-07-14); der Provider-Default gilt fuer jedes Modell.
    // ZEITGRENZE FUERS PLANEN, nicht fuers Plaudern.
    //
    // GEMESSEN 2026-08-18: "Lies die Ueberschrift." -> 60 s, geht.
    // "Lies die Ueberschrift der Seite und scrolle nach unten." -> 90 s,
    // scheitert. Reproduzierbar, kein Zufall und keine Drosselung.
    //
    // Ursache: der Modellaufruf bricht nach SMEJJ_LLM_TIMEOUT_MS ab, und der
    // Standard ist 45 s. Das reicht fuer eine Chat-Antwort — ein Plan ist ein
    // vollstaendiges JSON-Dokument mit Schritten, Selektoren und Policy, und
    // schon eine zweiteilige Aufgabe braucht laenger. Jeder Kettenglied-
    // Versuch kostete dann seine 45 s, bis am Ende "nicht erreichbar" stand.
    //
    // 100 s je Versuch: bei zwei Kettengliedern sind das 200 s und damit
    // sicher unter der Plattformgrenze von 300 s, ab der die Verbindung
    // gekappt wird (siehe GATEWAY_HARTGRENZE_MS oben). Eine Zahl, die den
    // Aufruf ueberleben laesst, aber nicht die Antwort verhindert.
    const nachricht = [{ role: "user", content: prompt }];
    const optionen = {
      fetchImpl,
      stream: false,
      timeoutMs: PLANER_TIMEOUT_MS,
      // DENKEN AUS: der Planer liefert ein JSON-Objekt, keinen Aufsatz. GLM
      // denkt sonst standardmaessig mit — gemessen 2026-09-09: 47 s statt
      // 37 s fuer denselben kleinen Prompt. Anbieter ohne den Schalter
      // bekommen ihn nicht (backendSupportsThinking im Router).
      thinking: { type: "disabled" }
    };
    const versuche = [];
    const frage = async (kette) => {
      const r = await executeWithFallback(kette, nachricht, optionen);
      versuche.push(...(r.attempts || []));
      return r;
    };
    // Das ERSTE Glied ist das schnelle. Meldet es nur ein Ratenlimit, wird
    // kurz gewartet und dasselbe Glied noch einmal gefragt, bevor die
    // langsamen Glieder drankommen (Begruendung bei RATENLIMIT_WARTEZEIT_MS).
    // ERST AUSWEICHEN, DANN WARTEN. Bis 10.09. schlief der Planer 15–45 s vor
    // dem ersten Glied, ehe er das zweite ueberhaupt fragte — Wartezeit, die
    // es nicht brauchte, solange irgendein anderes Modell frei war. Gewartet
    // wird nur noch, wenn die GANZE Kette im Ratenlimit steckt.
    let result = await frage(chain);
    if (!result.ok && nurRatenlimit(versuche)) {
      await schlafe(wartezeitAus(versuche, warteMs));
      result = await frage(chain);
    }
    let content = await inhaltAus(result);
    // LEERE ANTWORT IST EIN FEHLVERSUCH, KEIN ERGEBNIS. Gemessen 2026-09-09:
    // gpt-oss-20b lieferte bei grossem Prompt HTTP 200 mit leerem content
    // (nur "reasoning") — bisher sofort 502 "planer_leere_antwort", ohne die
    // Kette weiter zu fragen. Einmal die ganze Kette noch einmal.
    if (result.ok && !content) {
      versuche.push({ backend: result.backend, model: result.model, error: "leere_antwort" });
      result = await frage(chain);
      content = await inhaltAus(result);
    }
    // WER hat geantwortet und wie lange hat es gedauert? Ohne diese Auskunft
    // ist jede Tempo-Frage Kaffeesatz: executeWithFallback WEISS es, sagte es
    // aber niemandem. Am 2026-08-18 stand deshalb die Frage im Raum, ob
    // ueberhaupt Groq antwortet — beantworten liess sie sich nicht.
    melde?.({
      backend: result.backend || null,
      model: result.model || null,
      ms: Math.round(performance.now() - begonnen),
      // Fehlversuche kosten die volle Zeitgrenze. Zwei davon erklaeren eine
      // Minute Wartezeit vollstaendig.
      fehlversuche: versuche.map((a) => `${a.backend || a.name || "?"}/${a.model || "?"}: ${a.error || a.failure || "?"}`)
    });
    if (!result.ok) throw new Error("planer_nicht_erreichbar");
    if (!content) throw new Error("planer_leere_antwort");
    return content;
  };
}

