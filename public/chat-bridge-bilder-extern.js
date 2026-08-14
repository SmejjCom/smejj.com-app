// smejj.com — Weg 0 der Bilder-Spur: der externe Maler (fal.ai).
// Eigenes Modul wegen der 800-Zeilen-Regel (AI_Guidelines.md Abschnitt 2);
// aufgerufen ausschliesslich aus chat-bridge-bilder.js.
//
// Eigene Namen (BILDER_EXTERN_*/EXTERN_*): das Deploy-Buendel legt alle
// Bridge-Module in EINEN Gueltigkeitsbereich und bricht bei Namensgleichheit
// hart ab (bundle_chat_bridge.mjs).
// --- Weg 0: externer Maler (Betreiber-Entscheidung 2026-08-14) -----------------
//
// WARUM: Der eigene Maler ist hardware-gedeckelt. SD-Turbo, 3 Schritte, 512 px
// auf einer CPU ohne Grafikkarte, geteilt mit acht Diensten — zwei Minuten je
// Bild, und die naheliegenden Stellschrauben wurden gemessen und wieder
// zurueckgenommen (bfloat16 +70 % langsamer, 640 px sprengt das Zeitbudget).
// Nano-Banana-/Midjourney-Niveau ist damit nicht erreichbar; das ist keine
// Feinabstimmungsfrage. Derselbe Beschluss wie beim Video (Weg C, fal.ai).
//
// FAIL-CLOSED: ohne SMEJJ_BILDER_EXTERN_KEY existiert dieser Weg nicht — kein
// Aufruf, kein Cent, der eigene Maler laeuft unveraendert weiter.
const BILDER_EXTERN_KEY = process.env.SMEJJ_BILDER_EXTERN_KEY || "";
const BILDER_EXTERN_MODELL = process.env.SMEJJ_BILDER_EXTERN_MODELL || "fal-ai/flux/schnell";
// Sync-Endpunkt statt Warteschlange: ein FLUX-schnell-Bild dauert 1-3 s. Der
// Video-Weg braucht die Queue (Minuten), hier waere sie nur eine Fehlerquelle
// mehr — fal baut die Status-Adresse je Modell unterschiedlich zusammen.
const BILDER_EXTERN_URL = "https://fal.run";
const BILDER_EXTERN_TIMEOUT_MS = Number(process.env.SMEJJ_BILDER_EXTERN_TIMEOUT_MS || 45000);
// JPEG, NICHT PNG — und das ist kein Geschmack, sondern eine Messung:
// ein Chat darf 512 KB gross werden (MAX_CHAT_BYTES), sonst verwirft der
// Verlauf-Sync ihn STILL. Ein 1024er-PNG liegt bei 1-2 MB und wuerde jeden
// Chat mit Bild unsichtbar zerstoeren; dasselbe Bild als JPEG bleibt bei
// 150-250 KB. Der Renderer nimmt jedes data:image/ (chat-medien.js).
const BILDER_EXTERN_FORMAT = process.env.SMEJJ_BILDER_EXTERN_FORMAT || "jpeg";
const BILDER_EXTERN_GROESSE = process.env.SMEJJ_BILDER_EXTERN_GROESSE || "square_hd";
// Weicher Tagesdeckel gegen Amok. Er liegt im Arbeitsspeicher und faellt bei
// jedem Neustart auf 0 — der MASSGEBLICHE Deckel ist deshalb das Ausgabenlimit,
// das der Betreiber im fal.ai-Konto selbst setzt.
const BILDER_EXTERN_MAX_PRO_TAG = Number(process.env.SMEJJ_BILDER_EXTERN_MAX_PRO_TAG || 200);
// Eigener Deckel statt des BILDER_MAX_B64 der Spur: dieses Modul steht fuer
// sich (nur im Buendel teilen sich alle Module einen Gueltigkeitsbereich).
const EXTERN_MAX_B64 = 4_000_000;
const externZaehler = { tag: "", anzahl: 0 };

// Fuer die Kopfzeile der Spur: WELCHER Maler antwortet gerade.
export function externMalerName() {
  return BILDER_EXTERN_MODELL;
}

// True = ein weiterer externer Aufruf ist heute noch erlaubt.
function externBudgetFrei() {
  const heute = new Date().toISOString().slice(0, 10);
  if (externZaehler.tag !== heute) {
    externZaehler.tag = heute;
    externZaehler.anzahl = 0;
  }
  return externZaehler.anzahl < BILDER_EXTERN_MAX_PRO_TAG;
}

