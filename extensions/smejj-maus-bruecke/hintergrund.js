// smejj.com Maus-Bruecke — Hintergrund (MV3 Service Worker).
//
// Single Responsibility: Befehle der Maus entgegennehmen, gegen die sichtbar
// erteilten Freigaben pruefen und im aktiven Tab ausfuehren lassen.
//
// WARUM ES DIESE ERWEITERUNG GIBT — und warum NICHT --remote-debugging-port:
// Ein Chrome mit offenem Debug-Port nimmt Befehle von jedem lokalen Programm
// entgegen und kennt keine Herkunftspruefung. Wer ihn oeffnet, gibt in einem
// Zug alle angemeldeten Konten des Betreibers frei. Diese Erweiterung kann
// dagegen nur, was der Betreiber je Herkunft ausdruecklich erlaubt hat, und
// nur die fuenf Aktionen, die die Maus-Engine ueberhaupt schickt.
//
// GRENZEN, bewusst und hart:
//   * kein eval, kein Ausfuehren von Skripttext aus der Nachricht
//   * keine Passwortfelder (input[type=password] wird nie beschrieben)
//   * keine Cookies, kein storageState, keine Dateien
//   * jede Freigabe laeuft nach FREIGABE_DAUER_MS von selbst ab
import { beobachteImSeitenkontext } from "./beobachter.js";
import { handleImSeitenkontext } from "./aktionen.js";

const FREIGABE_DAUER_MS = 30 * 60 * 1000;
const ERLAUBTE_BEFEHLE = new Set(["navigate", "click", "type", "assert", "screenshot"]);

// Das Vokabular des fernen Browsers — Zeichen fuer Zeichen dasselbe, damit
// der freie Lauf, die Entscheidung auf dem Server und der Schritt-Pruefer
// unveraendert bleiben. Nur der Transport ist ein anderer.
const MAUS_AKTIONEN = new Set(["observe", "selectorClick", "selectorType", "selectorText", "navigate", "scroll"]);
const BEOBACHTUNG_MAX_ELEMENTE = 60;
const BEOBACHTUNG_MAX_ZEICHEN = 6000;

// DIE MAUS ARBEITET IN EINEM EIGENEN TAB, nie im gerade aktiven.
//
// Der aktive Tab ist waehrend eines Auftrags fast immer smejj.com selbst —
// der Nutzer sieht ja zu. Wer auf "den aktiven Tab" klickt, bedient also die
// eigene App statt der Zielseite. Ausserdem waere jeder Tabwechsel des
// Nutzers mitten im Lauf ein Sprung auf eine fremde Seite: die Maus klickt
// dann in einer Bank, weil dort gerade jemand nachgesehen hat.
let mausTabId = null;

async function mausTab({ erzeugeMit = null } = {}) {
  if (mausTabId !== null) {
    const vorhanden = await chrome.tabs.get(mausTabId).catch(() => null);
    if (vorhanden) return vorhanden;
    mausTabId = null;
  }
  if (!erzeugeMit) return null;
  const neu = await chrome.tabs.create({ url: erzeugeMit, active: true });
  mausTabId = neu.id;
  return neu;
}

// Nach einer Navigation muss das Dokument stehen, sonst liest die Maus die
// vorige Seite. Chrome meldet das ueber tabs.onUpdated — darauf wird gewartet,
// statt eine Zeitspanne zu raten (die ist auf langsamen Seiten immer falsch).
function warteBisGeladen(tabId, grenzeMs = 15000) {
  return new Promise((fertig) => {
    let erledigt = false;
    const schluss = (grund) => { if (erledigt) return; erledigt = true; chrome.tabs.onUpdated.removeListener(horcher); fertig(grund); };
    const horcher = (id, info) => { if (id === tabId && info.status === "complete") schluss("geladen"); };
    chrome.tabs.onUpdated.addListener(horcher);
    setTimeout(() => schluss("zeit_abgelaufen"), grenzeMs);
    chrome.tabs.get(tabId).then((t) => { if (t?.status === "complete") schluss("war_schon_da"); }).catch(() => {});
  });
}

async function freigaben() {
  const { freigaben: liste = {} } = await chrome.storage.local.get("freigaben");
  const jetzt = Date.now();
  const gueltig = {};
  for (const [herkunft, bis] of Object.entries(liste)) {
    if (Number(bis) > jetzt) gueltig[herkunft] = bis;
  }
  return gueltig;
}

