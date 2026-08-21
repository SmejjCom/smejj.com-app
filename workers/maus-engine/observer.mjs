// smejj.com Maus-Engine — Beobachter fuer den interaktiven Loop-Modus.
// Single Responsibility: aus der Playwright-Seite einen kompakten,
// deterministischen, hart gekappten Seitenzustand bauen (URL, Titel,
// interaktive Elemente mit Rolle/Label/Koordinaten, sichtbarer Text
// gekuerzt, Passwortfelder maskiert). KEIN Roh-DOM, KEIN Screenshot,
// KEIN Modell. Der Zustand geht als untrusted DATEN an den Planer
// (Rahmung uebernimmt prompt-template.buildStepPrompt).

import { buildAriaObservation } from "./aria-baum.mjs";

export const OBSERVATION_LIMIT_CHARS = 6000;
export const OBSERVATION_MAX_ELEMENTS = 60;
// Eigenes Limit fuer den Bedienbaum. Er kommt ZUSAETZLICH zur Elementliste,
// darum bekommt er sein eigenes Budget statt der gemeinsamen Kappung: die
// Elementliste traegt Koordinaten (fuer Klicks), der Baum traegt Rolle und
// Beschriftung (fuer stabile role-Selektoren). Keines der beiden darf das
// andere verdraengen.
export const BEDIENBAUM_LIMIT_CHARS = 6000;
const ELEMENT_TEXT_LIMIT = 80;
const MASKED_VALUE = "***";

// Wird per page.evaluate IN der Seite ausgefuehrt (reines DOM, kein Node).
// Liefert Rohdaten; Kappung + Maskierung passieren zusaetzlich noch einmal
// deterministisch in Node (Defense in depth, Tests ohne Browser moeglich).
export function pageSnapshotScript() {
  const roles = ["button", "link", "textbox", "combobox", "checkbox", "radio", "searchbox", "menuitem", "tab"];
  const selector = "a[href], button, input, select, textarea, [role=\"" + roles.join("\"], [role=\"") + "\"]";
  const elements = [];
  const nodes = document.querySelectorAll(selector);
  for (let i = 0; i < nodes.length && elements.length < 160; i += 1) {
    const node = nodes[i];
    const rect = node.getBoundingClientRect();
    // Nur wirklich Unsichtbares faellt raus (display:none, Groesse 0).
    if (rect.width <= 0 || rect.height <= 0) continue;
    // Bis 2026-08-17 flog hier alles ausserhalb des Bildausschnitts raus:
    //   if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    // Damit sah die Maus nur, was gerade im Fenster stand. Ein Link im
    // Fussbereich existierte fuer sie nicht — sie musste ihn blind ersuchen
    // und verbrauchte dabei ihre Schritte. Aus einer echten Aufnahme:
    // "Impressum-Link ist in den sichtbaren Elementen nicht vorhanden,
    //  vermutlich weiter unten auf der Seite; scrollen nach unten".
    // Jetzt sieht sie die ganze Seite und weiss, WOHIN sie scrollen muss.
    const imBild = rect.bottom > 0 && rect.top < window.innerHeight;
    const type = (node.getAttribute("type") || "").toLowerCase();
    const isPassword = node.tagName === "INPUT" && type === "password";
    let label = node.getAttribute("aria-label") || "";
    if (!label && node.labels && node.labels.length > 0) label = node.labels[0].textContent || "";
    elements.push({
      tag: node.tagName.toLowerCase(),
      type: type || undefined,
      role: node.getAttribute("role") || undefined,
      text: (node.innerText || node.value || "").trim().slice(0, 120),
      label: label.trim().slice(0, 120) || undefined,
      placeholder: (node.getAttribute("placeholder") || "").slice(0, 120) || undefined,
      name: (node.getAttribute("name") || "").slice(0, 80) || undefined,
      id: (node.getAttribute("id") || "").slice(0, 80) || undefined,
      href: node.tagName === "A" ? (node.getAttribute("href") || "").slice(0, 300) : undefined,
      password: isPassword || undefined,
      // Nur die AUSNAHME wird vermerkt. Steht nichts da, ist das Element im
      // Bild — so bleibt die Liste kurz, und "ausserhalb" faellt beim Lesen auf.
      ausserhalbBild: imBild ? undefined : true,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    });
  }
  return {
    text: (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 6000),
    elements
  };
}

function truncate(value, limit) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// Element-Rohdaten -> kompakte, maskierte Zeile. Passwortfelder tragen
// masked:true und NIE einen Wert/Text (fail-closed, auch wenn die Seite
// den Wert im DOM spiegelt).
function normalizeElement(raw, index) {
  const isPassword = raw.password === true || String(raw.type || "").toLowerCase() === "password";
  const element = {
    n: index + 1,
    tag: truncate(raw.tag || "?", 20),
    x: Number.isFinite(raw.x) ? raw.x : 0,
    y: Number.isFinite(raw.y) ? raw.y : 0
  };
  if (raw.ausserhalbBild === true) element.ausserhalbBild = true;
  if (raw.role) element.role = truncate(raw.role, 30);
  if (raw.type) element.type = truncate(raw.type, 30);
  if (raw.name) element.name = truncate(raw.name, 60);
  if (raw.id) element.id = truncate(raw.id, 60);
  if (raw.href) element.href = truncate(raw.href, 200);
  if (raw.placeholder) element.placeholder = truncate(raw.placeholder, ELEMENT_TEXT_LIMIT);
  if (raw.label) element.label = truncate(raw.label, ELEMENT_TEXT_LIMIT);
  if (isPassword) {
    element.masked = true;
    element.text = MASKED_VALUE;
  } else if (raw.text) {
    element.text = truncate(raw.text, ELEMENT_TEXT_LIMIT);
  }
  return element;
}

