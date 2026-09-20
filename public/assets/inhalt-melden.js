// smejj.com — "Inhalt melden": anstoessige KI-Antworten direkt in der App melden.
//
// WARUM: Google Play hat das Update am 20.09.2026 ABGELEHNT — "Your app lacks in-app features
// for users to report or flag offensive content". Die Richtlinie fuer KI-generierte Inhalte
// verlangt eine Meldefunktion, die OHNE Verlassen der App funktioniert. Ein Link zur Hilfeseite
// oder eine E-Mail-Adresse reicht dafuer ausdruecklich nicht.
//
// WARUM EIN EIGENES MODUL: chat-menue-mehr.js traegt die anderen Menuepunkte; der Dialog samt
// Gruenden und Versand ist ein eigener Belang und ohne DOM pruefbar (GRUENDE, meldungsNutzlast).
// Der Menuepunkt selbst steht in chat-actions-menu.js (act "report").
import { metaOf, rawOf } from "/assets/chat-messages.js?v=3";
import { toPlainText } from "/assets/chat-actions-menu.js?v=12";
import { showToast } from "/assets/components.js?v=b48";

// Dieselben Kennungen wie in chat-actions.js (Daumen-Signal) — ein Schluesselwechsel
// soll alle Stellen gemeinsam finden.
const TOKEN_KEY = "smejj.auth.accessToken.v1";
const MELDE_URL = "https://api.smejj.com/api/inhalt-meldung";

/** Die Gruende, die der Server kennt (inhaltMeldungRoutes.js GRUENDE). */
export const GRUENDE = Object.freeze([
  { wert: "anstoessig", text: "Anstößig oder unangemessen" },
  { wert: "sexuell", text: "Sexuelle Inhalte" },
  { wert: "gewalt", text: "Gewalt oder gefährlich" },
  { wert: "hass", text: "Hass oder Belästigung" },
  { wert: "falsch", text: "Falsch oder irreführend" },
  { wert: "sonstiges", text: "Etwas anderes" }
]);

/**
 * Was an den Server geht — REIN, ohne DOM: so ist die Pruefung der Gruende und der
 * Laengen testbar, ohne einen Browser zu bauen. Das Lesen aus der Nachricht bleibt
 * in nutzlastAusEintrag().
 */
export function meldungsNutzlast({ inhalt, frage, art, grund, notiz }) {
  return {
    grund: GRUENDE.some((g) => g.wert === grund) ? grund : "sonstiges",
    art: art === "bild" || art === "video" ? art : "text",
    inhalt: toPlainText(inhalt || "").slice(0, 2000),
    frage: toPlainText(frage || "").slice(0, 500),
    notiz: String(notiz || "").slice(0, 500)
  };
}

/** Liest die Nachricht aus und baut daraus die Nutzlast. */
function nutzlastAusEintrag(eintrag, grund, notiz) {
  const vorher = frageVor(eintrag);
  return meldungsNutzlast({
    inhalt: rawOf(eintrag) || "",
    frage: vorher ? rawOf(vorher) || "" : "",
    art: eintrag?.querySelector?.("video") ? "video" : eintrag?.querySelector?.("img") ? "bild" : "text",
    grund,
    notiz
  });
}

/** Die Frage ueber der Antwort — sie macht die Meldung erst pruefbar. */
function frageVor(eintrag) {
  let vor = eintrag?.previousElementSibling;
  while (vor && metaOf(vor)?.role !== "user") vor = vor.previousElementSibling;
  return vor || null;
}

async function sende(nutzlast) {
  const token = window.localStorage?.getItem(TOKEN_KEY) || "";
  const antwort = await fetch(MELDE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(nutzlast)
  });
  if (!antwort.ok) throw new Error(String(antwort.status));
  return antwort.json().catch(() => ({ ok: true }));
}

