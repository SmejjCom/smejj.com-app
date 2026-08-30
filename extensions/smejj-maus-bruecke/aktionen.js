// smejj.com Maus-Bruecke — die Aktionen, ausgefuehrt IN der fremden Seite.
//
// Dieselben Aktionen, die der ferne Browser kennt (session-engine.js), damit
// die Maus im eigenen Chrome nicht anders handelt als dort. Ein zweites
// Vokabular waere eine zweite Wahrheit.
//
// SELBSTTRAGEND: wird von chrome.scripting.executeScript serialisiert. Kein
// import, keine Closure, keine Konstante von aussen.

/**
 * @param {{type:string, strategy?:string, value?:string, name?:string, text?:string, deltaY?:number, n?:number}} aktion
 */
export function handleImSeitenkontext(aktion) {
  // --- Elementsuche: dieselben Strategien wie resolveLocator ---------------
  // Ausgenommen xpath: greift zu leicht quer durch fremde Dokumente, und im
  // ANGEMELDETEN Chrome des Betreibers ist das ein anderes Risiko als im
  // Wegwerf-Browser des Servers. Bewusst enger als der ferne Adapter.
  const sichtbar = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const alle = (auswahl) => [...document.querySelectorAll(auswahl)].filter(sichtbar);
  const gleich = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const enthaelt = (a, b) => String(a || "").trim().toLowerCase().includes(String(b || "").trim().toLowerCase());

  function finde(aktion) {
    // Hat die Maus eine Kennung aus ihrer letzten Beobachtung, gewinnt die:
    // sie zeigt auf GENAU das Element, das sie gesehen hat. Ein Selektor kann
    // inzwischen auf ein zweites, gleich benanntes zeigen.
    if (Number.isInteger(aktion.n) && Array.isArray(window.__smejjMausGesehen)) {
      const el = window.__smejjMausGesehen[aktion.n - 1];
      if (el && el.isConnected) return el;
    }
    const wert = String(aktion.value || "");
    const name = aktion.name;
    switch (String(aktion.strategy || "")) {
      case "css":
        try { return alle(wert)[0] || null; } catch { return null; }
      case "testId":
        return alle(`[data-testid="${CSS.escape(wert)}"]`)[0] || null;
      case "label": {
        const l = [...document.querySelectorAll("label")].find((x) => gleich(x.textContent, wert));
        const ziel = l && (l.control || (l.htmlFor ? document.getElementById(l.htmlFor) : null));
        return ziel || alle(`[aria-label="${CSS.escape(wert)}"]`)[0] || null;
      }
      case "placeholder":
        return alle(`[placeholder="${CSS.escape(wert)}"]`)[0] || null;
      case "altText":
        return alle(`[alt="${CSS.escape(wert)}"]`)[0] || null;
      case "title":
        return alle(`[title="${CSS.escape(wert)}"]`)[0] || null;
      case "role": {
        const kandidaten = alle(`[role="${CSS.escape(wert)}"]`);
        // Rollen haben ein stilles Gegenstueck im HTML: role="button" meint
        // auch <button>. Wer nur [role=...] sucht, findet auf gewoehnlichen
        // Seiten fast nichts — dort steht selten ein ausdrueckliches role.
        const still = { button: "button", link: "a[href]", textbox: "input[type=text], input:not([type]), textarea", searchbox: "input[type=search]", checkbox: "input[type=checkbox]", radio: "input[type=radio]", combobox: "select" }[wert];
        if (still) kandidaten.push(...alle(still));
        if (name === undefined) return kandidaten[0] || null;
        return kandidaten.find((el) => gleich(el.innerText || el.value, name) || gleich(el.getAttribute("aria-label"), name))
          || kandidaten.find((el) => enthaelt(el.innerText, name) || enthaelt(el.getAttribute("aria-label"), name))
          || null;
      }
      case "text": {
        const k = alle("a[href], button, [role=button], input[type=submit], summary");
        // Erst genau, dann enthalten. Genau zuerst, damit "Impressum" nicht
        // an "Impressum und Datenschutz" haengen bleibt, wenn es beides gibt.
        return k.find((el) => gleich(el.innerText || el.value, wert))
          || k.find((el) => enthaelt(el.innerText || el.value, wert))
          || null;
      }
      default:
        return null;
    }
  }

  if (aktion.type === "scroll") {
    window.scrollBy(0, Number(aktion.deltaY) || 600);
    return { ok: true };
  }

  const el = finde(aktion);
  if (!el) return { ok: false, error: "element_nicht_gefunden" };
  el.scrollIntoView({ block: "center", behavior: "auto" });

  if (aktion.type === "selectorText") {
    return { ok: true, gelesen: String(el.innerText || el.value || "").slice(0, 2000) };
  }
  if (aktion.type === "selectorType") {
    // Passwortfelder sind tabu. Im ANGEMELDETEN Chrome des Betreibers tippt
    // die Maus niemals ein Geheimnis — das tut er selbst.
    if (el.type === "password") return { ok: false, error: "passwortfeld_verboten" };
    el.focus();
    el.value = String(aktion.text || "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  if (aktion.type === "selectorClick") {
    el.click();
    return { ok: true };
  }
  return { ok: false, error: `aktion_nicht_erlaubt: ${String(aktion.type).slice(0, 40)}` };
}