// Beobachtung deterministisch auf maxChars kappen: erst Elementliste
// verkleinern, dann Textauszug kuerzen. Rueckgabe ist IMMER <= maxChars
// (gemessen an der JSON-Serialisierung, die auch in den Prompt geht).
/**
 * Kuerzt eine Elementliste auf `max` — und nimmt dafuer aus der MITTE.
 *
 * Frueher wurde hinten abgeschnitten. Solange die Beobachtung nur den
 * Bildausschnitt umfasste, war das gleichgueltig. Seit sie die ganze Seite
 * umfasst, ist es der Unterschied zwischen brauchbar und nutzlos: Seiten
 * tragen ihre Verweise oben (Navigation) und unten (Fussbereich). Wer hinten
 * kuerzt, wirft zuerst den Fussbereich weg — also genau das Impressum, das die
 * Maus suchen sollte. Die Mitte ist meist Fliesstext.
 *
 * Deterministisch: bei ungerader Restzahl bekommt der Kopf das Mehr.
 */
export function waehleElemente(alle, max) {
  if (!Array.isArray(alle) || alle.length <= max || max <= 0) return Array.isArray(alle) ? alle.slice(0, Math.max(0, max)) : [];
  const kopf = Math.ceil(max / 2);
  const fuss = max - kopf;
  return fuss > 0 ? [...alle.slice(0, kopf), ...alle.slice(alle.length - fuss)] : alle.slice(0, kopf);
}

function capObservation(observation, maxChars) {
  const fits = (candidate) => JSON.stringify(candidate).length <= maxChars;
  let result = observation;
  if (fits(result)) return result;
  result = { ...result, truncated: true };
  while (result.elements.length > 0 && !fits(result)) {
    result = { ...result, elements: waehleElemente(result.elements, result.elements.length - 1) };
  }
  while (result.textExcerpt.length > 0 && !fits(result)) {
    const next = Math.max(0, Math.floor(result.textExcerpt.length / 2) - 1);
    result = { ...result, textExcerpt: result.textExcerpt.slice(0, next) };
  }
  return result;
}

// Oeffentliche Schnittstelle: Playwright-Seite -> kompakter Zustand.
// Duck-typed: page braucht url(); title() und evaluate() sind optional
// (Mocks/Sonderfaelle liefern dann eine Minimal-Beobachtung).
//
// `nurMitElementen` (2026-08-17): dann wird die Seite ZUERST auf den
// Bedienbaum abgefragt und bei Fehlschlag `null` zurueckgegeben — ohne
// Titelabfrage. Der Grund ist der Chrome-Adapter des Betreibers: er
// beherrscht bewusst kein `evaluate` (fremdes JavaScript im eigenen Browser
// waere genau die Hintertuer, die dieser Weg vermeidet), aber sein `title()`
// schickt sehr wohl einen Befehl an die Erweiterung. Eine Minimal-Beobachtung
// aus URL und Titel nuetzt dem Planer nichts und kostete dort einen Zugriff
// auf eine Seite, die vielleicht gerade gesperrt wurde.
// `mitBedienbaum` (2026-08-21, ZCode-Vorbild): holt zusaetzlich Chromiums
// Accessibility-Baum und legt ihn als `bedienbaum` dazu. Fail-open wie
// evaluate — der Chrome-Adapter des Betreibers kennt weder das eine noch das
// andere, und eine Beobachtung ohne Baum ist besser als gar keine.
export async function buildObservation(page, {
  maxChars = OBSERVATION_LIMIT_CHARS,
  maxElements = OBSERVATION_MAX_ELEMENTS,
  nurMitElementen = false,
  mitBedienbaum = false,
  baumMaxChars = BEDIENBAUM_LIMIT_CHARS
} = {}) {
  let snapshot = { text: "", elements: [] };
  let konnteLesen = false;
  try {
    if (typeof page?.evaluate === "function") {
      const raw = await page.evaluate(pageSnapshotScript);
      if (raw && typeof raw === "object") {
        konnteLesen = true;
        snapshot = {
          text: typeof raw.text === "string" ? raw.text : "",
          elements: Array.isArray(raw.elements) ? raw.elements : []
        };
      }
    }
  } catch { /* fail-open: Minimal-Beobachtung (URL/Titel) statt Abbruch */ }
  if (nurMitElementen && !konnteLesen) return null;

  const url = typeof page?.url === "function" ? String(page.url()) : "";
  let title = "";
  try {
    if (typeof page?.title === "function") title = truncate(await page.title(), 200);
  } catch { /* Titel ist optional, Beobachtung bleibt gueltig */ }

  const observation = {
    url: truncate(url, 500),
    title,
    elements: waehleElemente(snapshot.elements, maxElements).map(normalizeElement),
    textExcerpt: truncate(snapshot.text.replace(/\s+/g, " ").trim(), 2000),
    truncated: snapshot.elements.length > maxElements
  };
  // Der Baum wird NACH der Kappung angehaengt und selbst nicht mitgekappt:
  // sonst raesse eine lange Elementliste dem Auge den Boden weg.
  const gekappt = capObservation(observation, maxChars);
  if (!mitBedienbaum) return gekappt;
  try {
    const aria = await buildAriaObservation(page, { limitChars: baumMaxChars });
    if (aria?.baum) {
      gekappt.bedienbaum = aria.baum;
      if (aria.gekappt) gekappt.bedienbaumGekappt = true;
    }
  } catch { /* fail-open: ohne Baum ist die Beobachtung immer noch gueltig */ }
  return gekappt;
}

// Kompakte Textdarstellung fuer den Prompt (deterministisch, gleiche
// Kappungsgarantie, da direkt aus der gekappten Beobachtung gerendert).
export function renderObservation(observation) {
  return JSON.stringify(observation);
}