export function oeffneMeldeBlatt(eintrag) {
  document.getElementById("smejjMelden")?.remove();
  const blatt = document.createElement("div");
  blatt.id = "smejjMelden";
  blatt.className = "melden-blatt";
  blatt.setAttribute("role", "dialog");
  blatt.setAttribute("aria-modal", "true");
  blatt.setAttribute("aria-label", "Inhalt melden");

  const kasten = document.createElement("div");
  kasten.className = "melden-kasten";
  const titel = document.createElement("strong");
  titel.className = "melden-titel";
  titel.textContent = "Inhalt melden";
  const hinweis = document.createElement("p");
  hinweis.className = "melden-hinweis";
  hinweis.textContent = "Was stimmt mit dieser Antwort nicht? Wir prüfen jede Meldung.";

  const liste = document.createElement("div");
  liste.className = "melden-gruende";
  liste.setAttribute("role", "radiogroup");
  liste.setAttribute("aria-label", "Grund");
  let gewaehlt = "";
  for (const grund of GRUENDE) {
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "melden-grund";
    knopf.dataset.grund = grund.wert;
    knopf.setAttribute("role", "radio");
    knopf.setAttribute("aria-checked", "false");
    knopf.textContent = grund.text;
    knopf.addEventListener("click", () => {
      gewaehlt = grund.wert;
      for (const k of liste.querySelectorAll(".melden-grund")) {
        const an = k === knopf;
        k.classList.toggle("ist-gewaehlt", an);
        k.setAttribute("aria-checked", an ? "true" : "false");
      }
      senden.disabled = false;
    });
    liste.append(knopf);
  }

  const notiz = document.createElement("textarea");
  notiz.className = "melden-notiz";
  notiz.rows = 2;
  notiz.maxLength = 500;
  notiz.placeholder = "Optional: kurz beschreiben (nicht nötig)";
  notiz.setAttribute("aria-label", "Zusätzliche Beschreibung");

  const reihe = document.createElement("div");
  reihe.className = "melden-reihe";
  const abbrechen = document.createElement("button");
  abbrechen.type = "button";
  abbrechen.className = "melden-knopf";
  abbrechen.textContent = "Abbrechen";
  const senden = document.createElement("button");
  senden.type = "button";
  senden.className = "melden-knopf ist-primaer";
  senden.textContent = "Melden";
  senden.disabled = true;
  reihe.append(abbrechen, senden);

  kasten.append(titel, hinweis, liste, notiz, reihe);
  blatt.append(kasten);
  document.body.append(blatt);

  const schliessen = () => { blatt.remove(); document.removeEventListener("keydown", taste, true); };
  const taste = (e) => { if (e.key === "Escape") { e.stopPropagation(); schliessen(); } };
  document.addEventListener("keydown", taste, true);
  abbrechen.addEventListener("click", schliessen);
  blatt.addEventListener("click", (e) => { if (e.target === blatt) schliessen(); });

  senden.addEventListener("click", async () => {
    senden.disabled = true;
    senden.textContent = "Wird gesendet …";
    try {
      await sende(nutzlastAusEintrag(eintrag, gewaehlt, notiz.value));
      schliessen();
      showToast("Danke — die Meldung ist angekommen und wird geprüft.", "ok");
    } catch (fehler) {
      // Auch ohne Netz darf die Meldung nicht verpuffen: sie wird lokal gemerkt und
      // beim naechsten Start erneut versucht (nachsendeOffeneMeldungen).
      merkeOffline(nutzlastAusEintrag(eintrag, gewaehlt, notiz.value));
      schliessen();
      showToast(String(fehler?.message) === "401"
        ? "Zum Melden bitte anmelden — die Meldung wird danach gesendet."
        : "Kein Netz — die Meldung wird später gesendet.", "warn");
    }
  });
  liste.querySelector(".melden-grund")?.focus({ preventScroll: true });
  return blatt;
}

const OFFLINE_KEY = "smejj.meldungen.offen.v1";

function merkeOffline(nutzlast) {
  try {
    const offen = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
    offen.push(nutzlast);
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(offen.slice(-20)));
  } catch { /* ohne Speicher: die Meldung ist verloren, der Chat laeuft weiter */ }
}

/** Beim Start: was offline gemeldet wurde, nachreichen. */
export async function nachsendeOffeneMeldungen() {
  let offen = [];
  try { offen = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch { return 0; }
  if (!Array.isArray(offen) || offen.length === 0) return 0;
  const rest = [];
  for (const nutzlast of offen) {
    try { await sende(nutzlast); } catch { rest.push(nutzlast); }
  }
  try {
    if (rest.length) localStorage.setItem(OFFLINE_KEY, JSON.stringify(rest));
    else localStorage.removeItem(OFFLINE_KEY);
  } catch { /* egal */ }
  return offen.length - rest.length;
}

export function initInhaltMelden() {
  if (document.documentElement.dataset.inhaltMelden === "an") return false;
  document.documentElement.dataset.inhaltMelden = "an";
  document.addEventListener("click", (ereignis) => {
    const knopf = ereignis.target.closest?.('.msg-menu [data-act="report"]');
    if (!knopf) return;
    const id = knopf.closest(".msg-menu")?.dataset.for;
    const eintrag = id ? [...document.querySelectorAll("#startLog > .entry")].find((e) => metaOf(e)?.id === id) : null;
    // Menue ueber denselben Weg schliessen wie die Escape-Taste (chat-actions.js).
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (eintrag) oeffneMeldeBlatt(eintrag);
  });
  nachsendeOffeneMeldungen().catch(() => {});
  return true;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initInhaltMelden, { once: true });
  else initInhaltMelden();
}
