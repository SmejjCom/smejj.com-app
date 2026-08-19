// smejj.com control-server — der Planer-Zugang der Maus-Engine.
//
// WARUM ES DIESE DATEI GIBT (2026-08-19): mausEngineRoutes.js stand bei 938
// Zeilen und riss damit die 800-Zeilen-Regel aus AI_Guidelines.md. Der
// Planer-Zugang ist die groesste in sich geschlossene Einheit darin: Kette
// bauen, Modell rufen, Antwort pruefen, Messwerte melden. Er wird von
// mausEngineRoutes.js WEITER EXPORTIERT — tests/maus-engine-route.test.mjs
// holt ihn von dort, und der bisherige Einstieg soll gueltig bleiben.
import { resolveChain, resolveModelRequest, executeWithFallback } from "../llm/modelRouter.js";

// Je Modellversuch beim PLANEN. Die Begruendung steht unten im Rumpf, an der
// Stelle, an der die Frist wirkt.
export const PLANER_TIMEOUT_MS = 100_000;

// Der EINE modellneutrale Planer-Zugang: AI Router entscheidet das Modell
// (Default-Kette beginnt bei GLM-5.2); die Engine sieht nur Plan-JSON.
export function buildPlannerClient({ env = process.env, fetchImpl = fetch, requestedModel = "", melde = null } = {}) {
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
    const result = await executeWithFallback(chain, [{ role: "user", content: prompt }], {
      fetchImpl,
      stream: false,
      timeoutMs: PLANER_TIMEOUT_MS
    });
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
      fehlversuche: (result.attempts || []).map((a) => `${a.backend || a.name || "?"}/${a.model || "?"}: ${a.error || a.failure || "?"}`)
    });
    if (!result.ok) throw new Error("planer_nicht_erreichbar");
    const payload = await result.response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("planer_leere_antwort");
    return content;
  };
}