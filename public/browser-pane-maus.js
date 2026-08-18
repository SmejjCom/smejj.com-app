// smejj.com — das Bindeglied: ein Maus-Plan, ausgefuehrt IM Panel.
//
// WARUM IM PANEL UND NICHT AUF DEM SERVER: Der Server koennte den Plan selbst
// abfahren — dann saehe der Nutzer nichts. Das Panel dagegen zeichnet nach
// JEDER Sitzungs-Aktion ein neues Bild. Laeuft der Plan hier, sieht man der
// Maus zu, Schritt fuer Schritt, ohne dass dafuer irgendetwas gebaut werden
// muss. Das Zusehen ist der ganze Zweck.
//
// Die Maus plant weiterhin auf dem Server (dort liegen die Modelle und die
// Sicherheitspruefung). Hierher kommt nur der FERTIGE, bereits gepruefte Plan.
//
// SRP: Die Uebersetzung Plan-Schritt -> Sitzungs-Aktion ist eine REINE
// FUNKTION und ohne Browser testbar. Was ein Schritt bewirkt, entscheidet
// allein die Sitzung.

/** Schritte, die im Panel keinen Sinn ergeben — die Sitzung IST schon offen. */
const UEBERSPRUNGEN = new Set(["openBrowser", "closeBrowser", "screenshot", "httpRequest", "watchDownloads"]);

/**
 * Uebersetzt EINEN Plan-Schritt in eine Sitzungs-Aktion.
 * @returns {{aktion: object}|{ueberspringen: string}|{fehler: string}}
 */
export function alsSitzungsAktion(step) {
  const s = step || {};
  const ziel = s.target || s.selector || null;
  const sel = ziel ? { strategy: ziel.strategy, value: ziel.value, ...(ziel.name !== undefined ? { name: ziel.name } : {}) } : null;

  if (UEBERSPRUNGEN.has(s.action)) return { ueberspringen: s.action };

  switch (s.action) {
    case "navigate":
      if (!/^https?:\/\//i.test(String(s.url || ""))) return { fehler: "navigate_ohne_adresse" };
      return { aktion: { type: "navigate", url: String(s.url) } };
    case "click":
    case "openLink":
      if (!sel?.value) return { fehler: "klick_ohne_ziel" };
      return { aktion: { type: "selectorClick", ...sel } };
    case "type":
    case "fill":
      if (!sel?.value) return { fehler: "tippen_ohne_ziel" };
      return { aktion: { type: "selectorType", ...sel, text: String(s.text ?? s.value ?? "") } };
    // "extract" LIEST nur. Im Panel ist das ein Selektor-Lesen; das Ergebnis
    // sammelt der Aufrufer unter dem Namen des Schritts.
    case "extract":
    case "assert":
      if (!sel?.value) return { ueberspringen: s.action };
      return { aktion: { type: "selectorText", ...sel }, liestAls: s.name || s.id || "wert" };
    case "scroll":
      return { aktion: { type: "scroll", deltaY: Number(s.deltaY) || 600 } };
    case "waitFor":
      // Warten ist im Panel kein eigener Auftrag: jede Aktion wartet ohnehin
      // auf das Ziel. Ein eigener Warteschritt waere nur verlorene Zeit.
      return { ueberspringen: "waitFor" };
    default:
      return { ueberspringen: s.action || "unbekannt" };
  }
}

/**
 * Uebersetzt einen ganzen Plan. Gibt eine Liste von Auftraegen zurueck,
 * jeweils mit dem Ursprungsschritt fuer die Anzeige.
 */
export function planAlsAuftraege(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const auftraege = [];
  for (const step of steps) {
    const u = alsSitzungsAktion(step);
    if (u.aktion) auftraege.push({ id: step.id, beschreibung: beschreibe(step), aktion: u.aktion, liestAls: u.liestAls || null });
  }
  return auftraege;
}

/** Ein Satz, den ein Mensch lesen kann — er steht waehrend des Laufs im Panel. */
export function beschreibe(step) {
  const s = step || {};
  const wo = s.target?.name || s.target?.value || s.selector?.value || "";
  switch (s.action) {
    case "navigate": return `Seite oeffnen: ${kurz(s.url)}`;
    case "click": case "openLink": return `Klicken: ${kurz(wo)}`;
    case "type": case "fill": return `Tippen in ${kurz(wo)}`;
    case "extract": case "assert": return `Lesen: ${kurz(s.name || wo)}`;
    case "scroll": return "Scrollen";
    default: return String(s.action || "Schritt");
  }
}

function kurz(text) {
  const t = String(text || "");
  return t.length > 48 ? `${t.slice(0, 45)}...` : t;
}

/**
 * Faehrt die Auftraege der Reihe nach gegen die offene Sitzung.
 *
 * Bewusst NACHEINANDER und mit Pause: der Nutzer soll mitkommen. Ein Lauf,
 * der in zwei Sekunden durch ist, sieht aus wie ein Fehler — man sieht nur
 * das Ergebnis und weiss nicht, was passiert ist.
 *
 * @param {object} o
 *   auftraege   aus planAlsAuftraege
 *   sende(aktion) -> Promise<object>  schickt EINE Aktion an die Sitzung
 *   zeige(text, nr, gesamt)  Fortschritt anzeigen
 *   pauseMs     Wartezeit zwischen den Schritten
 *   abbruch()   true => Lauf beenden
 */
export async function fahreAuftraege({ auftraege = [], sende, zeige = () => {}, pauseMs = 700, abbruch = () => false } = {}) {
  const gelesen = {};
  let getan = 0;
  for (const [i, auftrag] of auftraege.entries()) {
    if (abbruch()) return { abgebrochen: true, getan, gelesen };
    zeige(auftrag.beschreibung, i + 1, auftraege.length);
    const antwort = await sende(auftrag.aktion);
    // Fail-closed: bricht ein Schritt, laeuft der Plan NICHT blind weiter.
    // Ein halb ausgefuehrter Plan auf einer fremden Seite ist gefaehrlicher
    // als ein abgebrochener.
    if (!antwort || antwort.ok === false) {
      return { abgebrochen: false, getan, gelesen, fehler: auftrag.beschreibung };
    }
    if (auftrag.liestAls && typeof antwort.gelesen === "string") gelesen[auftrag.liestAls] = antwort.gelesen;
    getan += 1;
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { abgebrochen: false, getan, gelesen };
}
