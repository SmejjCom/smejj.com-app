// smejj.com Maus-Bruecke — der Bedienbaum, gelesen im ECHTEN Chrome.
//
// WARUM DIESE DATEI DER KERN IST:
// Bis hierher konnte die Bruecke klicken und tippen, aber nicht HINSEHEN.
// Damit war sie kein Ersatz fuer den fernen Browser, sondern nur eine
// Fernbedienung ohne Bild — die Maus haette blind geraten. Genau das
// unterscheidet ein Werkzeug, das funktioniert, von einem, das beeindruckt.
//
// DAS FORMAT IST NICHT NEU ERFUNDEN. Es ist Zeichen fuer Zeichen dasselbe,
// das workers/maus-engine/observer.mjs aus dem fernen Browser liefert:
//   { url, title, elements: [{n, tag, x, y, role?, ...}], textExcerpt, truncated }
// Nur so bleibt ALLES dahinter unveraendert — die Entscheidung auf dem
// Server, der Schritt-Pruefer, der freie Lauf. Ein zweites Format haette
// bedeutet: die Maus sieht im eigenen Chrome eine andere Seite als im fernen
// und entscheidet dort anders. Das faellt erst live auf und ist dann teuer.
//
// SELBSTTRAGEND: chrome.scripting.executeScript serialisiert die Funktion und
// fuehrt sie in der fremden Seite aus. Sie darf deshalb NICHTS von aussen
// benutzen — kein import, keine Konstante aus diesem Modul, keine Closure.
// Alles steht bewusst in EINER Funktion, auch wenn das haesslich aussieht.

/**
 * Wird IN der fremden Seite ausgefuehrt. Liefert dieselbe Beobachtung wie
 * der ferne Browser.
 * @param {number} maxElements
 * @param {number} maxChars
 */
export function beobachteImSeitenkontext(maxElements, maxChars) {
  const ELEMENT_TEXT_LIMIT = 80;
  const MASKED_VALUE = "***";
  const kuerze = (wert, grenze) => {
    const text = String(wert === undefined || wert === null ? "" : wert);
    return text.length > grenze ? `${text.slice(0, grenze)}…` : text;
  };

  // --- 1. Rohaufnahme (gleiche Auswahl wie pageSnapshotScript) ---------------
  const rollen = ["button", "link", "textbox", "combobox", "checkbox", "radio", "searchbox", "menuitem", "tab"];
  const auswahl = 'a[href], button, input, select, textarea, [role="' + rollen.join('"], [role="') + '"]';
  const roh = [];
  const knoten = document.querySelectorAll(auswahl);
  // Die Knoten werden MITGEFUEHRT: der Klick danach trifft dann genau das
  // Element, das die Maus gesehen hat — auch wenn die Seite inzwischen einen
  // zweiten mit gleichem Text bekommen hat. Genau das kann ein Selektor nicht.
  const gesehen = [];
  for (let i = 0; i < knoten.length && roh.length < 160; i += 1) {
    const k = knoten[i];
    const r = k.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const imBild = r.bottom > 0 && r.top < window.innerHeight;
    const typ = (k.getAttribute("type") || "").toLowerCase();
    const istPasswort = k.tagName === "INPUT" && typ === "password";
    let label = k.getAttribute("aria-label") || "";
    if (!label && k.labels && k.labels.length > 0) label = k.labels[0].textContent || "";
    gesehen.push(k);
    roh.push({
      tag: k.tagName.toLowerCase(),
      type: typ || undefined,
      role: k.getAttribute("role") || undefined,
      text: (k.innerText || k.value || "").trim().slice(0, 120),
      label: label.trim().slice(0, 120) || undefined,
      placeholder: (k.getAttribute("placeholder") || "").slice(0, 120) || undefined,
      name: (k.getAttribute("name") || "").slice(0, 80) || undefined,
      id: (k.getAttribute("id") || "").slice(0, 80) || undefined,
      href: k.tagName === "A" ? (k.getAttribute("href") || "").slice(0, 300) : undefined,
      password: istPasswort || undefined,
      ausserhalbBild: imBild ? undefined : true,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2)
    });
  }
  // Die Liste bleibt in der Seite liegen, damit ein Klick auf "n" sie wieder
  // findet. Ein eigener Name, damit nichts auf der Seite darueber stolpert.
  window.__smejjMausGesehen = gesehen;

  // --- 2. Aus der MITTE kuerzen, nie hinten ---------------------------------
  // Seiten tragen ihre Verweise oben (Navigation) und unten (Fussbereich).
  // Wer hinten kuerzt, wirft zuerst den Fussbereich weg — also genau das
  // Impressum, das die Maus suchen soll. Dieselbe Regel wie im Beobachter des
  // fernen Browsers; die Kennung "n" bleibt dabei am urspruenglichen Platz.
  const waehle = (alle, max) => {
    if (alle.length <= max || max <= 0) return alle.slice(0, Math.max(0, max));
    const kopf = Math.ceil(max / 2);
    const fuss = max - kopf;
    return fuss > 0 ? [...alle.slice(0, kopf), ...alle.slice(alle.length - fuss)] : alle.slice(0, kopf);
  };

  const nummeriert = roh.map((e, i) => ({ e, n: i + 1 }));
  const gewaehlt = waehle(nummeriert, maxElements);

  const normalisiere = ({ e, n }) => {
    const istPasswort = e.password === true || String(e.type || "").toLowerCase() === "password";
    const el = { n, tag: kuerze(e.tag || "?", 20), x: Number.isFinite(e.x) ? e.x : 0, y: Number.isFinite(e.y) ? e.y : 0 };
    if (e.ausserhalbBild === true) el.ausserhalbBild = true;
    if (e.role) el.role = kuerze(e.role, 30);
    if (e.type) el.type = kuerze(e.type, 30);
    if (e.name) el.name = kuerze(e.name, 60);
    if (e.id) el.id = kuerze(e.id, 60);
    if (e.href) el.href = kuerze(e.href, 200);
    if (e.placeholder) el.placeholder = kuerze(e.placeholder, ELEMENT_TEXT_LIMIT);
    if (e.label) el.label = kuerze(e.label, ELEMENT_TEXT_LIMIT);
    // Passwortfelder tragen NIE einen Wert — auch dann nicht, wenn die Seite
    // ihn im DOM spiegelt. Fail-closed, wie im fernen Browser.
    if (istPasswort) { el.masked = true; el.text = MASKED_VALUE; }
    else if (e.text) el.text = kuerze(e.text, ELEMENT_TEXT_LIMIT);
    return el;
  };

  let beobachtung = {
    url: kuerze(location.href, 500),
    title: kuerze(document.title, 200),
    elements: gewaehlt.map(normalisiere),
    textExcerpt: kuerze((document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim(), 2000),
    truncated: roh.length > maxElements
  };

  // --- 3. Hart auf maxChars kappen -----------------------------------------
  const passt = (k) => JSON.stringify(k).length <= maxChars;
  if (!passt(beobachtung)) {
    beobachtung = { ...beobachtung, truncated: true };
    while (beobachtung.elements.length > 0 && !passt(beobachtung)) {
      beobachtung = { ...beobachtung, elements: waehle(beobachtung.elements, beobachtung.elements.length - 1) };
    }
    while (beobachtung.textExcerpt.length > 0 && !passt(beobachtung)) {
      const next = Math.max(0, Math.floor(beobachtung.textExcerpt.length / 2) - 1);
      beobachtung = { ...beobachtung, textExcerpt: beobachtung.textExcerpt.slice(0, next) };
    }
  }
  return beobachtung;
}