export async function freigabeErteilen(herkunft) {
  const liste = await freigaben();
  liste[herkunft] = Date.now() + FREIGABE_DAUER_MS;
  await chrome.storage.local.set({ freigaben: liste });
  return liste;
}

export async function freigabeEntziehen(herkunft) {
  const liste = await freigaben();
  delete liste[herkunft];
  await chrome.storage.local.set({ freigaben: liste });
  return liste;
}

function herkunftVon(url) {
  try {
    const parsed = new URL(String(url));
    // Nur https: im Browser des Betreibers laufen echte Anmeldungen mit.
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

// --- Der Maus-Weg: dieselben Aktionen wie im fernen Browser -------------------
//
// Fail-closed an drei Stellen, und jede nennt ihren Grund im Klartext: eine
// Aktion, die halb laeuft, ist im angemeldeten Chrome des Betreibers schlimmer
// als eine, die ehrlich abbricht.
export async function fuehreAktionAus(aktion) {
  const typ = String(aktion?.type || "");
  if (!MAUS_AKTIONEN.has(typ)) return { ok: false, error: `aktion_nicht_erlaubt: ${typ.slice(0, 40)}` };

  if (typ === "navigate") {
    const herkunft = herkunftVon(aktion.url);
    if (!herkunft) return { ok: false, error: "nur_https" };
    const erlaubt = await freigaben();
    if (!erlaubt[herkunft]) return { ok: false, error: `herkunft_nicht_freigegeben: ${herkunft}` };
    const tab = await mausTab({ erzeugeMit: aktion.url });
    if (!tab?.id) return { ok: false, error: "kein_maus_tab" };
    if (tab.url !== aktion.url) await chrome.tabs.update(tab.id, { url: aktion.url });
    await warteBisGeladen(tab.id);
    return { ok: true };
  }

  const tab = await mausTab();
  if (!tab?.id) return { ok: false, error: "kein_maus_tab: erst eine Seite oeffnen" };
  // Die Freigabe wird bei JEDEM Schritt neu geprueft, nicht nur beim Oeffnen.
  // Sonst liefe ein Auftrag nach Ablauf der 30 Minuten einfach weiter — und
  // die sichtbare Zusage des Betreibers waere eine Zusage auf Zeit gewesen,
  // die niemand einhaelt. Auch eine Weiterleitung auf eine fremde Herkunft
  // faellt hier auf.
  const herkunft = herkunftVon(tab.url);
  if (!herkunft) return { ok: false, error: "nur_https" };
  const erlaubt = await freigaben();
  if (!erlaubt[herkunft]) return { ok: false, error: `herkunft_nicht_freigegeben: ${herkunft}` };

  if (typ === "observe") {
    const [treffer] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: beobachteImSeitenkontext,
      args: [BEOBACHTUNG_MAX_ELEMENTE, BEOBACHTUNG_MAX_ZEICHEN]
    });
    const beobachtung = treffer?.result;
    return beobachtung ? { ok: true, beobachtung } : { ok: false, error: "seite_nicht_lesbar" };
  }

  const [treffer] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: handleImSeitenkontext,
    args: [aktion]
  });
  const ergebnis = treffer?.result || { ok: false, error: "keine_antwort_aus_der_seite" };
  // Ein Klick kann eine neue Seite oeffnen. Ohne dieses Warten liest der
  // naechste observe-Schritt noch die alte — die Maus entscheidet dann auf
  // einem Bild, das es nicht mehr gibt.
  if (ergebnis.ok && typ === "selectorClick") await warteBisGeladen(tab.id, 8000);
  return ergebnis;
}

