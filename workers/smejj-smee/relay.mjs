// smejj.com — Smee-Client (Single Responsibility: Webhooks weiterleiten, sonst nichts).
//
// WAS ER TUT: Er haengt an einem Smee-Kanal (Server-Sent Events), nimmt jedes
// Ereignis entgegen und stellt es unveraendert dem eigenen Webhook-Eingang zu.
// Mehr nicht. Keine Modelle, keine Inferenz, keine Datenbank, keine
// Fachlogik — die Weiterleitung ist der ganze Zweck.
//
// WARUM ER HIER ANDERS AUSSIEHT ALS IN JEDER ANLEITUNG: Die uebliche Anleitung
// beschreibt einen Entwicklungsrechner hinter einer Firewall, den ein
// Webhook-Anbieter nicht erreicht. Bei smejj.com ist das nicht die Lage —
// api.smejj.com ist oeffentlich erreichbar (gemessen 05.09.: HTTP 200), und
// Stripe stellt direkt zu. Ein Smee-Kanal davorzuschalten wuerde die
// Zustellung UNZUVERLAESSIGER machen: ein oeffentlicher Kanal ohne Zusage,
// ohne Wiederholung, ausdruecklich fuer Entwicklung gedacht.
//
// Deshalb ist dieser Client ein ZWEITER WEG, kein Ersatz:
//   - der Anbieter stellt weiterhin direkt an api.smejj.com zu (Hauptweg)
//   - derselbe Webhook geht zusaetzlich an den Smee-Kanal (Zweitweg)
//   - faellt der Hauptweg aus, kommt das Ereignis ueber den Zweitweg an
//   - kommt es zweimal an, verwirft der Empfaenger die Wiederholung
//
// SICHERHEIT: Ein Smee-Kanal ist oeffentlich beschreibbar. Jeder, der die
// Kanal-Adresse kennt, kann ein Ereignis hineinlegen. Darum reicht dieser
// Client die Signaturkopfzeilen des Anbieters UNVERAENDERT durch und faelscht
// nie eine eigene: die Echtheitspruefung bleibt beim Empfaenger, wo sie
// hingehoert. Ein Ereignis ohne gueltige Signatur wird dort abgelehnt.
//
// RESSOURCEN: Node-Bordmittel, keine Abhaengigkeit, ein offener Datenstrom.
// Der Heap ist per NODE_OPTIONS auf 64 MB begrenzt (siehe Dockerfile).

export const STANDARD_ZIEL = "https://api.smejj.com/api/webhooks/relay";
/** Kopfzeilen, die der Empfaenger fuer die Echtheitspruefung braucht. */
export const DURCHREICHEN = Object.freeze([
  "stripe-signature", "x-hub-signature-256", "x-github-event", "x-github-delivery",
  "x-zeabur-signature", "x-smejj-quelle", "content-type"
]);
const NEUVERBINDUNG_MS = 5_000;
const MAX_KOERPER = 512 * 1024;

export function leseKonfig(env = process.env) {
  const kanal = String(env.SMEJJ_SMEE_KANAL || "").trim().replace(/\/$/, "");
  const ziel = String(env.SMEJJ_SMEE_ZIEL || STANDARD_ZIEL).trim();
  const geheimnis = String(env.SMEJJ_SMEE_RELAY_SECRET || "").trim();
  const fehlend = [
    !kanal && "SMEJJ_SMEE_KANAL",
    !geheimnis && "SMEJJ_SMEE_RELAY_SECRET"
  ].filter(Boolean);
  return { ok: fehlend.length === 0, fehlend, kanal, ziel, geheimnis,
    an: String(env.SMEJJ_SMEE_ENABLED || "").toUpperCase() === "YES" };
}

/**
 * Baut aus einem Smee-Ereignis die Anfrage an den eigenen Eingang.
 * Rein und testbar: keine Netzarbeit, kein Zustand.
 * @param {object} ereignis Das JSON, das Smee im SSE-Datenfeld liefert.
 * @param {string} geheimnis Beweist dem Empfaenger, dass die Anfrage von uns kommt.
 */
