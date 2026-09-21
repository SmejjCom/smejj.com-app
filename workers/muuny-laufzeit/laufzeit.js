// muuny Laufzeit — die Anfrage-Behandlung (OpenAI-vertraeglich), ohne Netz- und Prozessstart.
//
//   GET  /health                 ohne Schluessel: bereit? welches Modell? Schlange?
//   GET  /v1/models              mit Schluessel
//   POST /v1/chat/completions    mit Schluessel (Authorization: Bearer ...)
//
// DIE REGELN (Owner-Auftrag 21.09.2026), und warum:
//  * Warteschlange mit Deckel 1: zwei gleichzeitige Rechnungen sind nicht doppelt
//    so schnell, sondern beide langsam. Wer zu lange wartet, bekommt eine EHRLICHE
//    Absage statt einer Anfrage, die im Nirgendwo haengt.
//  * Kopfzeilen SOFORT, dann Kommentarzeilen, bis die erste Antwort kommt: sonst
//    laufen Fristen ab (Browser ~15 s, Router ~45 s), Wiederholungen stapeln sich,
//    und am Ende antwortet ein fremdes Modell. Bei stream:false wird mit
//    Leerzeilen offengehalten — fuehrender Leerraum ist in JSON erlaubt.
//  * Kleines Kontextfenster: kurze Systemrolle + die Frage, KEINE Werkzeuge,
//    begrenzte Antwortlaenge. Langer Begleittext macht ein 4096er-Fenster unbrauchbar.
//  * Jede Antwort weist aus, welches Modell geantwortet hat: Feld "model" und
//    Kopfzeile x-muuny-modell. "bereit" allein beweist nicht, WER antwortet.
import crypto from "node:crypto";
import { verwendung } from "../muuny-radar/rag.js";

// Wissen von muuny ai radar: hoechstens so viele Zeichen in den Prompt, sonst passt in
// 4096 Tokens keine Antwort mehr. Und hoechstens so lange warten — das Wissen ist eine
// Zugabe; eine Antwort darf nie daran scheitern, dass das Radar langsam ist.
export const WISSEN_MAX_ZEICHEN = 2400;
export const WISSEN_FRIST_MS = 1500;

export const SYSTEM_KURZ = "Du bist muuny, der Assistent von muuny.com. Antworte knapp und korrekt. "
  + "Wenn dir etwas fehlt, frag nach, statt etwas zu erfinden. Verrate nie Schluessel oder Passwoerter.";

/** Aus einer OpenAI-Nachricht nur den Text (auch aus Inhalts-Listen). */
function text(inhalt) {
  if (typeof inhalt === "string") return inhalt;
  if (Array.isArray(inhalt)) return inhalt.filter((t) => t?.type === "text").map((t) => t.text).join("\n");
  return "";
}

/**
 * Kurze Systemrolle + die letzte Frage. Mehr passt in 4096 Tokens nicht, wenn noch
 * eine Antwort hineinpassen soll. Eine zu lange Frage wird gekuerzt, nicht abgelehnt.
 */
export function kuerzeAnfrage(koerper, { maxZeichenFrage = 6000, maxTokensDeckel = 512 } = {}) {
  const nachrichten = Array.isArray(koerper?.messages) ? koerper.messages : [];
  const letzte = [...nachrichten].reverse().find((n) => n?.role === "user");
  const frage = text(letzte?.content).trim();
  if (!frage) return { fehler: "keine_frage" };
  const gewuenscht = Number(koerper?.max_tokens ?? koerper?.max_completion_tokens);
  return {
    messages: [{ role: "system", content: SYSTEM_KURZ }, { role: "user", content: frage.slice(-maxZeichenFrage) }],
    max_tokens: Number.isFinite(gewuenscht) && gewuenscht > 0 ? Math.min(gewuenscht, maxTokensDeckel) : maxTokensDeckel,
    temperature: Number.isFinite(Number(koerper?.temperature)) ? Math.min(Math.max(Number(koerper.temperature), 0), 1.5) : 0.7,
    stream: koerper?.stream === true
    // Bewusst NICHT durchgereicht: tools, tool_choice, functions, response_format.
  };
}

