// smejj.com Maus-Engine — ARIA-Baum-Beobachter (das "Auge" nach ZCode-Vorbild).
// Single Responsibility: aus der Playwright-Seite den Accessibility-Baum holen
// und als kompakten, eingerueckten Text formatieren — Rolle, Name, Zustand.
// KEIN Roh-DOM, KEIN Screenshot, KEIN Modell.
//
// WARUM ein zweites Auge neben observer.mjs: Der bisherige Beobachter sammelt
// per querySelectorAll eine flache Liste (max 60 Elemente) und uebersieht
// alles, was nicht in seiner Selektorliste steht — genau daran war der
// Fern-Browser "blind" (observe lieferte 9 leere Elemente, siehe Memory
// smejj-fern-browser-blind). Der Accessibility-Baum kommt dagegen aus
// Chromium selbst: berechnete Rollen und beschriftete Namen, hierarchisch,
// wie ZCode/Codex ihn als domSnapshot benutzen. Er ist die Wahrheit darueber,
// was ein Nutzer BEDIENEN kann — nicht darueber, was im Quelltext steht.
//
// Playwright-Stand: der Worker laeuft auf 1.45.3. page.accessibility.snapshot()
// existiert dort (spaeter als "deprecated" markiert, aber funktionsfaehig);
// locator.ariaSnapshot() gibt es erst ab 1.49 — deshalb bauen wir den Text
// selbst und behalten damit auch die Kappung und Maskierung in der Hand.

export const ARIA_BAUM_LIMIT_CHARS = 24_000;
export const ARIA_BAUM_MAX_NODES = 800;
const NAME_LIMIT = 120;
const WERT_LIMIT = 80;
const MASKED_VALUE = "***";

// Rollen, die reine Verpackung sind: eine Zeile ohne Namen traegt keine
// Information, ihre Kinder ruecken einfach eine Ebene hoch. So bleibt der
// Baum kurz, ohne dass Inhalte verschwinden.
const DURCHSICHTIGE_ROLLEN = new Set(["generic", "none", "presentation", "InlineTextBox", "LineBreak"]);

// Zustaende in stabiler Reihenfolge — deterministische Ausgabe, damit zwei
// Beobachtungen derselben Seite zeichengleich sind (Tests, Cache, Vergleich).
const ZUSTAND_FLAGS = ["disabled", "focused", "readonly", "required", "selected", "pressed", "expanded", "modal", "multiline"];

function kuerzen(text, limit) {
  const s = String(text ?? "");
  return s.length > limit ? `${s.slice(0, limit)}…` : s;
}

// Passwort-Erkennung fail-closed: Chromium maskiert AXValue von
// Passwortfeldern selbst, aber wir verlassen uns nicht darauf. Jede
// Textbox, deren Name nach Passwort klingt, verliert ihren Wert.
function istPasswortKnoten(node) {
  if (node.role !== "textbox") return false;
  return /passw|kennwort|passphrase|pin\b/i.test(String(node.name || ""));
}

function zeileFuerKnoten(node) {
  let zeile = `- ${node.role}`;
  const name = kuerzen(node.name, NAME_LIMIT);
  if (name) zeile += ` ${JSON.stringify(name)}`;
  const zustaende = [];
  for (const flag of ZUSTAND_FLAGS) {
    if (node[flag] === true) zustaende.push(flag);
  }
  // checked/level tragen Werte statt nur ja/nein.
  if (node.checked !== undefined && node.checked !== false) zustaende.push(`checked=${node.checked}`);
  if (Number.isFinite(node.level)) zustaende.push(`level=${node.level}`);
  if (zustaende.length > 0) zeile += ` [${zustaende.join(", ")}]`;
  let wert = node.value ?? node.valuetext;
  if (wert !== undefined && wert !== null && String(wert) !== "") {
    wert = istPasswortKnoten(node) ? MASKED_VALUE : kuerzen(wert, WERT_LIMIT);
    zeile += `: ${JSON.stringify(String(wert))}`;
  }
  return zeile;
}

// Baum -> Textzeilen. Durchsichtige Knoten ohne Namen werden uebersprungen
// (Kinder ruecken hoch), alles andere bekommt eine eingerueckte Zeile.
// Harte Kappung ueber maxNodes: der Rest der Seite faellt weg und wird als
// "gekappt" gemeldet — nie stillschweigend.
export function formatAriaBaum(wurzel, { maxNodes = ARIA_BAUM_MAX_NODES } = {}) {
  const zeilen = [];
  let knoten = 0;
  let gekappt = false;
  const laufe = (node, tiefe) => {
    if (!node || typeof node !== "object") return;
    if (gekappt) return;
    const durchsichtig = DURCHSICHTIGE_ROLLEN.has(String(node.role || "")) && !node.name;
    let kinderTiefe = tiefe;
    if (!durchsichtig) {
      if (knoten >= maxNodes) { gekappt = true; return; }
      knoten += 1;
      zeilen.push(`${"  ".repeat(tiefe)}${zeileFuerKnoten(node)}`);
      kinderTiefe = tiefe + 1;
    }
    const kinder = Array.isArray(node.children) ? node.children : [];
    for (const kind of kinder) {
      laufe(kind, kinderTiefe);
      if (gekappt) return;
    }
  };
  laufe(wurzel, 0);
  return { text: zeilen.join("\n"), knoten, gekappt };
}

// Haupteinstieg: Seite -> { url, titel, baum, knoten, gekappt }.
// Zeichen-Kappung als zweite Verteidigungslinie NACH der Knoten-Kappung:
// eine Seite mit 800 kurzen Knoten passt, eine mit langen Texten wird
// zusaetzlich am Zeichenlimit geschnitten.
export async function buildAriaObservation(page, grenzen = {}) {
  const maxNodes = Number.isFinite(grenzen.maxNodes) ? grenzen.maxNodes : ARIA_BAUM_MAX_NODES;
  const limitChars = Number.isFinite(grenzen.limitChars) ? grenzen.limitChars : ARIA_BAUM_LIMIT_CHARS;
  const wurzel = await page.accessibility.snapshot({ interestingOnly: true });
  const { text, knoten, gekappt } = formatAriaBaum(wurzel, { maxNodes });
  let baum = text;
  let zeichenGekappt = false;
  if (baum.length > limitChars) {
    baum = `${baum.slice(0, limitChars)}\n… [am Zeichenlimit gekappt]`;
    zeichenGekappt = true;
  }
  return {
    url: page.url(),
    titel: await page.title().catch(() => ""),
    baum,
    knoten,
    gekappt: gekappt || zeichenGekappt
  };
}
