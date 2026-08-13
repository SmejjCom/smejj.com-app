// smejj.com — Video-Spur der Control-Reserve (/api/chat).
//
// Befund docs/video/BEFUND_CONTROL_SPUR_RUFT_WORKER_NICHT.md (2026-08-13): die
// Reserve hatte keine im Git nachvollziehbare Videospur — ein Arbeitskopie-
// Release renderte parallax selbst und liess den fertigen Weg-C-Stack im
// Video-Worker (fal.ai LTX, Betreiber-Freigabe + gesetzter Schluessel) links
// liegen. Diese Datei ist der Anschluss: derselbe Worker-Vertrag wie in der
// Bruecke (public/chat-bridge-bilder.js — versucheVideo/erzeugeVideoMitGeduld).
//
// Grundsaetze:
// - Fail-safe: solange kein Byte gesendet wurde, liefert handle() false und
//   /api/chat laeuft unveraendert als Text-Antwort weiter.
// - Fail-closed beim Personenschutz: die Uebersetzung traegt den
//   PERSON_GESPERRT-Filter; scheitert sie, entsteht KEIN Video (ehrliche
//   Meldung statt ungefiltertem Weg).
// - Kein eigener parallax-Rueckfall: der Worker faellt intern selbst zurueck.

// Erkennung wortgleich zur Bruecke: Video-Verb UND Video-Motivwort.
const VIDEO_VERB = /\b(zeichne|zeichnen|zeichen|zeichene|zeig|zeige|zeigen|male|malen|erstelle|erstellen|erstell|generiere|generieren|generier|erzeuge|erzeugen|erzeug|mach|mache|machen|bau|bauen|draw|paint|generate|create|make|produce|kannst|kann|moechte|möchte|will)\b/i;
const VIDEO_MOTIV = /\b(video(s)?|film(e|s)?|animation(en)?|clip(s)?|mp4|movie(s)?)\b/i;
const WISSENSFRAGE = /\b(unterschied|was ist|wie geht|bedeutung|erkläre|erklare|definition)\b/i;
// MP4-Deckel wie in der Bruecke — muss zum MAX_B64 des Workers passen.
const VIDEO_MAX_B64 = 8_000_000;
const PERSONEN_ABSAGE = "Aus Rücksicht auf Persönlichkeitsrechte male ich keine realen, erkennbaren Personen. Gern male ich dir eine frei erfundene Person oder eine andere Szene — beschreib sie mir einfach.";

export function istVideoAuftrag(task) {
  const text = String(task || "").trim();
  if (!text || text.length > 600) return false;
  if (WISSENSFRAGE.test(text)) return false;
  return VIDEO_MOTIV.test(text) && (VIDEO_VERB.test(text) || /\b(von|zu|aus|mit|über|ueber|eines|ein|eine|einen)\b/i.test(text));
}

// Nur eine data:-Quelle aus gepruefter Worker-Antwort — fremde Adressen haben
// in einer Assistenten-Antwort nichts verloren (wie sichereVideoAntwort der
// Bruecke).
export function sichereVideoQuelle(daten) {
  const b64 = String(daten?.b64 || "");
  const format = String(daten?.format || "");
  if (!daten?.ok || !b64 || b64.length > VIDEO_MAX_B64) return "";
  if (!/^(?:mp4|webm)$/.test(format) || !/^[A-Za-z0-9+/=]+$/.test(b64)) return "";
  return `data:video/${format};base64,${b64}`;
}

// Ehrlich sagen, WAS sich bewegt: nur die CPU-Engines bewegen bloss die
// Kamera. extern:* (LTX) bewegt das Motiv selbst — dann KEIN Kamerafahrt-Satz.
export function videoHinweis(engine, ton = false) {
  const name = String(engine || "");
  const stimme = ton ? " Erzählt von der Stimme von smejj 1.0." : "";
  if (name.startsWith("parallax")) {
    return `\n\n*Räumliche Kamerafahrt durch ein gemaltes Bild: Vorder- und Hintergrund bewegen sich gegeneinander, das Motiv selbst bleibt ruhig.${stimme}*`;
  }
  if (name.startsWith("kenburns")) {
    return `\n\n*Bewegte Szene aus einem gemalten Bild: die Kamera fährt, das Motiv selbst bleibt ruhig.${stimme}*`;
  }
  return ton ? `\n\n*${stimme.trim()}*` : "";
}