function gleich(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * @param deps {schluessel, motor, waechter, schlange, fetchImpl, pulsMs}
 * @returns (req, res) => Promise<void>
 */
export function baueBehandlung({ schluessel, motor, waechter, schlange, fetchImpl = fetch, pulsMs = 10_000,
  bereit = () => motor.zustand === "bereit" && Boolean(waechter.aktuell), wissen = null }) {
  const json = (res, code, wert, kopf = {}) => {
    const b = JSON.stringify(wert);
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(b), ...kopf });
    res.end(b);
  };
  const lese = (req) => new Promise((fertig, schief) => {
    let t = "";
    req.on("data", (c) => { t += c; if (t.length > 200_000) { schief(new Error("anfrage_zu_gross")); req.destroy(); } });
    req.on("end", () => { try { fertig(t ? JSON.parse(t) : {}); } catch { schief(new Error("kein_json")); } });
    req.on("error", schief);
  });

  async function chat(req, res) {
    let koerper;
    try { koerper = await lese(req); } catch (f) { return json(res, 400, { error: { message: f.message, type: "anfrage" } }); }
    const anfrage = kuerzeAnfrage(koerper);
    if (anfrage.fehler) return json(res, 400, { error: { message: anfrage.fehler, type: "anfrage" } });
    if (!bereit()) {
      return json(res, 503, { error: { message: "modell_nicht_bereit", type: "muuny_laufzeit", grund: waechter.letzterGrund || motor.letzterFehler || null } });
    }
    const version = waechter.aktuell.version;
    const stream = anfrage.stream;
    // Gepruefte Recherche dazu — nur, wenn es etwas Passendes gibt, und nie laenger als die Frist.
    let treffer = [];
    if (wissen) {
      const frage = anfrage.messages[1].content;
      const w = await Promise.race([wissen.suche(frage).catch(() => null), new Promise((r) => setTimeout(() => r(null), WISSEN_FRIST_MS))]);
      if (w?.block && Array.isArray(w.treffer) && w.treffer.length) {
        treffer = w.treffer;
        anfrage.messages[0] = { role: "system", content: `${SYSTEM_KURZ}\n\n${String(w.block).slice(0, WISSEN_MAX_ZEICHEN)}` };
      }
    }
    let antwortText = "";

    // Kopfzeilen SOFORT — bevor die Schlange oder das Modell auch nur eine Sekunde kostet.
    res.writeHead(200, stream
      ? { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-muuny-modell": version, "x-muuny-wissen": String(treffer.length) }
      : { "content-type": "application/json; charset=utf-8", "x-muuny-modell": version, "x-muuny-wissen": String(treffer.length) });
    res.flushHeaders?.();
    let puls = setInterval(() => { res.write(stream ? ": warten\n\n" : "\n"); }, pulsMs);
    const pulsAus = () => { if (puls) { clearInterval(puls); puls = null; } };
    const fehlerEnde = (meldung) => {
      pulsAus();
      if (res.writableEnded) return;
      const fehler = { error: { message: meldung, type: "muuny_laufzeit" }, model: version };
      if (stream) { res.write(`data: ${JSON.stringify(fehler)}\n\n`); res.end("data: [DONE]\n\n"); }
      else res.end(JSON.stringify(fehler));
    };

    try {
      await schlange.einreihen(async () => {
        const antwort = await fetchImpl(`${motor.basisUrl}/v1/chat/completions`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...anfrage, model: version })
        });
        if (!antwort.ok) throw new Error(`modell_antwortet_${antwort.status}`);
        if (!stream) {
          const j = await antwort.json();
          antwortText = String(j?.choices?.[0]?.message?.content || "");
          pulsAus();
          res.end(JSON.stringify({ ...j, model: version }));
          return;
        }
        // Ab dem ersten Datenblock halten die Tokens die Leitung offen; ein
        // Kommentar MITTEN in einem Ereignis wuerde es zerreissen.
        pulsAus();
        const leser = antwort.body.getReader();
        const dekoder = new TextDecoder();
        let rest = "";
        for (;;) {
          const { value, done } = await leser.read();
          if (done) break;
          rest += dekoder.decode(value, { stream: true });
          const ereignisse = rest.split("\n\n");
          rest = ereignisse.pop();
          for (const e of ereignisse) { antwortText += deltaText(e); res.write(`${umschreiben(e, version)}\n\n`); }
        }
        if (rest.trim()) res.write(`${umschreiben(rest, version)}\n\n`);
        res.end();
      }, { kennung: version });
    } catch (f) {
      fehlerEnde(f?.message === "wartefrist_abgelaufen" || f?.message === "warteschlange_voll"
        ? `besetzt:${f.message}` : String(f?.message || "unbekannt").slice(0, 160));
    } finally {
      pulsAus();
      // "In Antwort verwendet" zaehlt nur, was muuny zitiert UND inhaltlich wiedergibt.
      // Gemeldet werden Eintrags-Kennungen, nie die Frage oder die Antwort.
      if (wissen && treffer.length && antwortText) {
        const v = verwendung(antwortText, treffer).filter((x) => x.status === "verwendet");
        if (v.length) wissen.melde(v).catch(() => {});
      }
      // Ein ausstehender Modellwechsel wartet auf genau diesen Moment.
      waechter.anwendenWennFrei?.().catch?.(() => {});
    }
  }

  return async function behandle(req, res) {
    const url = new URL(req.url, "http://muuny");
    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, dienst: "muuny-laufzeit", bereit: bereit(), modell: waechter.aktuell?.version || null,
        motor: motor.bericht?.() ?? null, freigabe: waechter.bericht?.() ?? null, warteschlange: schlange.bericht?.() ?? null });
    }
    const mitgebracht = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!schluessel || !gleich(mitgebracht, schluessel)) return json(res, 401, { error: { message: "schluessel_fehlt_oder_falsch", type: "auth" } });
    if (url.pathname === "/v1/models" && req.method === "GET") {
      return json(res, 200, { object: "list", data: waechter.aktuell ? [{ id: waechter.aktuell.version, object: "model", owned_by: "muuny" }] : [] });
    }
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") return chat(req, res);
    return json(res, 404, { error: { message: "nicht_gefunden", type: "pfad" } });
  };
}