// Nur von fal selbst laden (SSRF-Schutz): die Antwort kam zwar per TLS von
// fal, aber eine fremde Adresse DARIN laden wir trotzdem nicht — dieselbe
// Regel wie im Video-Worker.
export function istFalAdresse(url) {
  try {
    const ziel = new URL(String(url || ""));
    return ziel.protocol === "https:" && /(^|\.)fal\.(run|ai|media)$/i.test(ziel.hostname);
  } catch {
    return false;
  }
}

// Erkennt das Bildformat an den Magic Bytes. "" = kein bekanntes Bild.
export function bildFormatAusBytes(bytes) {
  if (!bytes || bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const kopf = String.fromCharCode(...bytes.slice(0, 4));
  const art = String.fromCharCode(...bytes.slice(8, 12));
  if (kopf === "RIFF" && art === "WEBP") return "webp";
  return "";
}

/**
 * Weg 0: Bild beim externen Maler (fal.ai) holen.
 *
 * Liefert den Markdown-Inhalt oder "" — bei JEDEM Problem "", damit der
 * eigene Maler unveraendert uebernimmt. Der Aufrufer hat den Personen-Schutz
 * bereits angewandt (istPersonGesperrt auf dem uebersetzten Prompt); ein
 * gesperrter Auftrag erreicht diese Funktion nie.
 *
 * Die `notiz` traegt den Grund nach oben, ohne den Rueckgabewert anzutasten.
 */
export async function erzeugeExternesBild(prompt, notiz = {}, fetchImpl = fetch) {
  if (!BILDER_EXTERN_KEY) return "";
  const beginn = Date.now();
  const scheitern = (grund) => {
    notiz.externGrund = grund;
    console.warn(`smejj Bild extern: ${grund} nach ${Math.round((Date.now() - beginn) / 1000)} s`);
    return "";
  };
  if (!externBudgetFrei()) return scheitern(`tagesdeckel_${BILDER_EXTERN_MAX_PRO_TAG}_erreicht`);
  externZaehler.anzahl += 1;
  try {
    const antwort = await fetchImpl(`${BILDER_EXTERN_URL}/${BILDER_EXTERN_MODELL}`, {
      method: "POST",
      headers: { Authorization: `Key ${BILDER_EXTERN_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: String(prompt).slice(0, 1200),
        image_size: BILDER_EXTERN_GROESSE,
        num_images: 1,
        output_format: BILDER_EXTERN_FORMAT,
        enable_safety_checker: true
      }),
      signal: AbortSignal.timeout(BILDER_EXTERN_TIMEOUT_MS)
    });
    if (!antwort.ok) return scheitern(`extern_http_${antwort.status}`);
    let daten;
    try {
      daten = await antwort.json();
    } catch {
      return scheitern("extern_antwort_kein_json");
    }
    const bildUrl = String(daten?.images?.[0]?.url || "");
    if (!bildUrl) return scheitern("extern_ohne_bildadresse");
    if (!istFalAdresse(bildUrl)) return scheitern("extern_fremde_bildadresse");
    const laden = await fetchImpl(bildUrl, { signal: AbortSignal.timeout(BILDER_EXTERN_TIMEOUT_MS) });
    if (!laden.ok) return scheitern(`extern_bild_http_${laden.status}`);
    const bytes = new Uint8Array(await laden.arrayBuffer());
    // Nie blind glauben, dass unter der Adresse ein Bild liegt.
    const format = bildFormatAusBytes(bytes);
    if (!format) return scheitern("extern_keine_bilddaten");
    const b64 = Buffer.from(bytes).toString("base64");
    if (b64.length > EXTERN_MAX_B64) return scheitern(`extern_bild_zu_gross_${b64.length}`);
    notiz.externSekunden = Math.round((Date.now() - beginn) / 1000);
    return `Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/${format};base64,${b64})`;
  } catch (fehler) {
    return scheitern(`extern_netzfehler:${String(fehler?.message || fehler).slice(0, 60)}`);
  }
}

// Ist der externe Maler ueberhaupt eingerichtet? Nur so entscheidet die Spur,
// ob sie ihn ueberhaupt anspricht (und ob sie "läuft" oder "ca. 1 Minute" meldet).
export function externerMalerBereit() {
  return Boolean(BILDER_EXTERN_KEY);
}