// Fail-closed: unbekannter Befehl, fehlende Freigabe oder fehlender Tab
// beenden die Verarbeitung mit einem klaren Grund — nie mit einem Notbehelf.
async function fuehreAus(befehl) {
  if (!befehl || !ERLAUBTE_BEFEHLE.has(String(befehl.typ))) {
    return { ok: false, error: `befehl_nicht_erlaubt: ${String(befehl?.typ).slice(0, 40)}` };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "kein_aktiver_tab" };

  const zielUrl = befehl.typ === "navigate" ? befehl.url : tab.url;
  const herkunft = herkunftVon(zielUrl);
  if (!herkunft) return { ok: false, error: "nur_https" };
  const erlaubt = await freigaben();
  if (!erlaubt[herkunft]) {
    return { ok: false, error: `herkunft_nicht_freigegeben: ${herkunft}` };
  }

  if (befehl.typ === "navigate") {
    await chrome.tabs.update(tab.id, { url: befehl.url });
    return { ok: true, ergebnis: { url: befehl.url, status: 200 } };
  }
  if (befehl.typ === "screenshot") {
    const datenUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
    return { ok: true, ergebnis: { pngBase64: String(datenUrl).split(",")[1] || "" } };
  }
  // click / type / assert laufen im Seitenkontext — als FUNKTION, nie als
  // Text. Damit kann eine manipulierte Nachricht keinen Code einschleusen.
  const [treffer] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: imSeitenkontext,
    args: [befehl]
  });
  return treffer?.result || { ok: false, error: "keine_antwort_aus_der_seite" };
}

// Laeuft IN der Seite. Bewusst klein und ohne jede Auswertung von Fremdtext.
function imSeitenkontext(befehl) {
  const suche = (ziel) => {
    if (!ziel) return null;
    const wert = String(ziel.wert || "");
    if (ziel.strategie === "css") return document.querySelector(wert);
    if (ziel.strategie === "testId") return document.querySelector(`[data-testid="${CSS.escape(wert)}"]`);
    if (ziel.strategie === "label") {
      const label = [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === wert);
      return label?.control || (label?.htmlFor ? document.getElementById(label.htmlFor) : null);
    }
    if (ziel.strategie === "role") {
      const name = String(ziel.name || "");
      const kandidaten = [...document.querySelectorAll(`[role="${CSS.escape(wert)}"], ${wert === "button" ? "button" : "*"}`)];
      return kandidaten.find((el) => !name || el.textContent.trim() === name || el.getAttribute("aria-label") === name) || null;
    }
    if (ziel.strategie === "text") {
      return [...document.querySelectorAll("a, button, [role=button]")].find((el) => el.textContent.trim() === wert) || null;
    }
    return null;
  };

  if (befehl.typ === "assert") {
    if (befehl.bedingung === "titleContains") {
      return { ok: true, ergebnis: { titel: document.title } };
    }
    if (befehl.bedingung === "urlMatches") {
      return { ok: true, ergebnis: { url: location.href } };
    }
    return { ok: true, ergebnis: { anzahl: suche(befehl.ziel) ? 1 : 0 } };
  }

  const element = suche(befehl.ziel);
  if (!element) return { ok: false, error: "element_nicht_gefunden" };

  if (befehl.typ === "click") {
    element.click();
    return { ok: true, ergebnis: {} };
  }
  if (befehl.typ === "type") {
    // Passwortfelder sind tabu. Die Maus tippt im Browser des Betreibers
    // niemals ein Geheimnis — das tut er selbst.
    if (element.type === "password") return { ok: false, error: "passwortfeld_verboten" };
    element.focus();
    element.value = String(befehl.text || "");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, ergebnis: {} };
  }
  return { ok: false, error: "befehl_nicht_erlaubt" };
}

// Nur smejj.com darf ueberhaupt Nachrichten schicken (externally_connectable
// im Manifest). Das ist die erste Schranke; die Freigabe je Herkunft die zweite.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((nachricht, absender, antworte) => {
    if (!String(absender?.origin || "").startsWith("https://smejj.com")) {
      antworte({ ok: false, error: "absender_nicht_erlaubt" });
      return false;
    }
    // Zwei Woerter, zwei Wege: `befehl` ist der alte Adapter-Weg der
    // Maus-Engine, `aktion` der neue der Seite. Sie bleiben getrennt, damit
    // der bestehende Weg samt seiner 13 Tests unberuehrt weiterlaeuft.
    const arbeit = nachricht?.aktion
      ? fuehreAktionAus(nachricht.aktion)
      : nachricht?.hallo
        ? Promise.resolve({ ok: true, bereit: true, version: chrome.runtime.getManifest().version })
        : fuehreAus(nachricht?.befehl);
    arbeit
      .then(antworte)
      .catch((error) => antworte({ ok: false, error: String(error?.message || error).slice(0, 200) }));
    return true; // asynchrone Antwort
  });
}