export function baueWeiterleitung(ereignis, geheimnis) {
  if (!ereignis || typeof ereignis !== "object") return { ok: false, grund: "kein_objekt" };
  const kopf = { "content-type": "application/json", "x-smejj-relay": geheimnis };
  for (const name of DURCHREICHEN) {
    // Smee liefert die Kopfzeilen des Anbieters auf oberster Ebene mit.
    const wert = ereignis[name] ?? ereignis[name.toLowerCase()];
    if (typeof wert === "string" && wert) kopf[name] = wert;
  }
  // Die Kennung des Ereignisses ist der Schluessel gegen doppelte Verarbeitung.
  // Smee vergibt selbst eine; fehlt sie, nimmt der Empfaenger den Rumpf-Hash.
  const kennung = String(ereignis["x-github-delivery"] || ereignis.id || "").trim();
  if (kennung) kopf["x-smejj-ereignis"] = kennung;
  const koerper = ereignis.body === undefined ? null : JSON.stringify(ereignis.body);
  if (koerper === null) return { ok: false, grund: "kein_koerper" };
  if (koerper.length > MAX_KOERPER) return { ok: false, grund: "koerper_zu_gross" };
  return { ok: true, kopf, koerper, kennung };
}

/** Zerlegt einen SSE-Block in {feld, wert}. Smee sendet "data: {...}". */
export function leseSseBlock(block) {
  const zeilen = String(block || "").split("\n");
  let art = "message";
  const daten = [];
  for (const z of zeilen) {
    if (z.startsWith("event:")) art = z.slice(6).trim();
    else if (z.startsWith("data:")) daten.push(z.slice(5).trim());
  }
  if (!daten.length) return null;
  try { return { art, daten: JSON.parse(daten.join("\n")) }; }
  catch { return { art, daten: null }; }
}

/** Stellt EIN Ereignis zu. Ein Fehler hier darf den Strom nie beenden. */
export async function stelleZu(ereignis, konfig, fetchImpl = fetch) {
  const gebaut = baueWeiterleitung(ereignis, konfig.geheimnis);
  if (!gebaut.ok) return { ok: false, grund: gebaut.grund };
  try {
    const antwort = await fetchImpl(konfig.ziel, {
      method: "POST", headers: gebaut.kopf, body: gebaut.koerper,
      signal: AbortSignal.timeout(20_000)
    });
    return { ok: antwort.ok, status: antwort.status, kennung: gebaut.kennung };
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

/**
 * Haengt am Kanal und stellt zu, bis jemand abbricht. Reisst nie ab: bricht die
 * Verbindung, wird nach NEUVERBINDUNG_MS neu verbunden.
 */
export async function laufe(konfig, { fetchImpl = fetch, melde = console.log, abbruch = null } = {}) {
  let zugestellt = 0, verworfen = 0;
  while (!abbruch?.aborted) {
    try {
      const strom = await fetchImpl(konfig.kanal, {
        headers: { accept: "text/event-stream" }, signal: abbruch
      });
      if (!strom.ok || !strom.body) throw new Error(`Kanal antwortet HTTP ${strom.status}`);
      melde(`[smee] verbunden mit ${konfig.kanal}`);
      const leser = strom.body.getReader();
      const dekoder = new TextDecoder();
      let puffer = "";
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        puffer += dekoder.decode(value, { stream: true });
        let trenner;
        while ((trenner = puffer.indexOf("\n\n")) >= 0) {
          const block = puffer.slice(0, trenner);
          puffer = puffer.slice(trenner + 2);
          const gelesen = leseSseBlock(block);
          // "ready" schickt Smee beim Verbinden, "ping" alle paar Sekunden zum
          // Offenhalten. Beides sind KEINE Webhooks. Ein Ereignis ohne body
          // ebenso wenig — im Livetest 05.09. zaehlte genau das als
          // "verworfen" und haette die Ampel des Autopiloten belastet, obwohl
          // nichts fehlgeschlagen war. Ein Nichts darf nicht wie ein Fehler
          // aussehen.
          if (!gelesen || !gelesen.daten) continue;
          if (gelesen.art === "ping" || gelesen.art === "ready") continue;
          if (gelesen.daten.body === undefined) continue;
          const ergebnis = await stelleZu(gelesen.daten, konfig, fetchImpl);
          if (ergebnis.ok) { zugestellt += 1; melde(`[smee] zugestellt (${zugestellt}) HTTP ${ergebnis.status}`); }
          else { verworfen += 1; melde(`[smee] NICHT zugestellt (${verworfen}): ${ergebnis.grund || "HTTP " + ergebnis.status}`); }
        }
      }
      melde("[smee] Strom beendet — neu verbinden");
    } catch (fehler) {
      if (abbruch?.aborted) break;
      melde(`[smee] Verbindung verloren: ${String(fehler?.message || fehler).slice(0, 120)}`);
    }
    if (abbruch?.aborted) break;
    await new Promise((f) => setTimeout(f, NEUVERBINDUNG_MS));
  }
  return { zugestellt, verworfen };
}
