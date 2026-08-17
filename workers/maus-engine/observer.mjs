// smejj.com Maus-Engine — Beobachter fuer den interaktiven Loop-Modus.
// Single Responsibility: aus der Playwright-Seite einen kompakten,
// deterministischen, hart gekappten Seitenzustand bauen (URL, Titel,
// interaktive Elemente mit Rolle/Label/Koordinaten, sichtbarer Text
// gekuerzt, Passwortfelder maskiert). KEIN Roh-DOM, KEIN Screenshot,
// KEIN Modell. Der Zustand geht als untrusted DATEN an den Planer
// (Rahmung uebernimmt prompt-template.buildStepPrompt).

export const OBSERVATION_LIMIT_CHARS = 4000;
export const OBSERVATION_MAX_ELEMENTS = 40;
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
  for (let i = 0; i < nodes.length && elements.length < 80; i += 1) {
    const node = nodes[i];
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
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
function capObservation(observation, maxChars) {
  const fits = (candidate) => JSON.stringify(candidate).length <= maxChars;
  let result = observation;
  if (fits(result)) return result;
  result = { ...result, truncated: true };
  while (result.elements.length > 0 && !fits(result)) {
    result = { ...result, elements: result.elements.slice(0, result.elements.length - 1) };
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
export async function buildObservation(page, {
  maxChars = OBSERVATION_LIMIT_CHARS,
  maxElements = OBSERVATION_MAX_ELEMENTS,
  nurMitElementen = false
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
    elements: snapshot.elements.slice(0, maxElements).map(normalizeElement),
    textExcerpt: truncate(snapshot.text.replace(/\s+/g, " ").trim(), 2000),
    truncated: snapshot.elements.length > maxElements
  };
  return capObservation(observation, maxChars);
}

// Kompakte Textdarstellung fuer den Prompt (deterministisch, gleiche
// Kappungsgarantie, da direkt aus der gekappten Beobachtung gerendert).
export function renderObservation(observation) {
  return JSON.stringify(observation);
}