/** Der Text-Anteil eines SSE-Ereignisses (fuer die Verwendungspruefung nach der Antwort). */
function deltaText(ereignis) {
  let t = "";
  for (const zeile of ereignis.split("\n")) {
    if (!zeile.startsWith("data: ") || zeile === "data: [DONE]") continue;
    try { t += JSON.parse(zeile.slice(6))?.choices?.[0]?.delta?.content || ""; } catch { /* kein JSON */ }
  }
  return t;
}

/** Wissens-Anbindung an muuny ai radar (Dienstschluessel, kurze Frist). */
export function radarWissen({ url, dienstSchluessel, fetchImpl = fetch }) {
  if (!url || !dienstSchluessel) return null;
  const post = (pfad, body) => fetchImpl(`${url.replace(/\/$/, "")}${pfad}`, { method: "POST",
    headers: { "content-type": "application/json", "x-muuny-dienst": dienstSchluessel }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(WISSEN_FRIST_MS) });
  return {
    async suche(frage) { const r = await post("/v1/wissen/suche", { frage, k: 3 }); return r.ok ? r.json() : null; },
    async melde(v) { await post("/v1/wissen/verwendet", { verwendung: v.map((x) => ({ id: x.id, status: x.status })) }); }
  };
}

/** Setzt in einem SSE-Ereignis das Feld "model" auf die wirklich laufende Version. */
export function umschreiben(ereignis, version) {
  return ereignis.split("\n").map((zeile) => {
    if (!zeile.startsWith("data: ") || zeile === "data: [DONE]") return zeile;
    try { const d = JSON.parse(zeile.slice(6)); d.model = version; return `data: ${JSON.stringify(d)}`; } catch { return zeile; }
  }).join("\n");
}