export function createVideoChatRoutes({ env, securityHeaders = {}, resolveModelRequest, executeWithFallback }) {
  const workerUrl = String(env.SMEJJ_VIDEO_WORKER_URL || "http://smejj-video-worker.zeabur.internal:8080").replace(/\/+$/, "");
  const workerKey = env.SMEJJ_VIDEO_WORKER_KEY || "";
  const timeoutMs = Number(env.SMEJJ_VIDEO_TIMEOUT_MS || 180_000);
  const warteMaxMs = Number(env.SMEJJ_VIDEO_WARTE_MAX_MS || 120_000);
  const warteTaktMs = Number(env.SMEJJ_VIDEO_WARTE_TAKT_MS || 5_000);

  async function workerBereit() {
    if (!workerUrl) return false;
    try {
      const antwort = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(2500) });
      if (!antwort.ok) return false;
      return (await antwort.json())?.bereit === true;
    } catch {
      return false;
    }
  }

  // Sammelt eine kurze Modellantwort aus dem SSE-Strom des Routers ein.
  // Alle angebundenen Anbieter sprechen das OpenAI-Streamformat
  // (choices[0].delta.content) — dasselbe, worauf sich streamFilter verlaesst.
  async function frageModell(systemPrompt, nutzerPrompt) {
    try {
      const { chain } = resolveModelRequest("default", "", env);
      if (!chain.length) return "";
      const result = await executeWithFallback(chain, [
        { role: "system", content: systemPrompt },
        { role: "user", content: nutzerPrompt }
      ], { temperature: 0.2, maxTokens: 160 });
      if (!result.ok || !result.response?.body) return "";
      const reader = result.response.body.getReader();
      const decoder = new TextDecoder();
      const frist = Date.now() + 20_000;
      let puffer = "";
      let text = "";
      while (Date.now() < frist && text.length < 2_000) {
        const { value, done } = await reader.read();
        if (done) break;
        puffer += decoder.decode(value, { stream: true });
        const bloecke = puffer.split("\n\n");
        puffer = bloecke.pop() || "";
        for (const block of bloecke) {
          for (const zeile of block.split("\n")) {
            if (!zeile.startsWith("data: ")) continue;
            const nutzlast = zeile.slice(6);
            if (nutzlast === "[DONE]") { reader.cancel().catch(() => {}); return text.trim(); }
            try {
              const delta = JSON.parse(nutzlast)?.choices?.[0]?.delta;
              text += delta?.content || "";
            } catch { /* Zwischenzeilen anderer Form sind hier egal */ }
          }
        }
      }
      reader.cancel().catch(() => {});
      return text.trim();
    } catch {
      return "";
    }
  }

  // Englischer Video-Prompt inkl. Personenschutz — Systemtext wortgleich zur
  // Bruecke (uebersetzeMalPrompt), damit beide Wege identisch entscheiden.
  function uebersetzeVideoPrompt(prompt) {
    return frageModell(
      "Turn the user's image request into ONE short English photo prompt (subject, setting, lighting, style). Reply with the prompt only — no quotes, no explanation. EXCEPTION: if the request depicts a real, identifiable person (any celebrity or any named individual), reply with exactly: PERSON_GESPERRT",
      prompt
    );
  }

  function schreibeErzaehltext(prompt) {
    return frageModell(
      "Du schreibst die Erzählstimme für ein kurzes Video (etwa 8 Sekunden). Antworte mit ZWEI kurzen deutschen Sätzen, die die Szene beschreiben — bildhaft, ruhig, ohne Anrede. Keine Aufzählung, keine Überschrift, keine Anführungszeichen, kein Markdown. Nur die zwei Sätze.",
      prompt
    );
  }

  // Ein Versuch beim Video-Worker; "besetzt" bei 429, null bei jedem Fehler.
  async function versucheVideo(prompt, erzaehltext) {
    try {
      const antwort = await fetch(`${workerUrl}/erzeuge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(workerKey ? { "x-smejj-key": workerKey } : {}) },
        body: JSON.stringify({ prompt, erzaehltext: erzaehltext || "" }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (antwort.status === 429) return "besetzt";
      if (!antwort.ok) return null;
      const daten = await antwort.json();
      const url = sichereVideoQuelle(daten);
      return url ? { url, engine: String(daten?.engine || ""), ton: daten?.ton === true } : null;
    } catch {
      return null;
    }
  }

  async function erzeugeVideoMitGeduld(prompt, erzaehltext, melde) {
    const bis = Date.now() + warteMaxMs;
    for (;;) {
      const ergebnis = await versucheVideo(prompt, erzaehltext);
      if (ergebnis !== "besetzt") return ergebnis;
      if (Date.now() >= bis) return null;
      melde("wartet auf freien Platz");
      await new Promise((weiter) => setTimeout(weiter, warteTaktMs));
      melde("läuft");
    }
  }

  // Gleiche Ereignisform wie die Bruecke: konstante Kennung, wachsender Stand,
  // platzhalter "bild" (die App kennt genau diese eine schimmernde Karte).
  function schritt(res, zustand, stand) {
    res.write(`data: ${JSON.stringify({ smejj_schritt: { art: "video", zustand, text: "Erzeuge dein Video", stand, platzhalter: "bild" } })}\n\n`);
  }

  function sendeInhalt(res, inhalt) {
    for (let i = 0; i < inhalt.length; i += 65_536) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: inhalt.slice(i, i + 65_536) } }] })}\n\n`);
    }
  }

  function beende(res, standText, inhalt) {
    schritt(res, "fertig", standText);
    sendeInhalt(res, inhalt);
    res.write("data: [DONE]\n\n");
    res.end();
  }

  /**
   * Uebernimmt einen Video-Auftrag komplett oder gar nicht.
   * @returns {Promise<boolean>} true = Antwort gesendet; false = nicht
   *   zustaendig, /api/chat laeuft normal weiter (es wurde kein Byte gesendet).
   */
  async function handle(res, prompt) {
    if (!istVideoAuftrag(prompt)) return false;
    if (!(await workerBereit())) return false;

    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-smejj-model-backend": "video-worker:weg-c",
      "x-smejj-model-id": "smejj-video"
    });
    schritt(res, "laeuft", "läuft … (ca. 1-2 Minuten)");
    const beginn = Date.now();
    let phase = "läuft";
    // Lebenszeichen alle 10 s, damit Zwischenknoten die Leitung nicht kappen.
    const takt = setInterval(() => {
      schritt(res, "laeuft", `${phase} … ${Math.round((Date.now() - beginn) / 1000)} s`);
    }, 10_000);
    let video = null;
    let gesperrt = false;
    try {
      const [malPrompt, erzaehltext] = await Promise.all([
        uebersetzeVideoPrompt(prompt),
        schreibeErzaehltext(prompt)
      ]);
      if (!malPrompt) {
        // Fail-closed: ohne Uebersetzung fehlt auch der Personenschutz.
        clearInterval(takt);
        beende(res, "nicht verfügbar", "Der Video-Weg ist gerade nicht verfügbar — bitte versuch es gleich noch einmal.");
        return true;
      }
      if (malPrompt.includes("PERSON_GESPERRT")) {
        gesperrt = true;
      } else {
        video = await erzeugeVideoMitGeduld(malPrompt, erzaehltext, (neu) => { phase = neu; });
      }
    } finally {
      clearInterval(takt);
    }

    if (gesperrt) {
      beende(res, "abgelehnt (reale Person)", PERSONEN_ABSAGE);
      return true;
    }
    if (video) {
      const alt = video.ton ? "Erzähltes Video" : "Erstelltes Video";
      beende(res, "fertig", `Hier ist dein Video:\n\n![${alt}](${video.url})${videoHinweis(video.engine, video.ton)}`);
      return true;
    }
    beende(res, "fehlgeschlagen", "Die Video-Erzeugung ist gerade fehlgeschlagen — bitte versuch es gleich noch einmal.");
    return true;
  }

  return { handle };
}
