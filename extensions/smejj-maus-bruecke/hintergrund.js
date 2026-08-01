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
const FREIGABE_DAUER_MS = 30 * 60 * 1000;
const ERLAUBTE_BEFEHLE = new Set(["navigate", "click", "type", "assert", "screenshot"]);

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
    fuehreAus(nachricht?.befehl)
      .then(antworte)
      .catch((error) => antworte({ ok: false, error: String(error?.message || error).slice(0, 200) }));
    return true; // asynchrone Antwort
  });
}
