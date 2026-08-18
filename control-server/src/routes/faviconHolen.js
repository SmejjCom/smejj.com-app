// smejj.com — Favicon einer fremden Seite holen und als data:-Wert liefern.
//
// WARUM DER SERVER DAS TUT UND NICHT DER BROWSER: Die Sicherheitsregel der
// Seite erlaubt Bilder nur von uns selbst, als data: oder blob:
// (`img-src 'self' data: blob:`). Eine fremde Icon-Adresse im <img> waere
// stumm blockiert — das Feld bliebe leer und niemand wuesste warum. Deshalb
// holt der Server das Icon und reicht es als data:-Wert durch.
//
// Und NICHT ueber einen Favicon-Dienst (google.com/s2/favicons o. ae.): das
// wuerde jede besuchte Adresse an einen Dritten melden. Der Nutzer sucht ein
// Symbol, nicht eine Besuchsmeldung.
//
// SRP: kennt weder Route noch Antwortformat. Alles wird hineingereicht,
// dadurch ohne Netz testbar.

// Ein Favicon ist klein. Alles darueber ist entweder ein Missverstaendnis
// oder ein Versuch, uns Speicher zu kosten — beides wollen wir nicht im Chat.
export const MAX_ICON_BYTES = 64 * 1024;
// Kurz: das Icon ist Beiwerk. Es darf das Laden der Seite NIE aufhalten.
export const ICON_TIMEOUT_MS = 2500;

const ERLAUBTE_TYPEN = [
  "image/x-icon", "image/vnd.microsoft.icon", "image/png",
  "image/gif", "image/jpeg", "image/svg+xml", "image/webp"
];

/**
 * Icon-Adressen aus dem HTML lesen, in der Reihenfolge ihrer Eignung.
 * Gibt absolute Adressen zurueck; ungueltige werden verworfen.
 */
export function iconAdressen(html, basisUrl) {
  const treffer = [];
  const text = String(html || "");
  // rel kann mehrere Werte tragen ("shortcut icon"), und die Reihenfolge von
  // rel/href im Tag ist beliebig — deshalb erst die Tags, dann die Attribute.
  for (const tag of text.match(/<link\b[^>]*>/gi) || []) {
    const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || "";
    if (!/\b(shortcut\s+)?icon\b|\bapple-touch-icon\b/i.test(rel)) continue;
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)/i) || [])[1];
    if (!href) continue;
    // Ein bereits eingebettetes Icon kann direkt durchgereicht werden.
    if (/^data:image\//i.test(href)) { treffer.push(href); continue; }
    try {
      treffer.push(new URL(href, basisUrl).toString());
    } catch {
      // Unbrauchbare Adresse: naechster Kandidat.
    }
  }
  // Letzter Kandidat: der Ort, an dem Browser seit jeher zuerst nachsehen.
  try {
    treffer.push(new URL("/favicon.ico", basisUrl).toString());
  } catch {
    // Basis unbrauchbar — dann gibt es eben nur die gefundenen.
  }
  return [...new Set(treffer)];
}

/** Ist der Inhaltstyp ein Bild, das wir weiterreichen wollen? */
export function istBildTyp(contentType) {
  const t = String(contentType || "").toLowerCase().split(";")[0].trim();
  return ERLAUBTE_TYPEN.includes(t);
}

export function alsDatenWert(bytes, contentType) {
  const typ = String(contentType || "").toLowerCase().split(";")[0].trim() || "image/x-icon";
  return `data:${typ};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Holt das erste brauchbare Icon.
 *
 * @param {string} html      HTML der Seite (darf leer sein)
 * @param {string} basisUrl  endgueltige Adresse der Seite
 * @param {object} opts      { fetchImpl, pruefeZiel } — pruefeZiel ist die
 *   BESTEHENDE Zielpruefung der Route (blockt private Netze). Sie wird
 *   hineingereicht statt importiert, damit hier keine zweite, womoeglich
 *   schwaechere Kopie derselben Regel entsteht.
 * @returns {Promise<string>} data:-Wert oder "" (nie ein Fehler — ein
 *   fehlendes Icon ist kein Grund, eine Seite nicht anzuzeigen).
 */
export async function holeFavicon(html, basisUrl, { fetchImpl = fetch, pruefeZiel = null } = {}) {
  for (const adresse of iconAdressen(html, basisUrl)) {
    if (adresse.startsWith("data:image/")) {
      return adresse.length <= MAX_ICON_BYTES * 2 ? adresse : "";
    }
    if (pruefeZiel) {
      const urteil = pruefeZiel(adresse);
      if (!urteil?.ok) continue; // privates Netz o. ae. — stillschweigend weiter
    }
    try {
      const antwort = await fetchImpl(adresse, {
        redirect: "follow",
        signal: AbortSignal.timeout(ICON_TIMEOUT_MS)
      });
      if (!antwort?.ok) continue;
      const typ = antwort.headers?.get?.("content-type") || "";
      if (!istBildTyp(typ)) continue;
      const puffer = await antwort.arrayBuffer();
      if (!puffer || puffer.byteLength === 0 || puffer.byteLength > MAX_ICON_BYTES) continue;
      return alsDatenWert(puffer, typ);
    } catch {
      // Zeitueberschreitung, DNS-Fehler, kaputtes Bild: naechster Kandidat.
    }
  }
  return "";
}
