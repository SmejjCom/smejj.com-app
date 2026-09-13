// smejj.com — Mockups "Startseite + Chat neu", VORSCHLAG 2 (2026-09-13): alle heutigen Icon-Plaetze bleiben.
// Erzeugt sieben Artboards (.dc.html) + canvas.json aus EINER Stilquelle,
// damit alle Bildschirme dieselben Werte tragen (Cyan, Glas, Inter, 8-px-Knick
// an Bedienelementen, sonst eckig — wie public/design-v11.css + eckig.css).
// Aufruf: node baue-mockups.mjs   (schreibt in denselben Ordner)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- Symbole
const I = {
  home: '<path d="m4 11 8-7 8 7"/><path d="M6 10v9h12v-9"/>',
  code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  image: '<rect x="3" y="5" width="18" height="14"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3L16 12l3 3"/>',
  video: '<rect x="3" y="6" width="13" height="12"/><path d="m16 10 5-3v10l-5-3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  wave: '<path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2"/>',
  file: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  browser: '<rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  bot: '<rect x="4" y="7" width="16" height="12"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>',
  system: '<rect x="3" y="4" width="18" height="12"/><path d="M8 20h8M12 16v4"/>',
  model: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>',
  storage: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  send: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  think: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z"/>',
  copy: '<rect x="9" y="9" width="11" height="11"/><path d="M5 15V4h11"/>',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  up: '<path d="M7 11l5-5 5 5M12 6v13"/>',
  thumbup: '<path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9H19a2 2 0 0 1 2 2.2l-1 7A2 2 0 0 1 18 20H7"/>',
  thumbdown: '<path d="M17 13V4h3v9zM17 13l-4 8c-1.5 0-2.5-1-2.5-2.5V15H5a2 2 0 0 1-2-2.2l1-7A2 2 0 0 1 6 4h11"/>',
  camera: '<path d="M5 7h2l2-2h6l2 2h2v11H5z"/><circle cx="12" cy="12.5" r="3.2"/>',
  screen: '<rect x="3" y="4" width="18" height="12"/><path d="m9 20 3-3 3 3"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  panel: '<rect x="3" y="4" width="18" height="16"/><path d="M15 4v16"/>',
  check: '<path d="m5 12 4 4L19 6"/>'
};
const ic = (n, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

// ------------------------------------------------------------------ Stil
const STIL = `
  body { margin: 0; background: #0a0f16; color: #f2f5f4; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: #7ee8da; } a:hover { color: #32f6ea; }
  * { box-sizing: border-box; }
  .glas { background: rgba(255,255,255,0.045); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); }
  .hair { border: 1px solid rgba(255,255,255,0.075); }
  .dim { color: rgba(242,245,244,0.74); }
  .faint { color: rgba(242,245,244,0.52); }
  .cy { color: #32f6ea; }
  .knick { border-radius: 8px; }
  .row { display: flex; align-items: center; gap: 10px; }
  .col { display: flex; flex-direction: column; }
  .nav-btn { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 8px; color: rgba(242,245,244,0.86); font-size: 16px; font-weight: 500; background: transparent; }
  .nav-btn svg { flex: 0 0 auto; color: rgba(242,245,244,0.62); }
  .nav-btn.an { background: rgba(255,255,255,0.07); color: #f2f5f4; box-shadow: inset 2px 0 0 #32f6ea; }
  .nav-btn.an svg { color: #32f6ea; }
  .gruppe { padding: 14px 12px 6px; font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(242,245,244,0.5); }
  .reiter { display: flex; gap: 4px; padding: 3px; border-radius: 8px; background: rgba(0,0,0,0.28); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); }
  .reiter > div { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; border-radius: 6px; font-size: 16px; font-weight: 600; color: rgba(242,245,244,0.7); }
  .reiter > div.an { background: rgba(255,255,255,0.09); color: #f2f5f4; box-shadow: inset 0 0 0 1px rgba(50,246,234,0.55); }
  .reiter > div.an svg { color: #32f6ea; }
  .chip { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 12px; border-radius: 8px; background: rgba(255,255,255,0.06); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); color: rgba(242,245,244,0.86); font-size: 15px; font-weight: 600; white-space: nowrap; }
  .chip.cy { color: #32f6ea; background: rgba(50,246,234,0.12); }
  .ikon-knopf { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 8px; background: rgba(255,255,255,0.06); color: rgba(242,245,244,0.86); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); }
  .ikon-knopf.senden { background: #32f6ea; color: #04211f; box-shadow: 0 0 22px rgba(50,246,234,0.18); }
  .werkzeug { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 84px; border-radius: 8px; background: rgba(255,255,255,0.045); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); color: #f2f5f4; font-size: 15px; font-weight: 600; }
  .werkzeug svg { color: #7ee8da; }
  .werkzeug span { text-align: center; line-height: 1.2; padding: 0 6px; }
  .werkzeug.klein { flex-direction: row; min-height: 44px; padding: 0 14px; gap: 9px; font-size: 15px; white-space: nowrap; flex: 0 0 auto; }
  .frage { align-self: flex-end; max-width: 78%; padding: 12px 16px; border-radius: 8px; background: rgba(255,255,255,0.08); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); font-size: 17px; line-height: 1.45; }
  .antwort { max-width: 100%; font-size: 17px; line-height: 1.55; color: rgba(242,245,244,0.92); }
  .aktion { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 9px; border-radius: 6px; color: rgba(242,245,244,0.62); font-size: 13.5px; font-weight: 600; }
  .codeblock { border-radius: 8px; background: rgba(0,0,0,0.34); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; }
  .codeblock .kopf { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.075); font-family: Inter, system-ui, sans-serif; font-size: 13.5px; color: rgba(242,245,244,0.62); }
  .schreibfeld { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.045); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(50,246,234,0.18); }
  .platzhalter { flex: 1; font-size: 18px; color: rgba(242,245,244,0.5); }
  .avatar { width: 32px; height: 32px; border-radius: 999px; background: #32f6ea; color: #04211f; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; }
  .sicher { background: repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 6px, transparent 6px 12px); }
  .vorschlag { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 14px; border-radius: 8px; font-size: 16.5px; color: rgba(242,245,244,0.82); background: rgba(255,255,255,0.03); }
  .vorschlag svg { color: rgba(242,245,234,0.5); }
`;

const doc = (body, extra = "") => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${STIL}${extra}</style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;

// ---------------------------------------------------------- Bausteine
// Das echte Zeichen aus public/icons/smejj_favicon.svg (Marke #02fdfd).
const LOGO = (s = 24) => `<svg viewBox="0 0 2000 2000" width="${s}" height="${s}" aria-hidden="true"><g transform="translate(233.8325 233.8325) scale(0.7661675 1)"><path d="M691.785,1526.022c-27.687,0-55.336-10.754-76.161-32.17L74.655,937.544c-44.875-46.145-69.587-107.01-69.587-171.376s24.712-125.23,69.587-171.376L615.623,38.486c40.899-42.061,108.149-43.004,150.205-2.1,42.059,40.899,42.997,108.149,2.1,150.205L226.96,742.898c-12.69,13.05-12.69,33.491,0,46.541l540.968,556.308c40.897,42.056,39.958,109.306-2.1,150.205-20.641,20.072-47.36,30.069-74.044,30.069Z" fill="#02fdfd"/><path d="M1308.215,1526.022c-26.688,0-53.4-9.993-74.044-30.069-42.059-40.899-42.997-108.149-2.1-150.205l540.968-556.308c12.688-13.05,12.688-33.491,0-46.541L1232.072,186.591c-40.897-42.056-39.958-109.306,2.1-150.205,42.061-40.895,109.31-39.952,150.205,2.1l540.968,556.308c44.873,46.145,69.587,107.01,69.587,171.376s-24.715,125.23-69.587,171.376l-540.968,556.308c-20.823,21.415-48.479,32.17-76.161,32.17Z" fill="#02fdfd"/><circle cx="1000" cy="555.122" r="118.015" fill="#02fdfd"/><circle cx="1000" cy="977.214" r="118.015" fill="#02fdfd"/></g></svg>`;

// Die beiden Eckknoepfe — HEUTIGE PLAETZE: Logo-Knopf ganz oben links (oeffnet
// und schliesst die linke Spur), Globus ganz oben rechts (oeffnet und schliesst
// das rechte Browser-Fenster), links daneben die Maus-Wiedergabe.
function eckKnoepfe({ oben = 10, links = 0, rechts = 0 } = {}) {
  return `<div style="position: absolute; left: ${links}px; top: ${oben}px; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 8px; background: rgba(255,255,255,0.06); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);">${LOGO(24)}</div>
  <div style="position: absolute; right: ${rechts}px; top: ${oben}px; display: flex; gap: 6px;">
    <div class="ikon-knopf" style="background: rgba(255,255,255,0.06);"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 8-6 1.5L9 19z"/></svg></div>
    <div class="ikon-knopf" style="background: rgba(255,255,255,0.06);">${ic("globe", 20)}</div>
  </div>`;
}

function navZeile(icon, text, { an = false, kuerzel = "", zaehler = "" } = {}) {
  return `<div class="nav-btn${an ? " an" : ""}" style="min-height: 40px;">${ic(icon, 19)}<span style="flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${text}</span>${kuerzel ? `<span class="faint" style="font-size: 12.5px; font-weight: 600;">${kuerzel}</span>` : ""}${zaehler ? `<span class="faint" style="font-size: 13px;">${zaehler}</span>` : ""}</div>`;
}

function reiter(aktiv) {
  return `<div class="reiter">
    <div class="${aktiv === "start" ? "an" : ""}">${ic("home", 19)}<span>Start</span></div>
    <div class="${aktiv === "code" ? "an" : ""}">${ic("code", 19)}<span>Code</span></div>
  </div>`;
}

// Die Spur wie heute (Start/Code-Reiter, dann "Neuer Chat ⌘K, Suchen,
// smejjCloud, smejjBot", dann die Gespraeche nach Tag, "Alle N Gespraeche"),
// NEU nur die Aufteilung in drei Zonen: Kopf fest, Mitte scrollt, Fuss fest.
function spur({ modus = "start", breite = 220, chatAktiv = -1, kopfPolster = 58 } = {}) {
  const startMitte = `
      ${navZeile("plus", "Neuer Chat", { an: chatAktiv < 0, kuerzel: "⌘K" })}
      ${navZeile("search", "Suchen")}
      ${navZeile("cloud", "smejjCloud")}
      ${navZeile("bot", "smejjBot")}
      <div class="gruppe">Heute</div>
      ${navZeile("history", "Python-Funktion, die zwei Zahlen addiert", { an: chatAktiv === 0 })}
      ${navZeile("history", "Drei Farben nennen", { an: chatAktiv === 1 })}
      <div class="gruppe">Früher</div>
      ${navZeile("history", "Ada Lovelace auf Wikipedia nachschlagen")}
      ${navZeile("history", "Mit der Maus im Browser: wikipedia.org")}
      ${navZeile("history", "Chrome-Browser registrieren")}
      ${navZeile("history", "Alle 224 Gespräche", { zaehler: "›" })}
      <div class="gruppe">Mehr</div>
      ${navZeile("folder", "Projekte")}
      ${navZeile("file", "Dateien")}
      ${navZeile("trash", "Papierkorb")}
      ${navZeile("system", "Systemzustand")}
      ${navZeile("model", "KI-Modelle")}
      ${navZeile("storage", "Speicher")}`;
  const codeMitte = `
      ${navZeile("plus", "Neu", { an: true, kuerzel: "⌘K" })}
      ${navZeile("folder", "Meine Projekte")}
      ${navZeile("bot", "Nach Zeitplan")}
      ${navZeile("gear", "Regeln")}
      ${navZeile("chevron", "Mehr")}
      <div class="gruppe">Heute</div>
      ${navZeile("code", "Python-Funktion addieren", { an: true })}
      ${navZeile("code", "Login-Seite responsiv machen")}
      <div class="gruppe">Früher</div>
      ${navZeile("code", "Tests für chat-store.js")}
      ${navZeile("code", "Startgewicht unter 300 KB")}
      ${navZeile("code", "Service Worker v863")}
      ${navZeile("history", "Alle 224 Gespräche", { zaehler: "›" })}`;
  return `<aside style="display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); width: ${breite}px; min-width: 0; min-height: 0; height: 100%; overflow: hidden; background: rgba(255,255,255,0.03); border-right: 1px solid rgba(255,255,255,0.075);">
    <div style="display: flex; flex-direction: column; gap: 8px; padding: ${kopfPolster}px 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.075);">
      ${reiter(modus)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px; padding: 8px 8px 12px; overflow-y: auto;">
      ${modus === "code" ? codeMitte : startMitte}
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 8px 10px; border-top: 1px solid rgba(255,255,255,0.075);">
      ${navZeile("shield", "Kostenschutz an")}
      <div class="row" style="min-height: 46px; padding: 0 6px; gap: 8px;">
        <div class="avatar">s</div>
        <div class="col" style="flex: 1; min-width: 0;">
          <div style="font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">smejjcom@gmail.com</div>
          <div class="faint" style="font-size: 12px;">smejj Plus</div>
        </div>
        <div class="ikon-knopf" style="width: 36px; height: 36px; background: transparent;">${ic("gear", 19)}</div>
      </div>
    </div>
  </aside>`;
}

// Die acht Werkzeug-Chips unter dem Schreibfeld — HEUTIGE Reihenfolge und
// heutiger Platz (direkt unter dem Feld), NEU: Symbol UND Wort statt nur Symbol.
const WERKZEUGE = [["globe", "Im Netz"], ["image", "Bild"], ["video", "Video"], ["camera", "Bild verstehen"], ["pen", "Schreiben"], ["code", "Programmieren"], ["browser", "Browser"], ["file", "Datei"]];
function werkzeuge({ klein = false } = {}) {
  if (klein) return `<div style="display: flex; gap: 8px; overflow-x: auto;">${WERKZEUGE.map(([i, t]) => `<div class="werkzeug klein" style="min-height: 40px; padding: 0 12px; font-size: 14.5px;">${ic(i, 18)}<span>${t}</span></div>`).join("")}</div>`;
  return `<div style="display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px;">${WERKZEUGE.map(([i, t]) => `<div class="werkzeug" style="min-height: 76px;">${ic(i, 24)}<span>${t}</span></div>`).join("")}</div>`;
}
const werkzeugeHandy = () => `<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;">${WERKZEUGE.map(([i, t]) => `<div class="werkzeug" style="min-height: 72px; font-size: 13.5px;">${ic(i, 24)}<span>${t}</span></div>`).join("")}</div>`;

// Das Schreibfeld am Rechner — HEUTIGE Reihenfolge in EINER Zeile:
// [+] [Feld] [Nachdenken] [Modell] [Mikrofon] [Senden/Sprachmodus].
function schreibfeldRechner({ text = "" } = {}) {
  return `<div class="schreibfeld" style="flex-direction: row; align-items: center; gap: 8px; padding: 8px 10px;">
    <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("plus", 22)}</div>
    ${text ? `<div style="flex: 1; font-size: 18px; padding: 0 4px;">${text}</div>` : `<div class="platzhalter" style="padding: 0 4px;">Frag mich alles</div>`}
    <div class="chip">${ic("think", 17)}<span>Nachdenken</span></div>
    <div class="chip">${ic("model", 17)}<span>smejj 1</span>${ic("down", 14)}</div>
    <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("mic", 22)}</div>
    <div class="ikon-knopf senden" style="width: 40px; height: 40px;">${ic("send", 22)}</div>
  </div>`;
}
// Am Handy: Feld oben, darunter EINE Zeile [+] [Nachdenken] [Modell] [Mikrofon] [Senden].
function schreibfeldHandy({ text = "" } = {}) {
  return `<div class="schreibfeld" style="gap: 8px; padding: 10px;">
    <div class="row" style="min-height: 44px; padding: 0 4px;">${text ? `<div style="flex: 1; font-size: 18px;">${text}</div>` : `<div class="platzhalter">Frag mich alles</div>`}</div>
    <div class="row" style="gap: 6px;">
      <div class="ikon-knopf">${ic("plus", 22)}</div>
      <div class="chip" style="padding: 0 10px;">${ic("think", 16)}<span>Nachdenken</span></div>
      <div class="chip" style="padding: 0 10px;">${ic("model", 16)}<span>smejj 1</span></div>
      <div style="flex: 1;"></div>
      <div class="ikon-knopf">${ic("mic", 22)}</div>
      <div class="ikon-knopf senden">${ic("send", 22)}</div>
    </div>
  </div>`;
}

function plusMenue() {
  const z = (i, t, u) => `<div class="row" style="min-height: 44px; padding: 0 12px; gap: 12px;">${ic(i, 20)}<div class="col"><div style="font-size: 15.5px; font-weight: 600;">${t}</div>${u ? `<div class="faint" style="font-size: 12.5px;">${u}</div>` : ""}</div></div>`;
  return `<div style="display: flex; flex-direction: column; width: 300px; padding: 6px; border-radius: 8px; background: #141b24; box-shadow: 0 18px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);">
    <div class="gruppe" style="padding-top: 8px;">Hinzufügen</div>
    ${z("file", "Datei hinzufügen", "PDF, Office, Text, Ton")}
    ${z("image", "Bild hinzufügen", "aus der Mediathek")}
    ${z("camera", "Foto oder Video aufnehmen")}
    ${z("camera", "Kamera")}
    ${z("screen", "Bildschirm teilen")}
    <div class="gruppe">Tun</div>
    ${z("mic", "Sprechen statt tippen")}
    ${z("globe", "Im Netz nachsehen")}
    ${z("image", "Bild erstellen")}
    ${z("video", "Video erstellen")}
    ${z("code", "Programmieren")}
    ${z("browser", "Im Browser für mich klicken")}
    ${z("bot", "Auftrag laufen lassen", "smejjBot")}
  </div>`;
}

// Unter jeder Antwort wie heute: Kopieren, Vorlesen, Hilfreich, Nicht hilfreich
// — NEU mit Wort neben dem Symbol (heute nur Symbol, Wort erst beim Zeigen).
function antwortAktionen(kompakt = false) {
  return `<div class="row" style="gap: 2px;">
    <div class="aktion">${ic("copy", 16)}${kompakt ? "" : "Kopieren"}</div>
    <div class="aktion">${ic("speaker", 16)}${kompakt ? "" : "Vorlesen"}</div>
    <div class="aktion">${ic("thumbup", 16)}${kompakt ? "" : "Hilfreich"}</div>
    <div class="aktion">${ic("thumbdown", 16)}${kompakt ? "" : "Nicht hilfreich"}</div>
  </div>`;
}
const frage = (t) => `<div class="row" style="align-self: flex-end; max-width: 82%; gap: 6px; align-items: flex-start;"><div class="aktion" style="min-height: 26px; padding: 0 4px;">···</div><div class="frage" style="align-self: auto; max-width: 100%;">${t}</div></div>`;

function verlauf({ breit = true } = {}) {
  const ak = antwortAktionen(!breit);
  return `<div class="col" style="gap: 20px;">
    ${frage("Schreibe eine kurze Python-Funktion, die zwei Zahlen addiert. Nur der Code.")}
    <div class="col" style="gap: 8px;">
      <div class="codeblock">
        <div class="kopf"><span>Python · 2 Zeilen</span><div class="row" style="gap: 10px;"><span>Kopieren</span><span>Rechts öffnen</span><span>Als Datei</span></div></div>
        <div style="padding: 12px 14px; line-height: 1.6;"><span style="color: #7ee8da;">def</span> addiere(a, b):<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #7ee8da;">return</span> a + b</div>
      </div>
      ${ak}
    </div>
    ${frage("Nenne drei Farben.")}
    <div class="col" style="gap: 8px;">
      <div class="antwort">Blau, Rot, Grün.</div>
      ${ak}
    </div>
    ${frage("Erstelle ein Bild von einem roten Apfel auf einem Holztisch.")}
    <div class="col" style="gap: 8px;">
      <div class="row" style="gap: 10px; flex-wrap: wrap;"><div class="chip cy">${ic("image", 16)}Bild wird gemalt · 2:10 min</div><div class="faint" style="font-size: 14px;">Das Bild erscheint hier, sobald es fertig ist.</div></div>
      <div class="sicher hair" style="width: ${breit ? 320 : 220}px; height: ${breit ? 200 : 140}px;"></div>
    </div>
  </div>`;
}

// Brotkrume oben in der Mitte — wie heute (top-krume), rechts neben der Spur.
const krume = (t) => `<div class="dim" style="position: absolute; left: 246px; top: 22px; font-size: 14.5px;">${t}</div>`;

// ---------------------------------------------------------- Artboards
// 1) Startseite am Rechner
const StartDesktop = doc(`
<div style="position: relative; display: flex; width: 1440px; height: 900px; overflow: hidden;">
  ${spur({ modus: "start" })}
  <div class="col" style="flex: 1; min-width: 0; align-items: center; justify-content: center; padding: 70px 40px 40px;">
    <div class="col" style="width: 880px; gap: 22px;">
      <div style="font-size: 38px; font-weight: 700; letter-spacing: -0.03em; text-align: center;">Womit kann ich dir helfen?</div>
      ${schreibfeldRechner()}
      ${werkzeuge()}
      <div class="col" style="gap: 6px;">
        <div class="vorschlag">${ic("pen", 18)}<span>Verbessere diesen Text: …</span></div>
        <div class="vorschlag">${ic("globe", 18)}<span>Recherchiere für mich: …</span></div>
        <div class="vorschlag">${ic("browser", 18)}<span>Erledige mit der Maus im Browser: …</span></div>
      </div>
    </div>
  </div>
  ${krume("smejj.com — KI- und Code-Assistent")}
  ${eckKnoepfe()}
</div>`);

// 2) Chat am Rechner (mit offenem Plus-Menue)
const ChatDesktop = doc(`
<div style="position: relative; display: flex; width: 1440px; height: 900px; overflow: hidden;">
  ${spur({ modus: "start", chatAktiv: 0 })}
  <div class="col" style="flex: 1; min-width: 0;">
    <div style="flex: 1; overflow: hidden; padding: 70px 0 0;">
      <div style="width: 880px; margin: 0 auto;">${verlauf()}</div>
    </div>
    <div class="col" style="gap: 10px; padding: 12px 0 22px;">
      <div style="width: 880px; margin: 0 auto;">${schreibfeldRechner()}</div>
      <div style="width: 880px; margin: 0 auto;">${werkzeuge({ klein: true })}</div>
    </div>
  </div>
  <div style="position: absolute; left: 400px; bottom: 140px;">${plusMenue()}</div>
  ${krume("Python-Funktion, die zwei Zahlen addiert")}
  ${eckKnoepfe()}
</div>`);

// 3) Code am Rechner — Reiter oben, "Code" markiert, rechts die heutigen Reiter
const CodeDesktop = doc(`
<div style="position: relative; display: flex; width: 1440px; height: 900px; overflow: hidden;">
  ${spur({ modus: "code" })}
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; flex: 1; min-width: 0; padding-top: 60px;">
    <div class="col" style="gap: 18px; padding: 10px 32px 24px; border-right: 1px solid rgba(255,255,255,0.075);">
      <div style="font-size: 30px; font-weight: 700; letter-spacing: -0.03em;">Was steht als Nächstes an?</div>
      <div class="dim" style="font-size: 16px;">Python-Funktion addieren — Auftrag läuft, Schritt 2 von 3</div>
      <div class="codeblock" style="max-width: 720px;">
        <div class="kopf"><span>public/rechner.js · Änderung</span><span>Ansehen</span></div>
        <div style="padding: 12px 14px; line-height: 1.6; color: #7ef0c2;">+ export function addiere(a, b) {<br>+ &nbsp;&nbsp;return a + b;<br>+ }</div>
      </div>
      <div style="flex: 1;"></div>
      <div class="schreibfeld" style="max-width: 880px;">
        <div class="row" style="min-height: 44px; padding: 0 4px;"><div class="platzhalter">Beschreibe eine Aufgabe oder stelle eine Frage</div></div>
        <div class="row" style="justify-content: space-between; flex-wrap: nowrap; gap: 8px;">
          <div class="row" style="gap: 8px;">
            <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("plus", 22)}</div>
            <div class="chip">${ic("shield", 16)}<span>Auto</span></div>
            <div class="chip">${ic("think", 16)}<span>Automatisch</span></div>
            <div class="chip cy">${ic("folder", 16)}<span>smejj.com App</span></div>
            <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("mic", 22)}</div>
          </div>
          <div class="row" style="gap: 8px;">
            <div class="chip">${ic("model", 16)}<span>smejj 1</span></div>
            <span class="dim" style="font-size: 14px;">Mittel</span>
            <div class="ikon-knopf senden" style="width: 40px; height: 40px;">${ic("send", 22)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col" style="min-height: 0;">
      <div class="row" style="gap: 4px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.075);">
        ${["Browser", "Quellen", "GitHub", "Vorschau", "Status"].map((t, i) => `<div class="chip${i === 3 ? " cy" : ""}" style="min-height: 32px; padding: 0 9px; font-size: 14px;">${t}</div>`).join("")}
      </div>
      <div class="sicher" style="flex: 1; margin: 12px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.075);"></div>
    </div>
  </div>
  ${krume("Projekt: smejj.com App · Ordner /public")}
  ${eckKnoepfe()}
</div>`);

// Handy-Rahmen 390 x 844 — Safe-Areas gehoeren zum Layout (oben 59, unten 34 px),
// in der Hintergrundfarbe, NICHT als schwarzer Balken. Kein nachgemalter Statusbalken.
function handy(inhalt, { hoehe = 844, breite = 390, oben = 59, unten = 34, links = 0, rechts = 0 } = {}) {
  return `<div style="position: relative; width: ${breite}px; height: ${hoehe}px; overflow: hidden; background: #0a0f16;">
    <div style="position: absolute; inset: 0; display: grid; grid-template-rows: ${oben}px minmax(0, 1fr) ${unten}px; grid-template-columns: ${links}px minmax(0, 1fr) ${rechts}px;">
      <div style="grid-column: 1 / -1;"></div>
      <div></div>
      <div class="col" style="min-height: 0; position: relative;">${inhalt}</div>
      <div></div>
      <div style="grid-column: 1 / -1;"></div>
    </div>
  </div>`;
}
// Handy-Kopf wie heute: Logo-Knopf links oben, Globus rechts oben (Maus daneben).
const kopfHandy = () => `<div style="position: relative; height: 56px;">${eckKnoepfe({ oben: 6, links: 8, rechts: 8 })}</div>`;

// 4) Startseite am iPhone (Hochformat)
const StartHandy = doc(handy(`
  ${kopfHandy()}
  <div class="col" style="flex: 1; justify-content: center; gap: 18px; padding: 8px 14px;">
    <div style="font-size: 30px; font-weight: 700; letter-spacing: -0.03em; text-align: center; line-height: 1.15;">Womit kann ich dir helfen?</div>
    ${werkzeugeHandy()}
    <div class="col" style="gap: 6px;">
      <div class="vorschlag" style="min-height: 44px; font-size: 15.5px;">${ic("pen", 18)}<span>Verbessere diesen Text …</span></div>
      <div class="vorschlag" style="min-height: 44px; font-size: 15.5px;">${ic("globe", 18)}<span>Recherchiere für mich …</span></div>
    </div>
  </div>
  <div style="padding: 8px 10px 6px;">${schreibfeldHandy()}</div>
`));

// 5) Chat am iPhone (Hochformat)
const ChatHandy = doc(handy(`
  ${kopfHandy()}
  <div style="flex: 1; min-height: 0; overflow: hidden; padding: 4px 14px 0;">${verlauf({ breit: false })}</div>
  <div class="col" style="gap: 8px; padding: 8px 10px 6px;">
    ${werkzeuge({ klein: true })}
    ${schreibfeldHandy()}
  </div>
`));

// 6) Menue am iPhone — Code offen; Kopf und Fuss stehen, die Mitte scrollt
const MenueHandy = doc(`
<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: #0a0f16;">
  <div style="position: absolute; inset: 0; opacity: 0.35;">${handy(`${kopfHandy()}<div style="flex: 1; padding: 4px 14px;">${verlauf({ breit: false })}</div>`)}</div>
  <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.45);"></div>
  <div style="position: absolute; top: 0; bottom: 0; left: 0; width: 300px; display: grid; grid-template-rows: 59px minmax(0, 1fr) 34px; grid-template-columns: minmax(0, 1fr); background: #0e141c; box-shadow: 8px 0 40px rgba(0,0,0,0.5);">
    <div></div>
    <div style="position: relative; min-height: 0;">
      <div style="position: absolute; inset: 0;">${spur({ modus: "code", breite: 300, kopfPolster: 62 })}</div>
      <div style="position: absolute; left: 8px; top: 6px; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 8px; background: rgba(255,255,255,0.06);">${LOGO(24)}</div>
      <div style="position: absolute; right: 6px; top: 300px; width: 4px; height: 150px; border-radius: 2px; background: rgba(255,255,255,0.18);"></div>
    </div>
    <div></div>
  </div>
</div>`);

// 7) Chat im Querformat (844 x 390): Kerbe links/rechts 59 px, Home-Balken 21 px
const ChatQuer = doc(handy(`
  <div style="position: relative; display: grid; grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100%; min-height: 0;">
    ${spur({ modus: "start", breite: 200, chatAktiv: 0, kopfPolster: 52 })}
    <div class="col" style="min-height: 0; padding-top: 50px;">
      <div style="flex: 1; min-height: 0; overflow: hidden; padding: 0 16px;">
        <div class="col" style="gap: 10px;">
          ${frage("Nenne drei Farben.")}
          <div class="col" style="gap: 4px;"><div class="antwort" style="font-size: 15.5px;">Blau, Rot, Grün.</div>${antwortAktionen()}</div>
        </div>
      </div>
      <div class="row" style="gap: 6px; padding: 6px 10px 4px;">
        <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("plus", 22)}</div>
        <div class="schreibfeld" style="flex: 1; flex-direction: row; align-items: center; padding: 0 12px; min-height: 42px; gap: 8px;"><div class="platzhalter" style="font-size: 16px;">Frag mich alles</div></div>
        <div class="chip" style="min-height: 40px;">${ic("model", 16)}<span>smejj 1</span></div>
        <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("mic", 22)}</div>
        <div class="ikon-knopf senden" style="width: 40px; height: 40px;">${ic("send", 22)}</div>
      </div>
    </div>
    ${eckKnoepfe({ oben: 4, links: 4, rechts: 4 })}
  </div>
`, { hoehe: 390, breite: 844, oben: 0, unten: 21, links: 59, rechts: 59 }));

// ----------------------------------------------------------- Ausgabe
const dateien = { "Main.dc.html": StartDesktop, "ChatDesktop.dc.html": ChatDesktop, "CodeDesktop.dc.html": CodeDesktop, "StartHandy.dc.html": StartHandy, "ChatHandy.dc.html": ChatHandy, "MenueHandy.dc.html": MenueHandy, "ChatQuer.dc.html": ChatQuer };
for (const [name, inhalt] of Object.entries(dateien)) writeFileSync(join(HIER, name), inhalt);
console.log("geschrieben:", Object.keys(dateien).join(", "));
