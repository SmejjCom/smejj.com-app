// smejj.com — Mockups "Startseite + Chat neu" (2026-09-13).
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
function navZeile(icon, text, { an = false, kuerzel = "", zaehler = "" } = {}) {
  return `<div class="nav-btn${an ? " an" : ""}">${ic(icon, 20)}<span style="flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${text}</span>${kuerzel ? `<span class="faint" style="font-size: 12.5px; font-weight: 600;">${kuerzel}</span>` : ""}${zaehler ? `<span class="faint" style="font-size: 13px;">${zaehler}</span>` : ""}</div>`;
}

function reiter(aktiv) {
  return `<div class="reiter">
    <div class="${aktiv === "start" ? "an" : ""}">${ic("home", 20)}<span>Start</span></div>
    <div class="${aktiv === "code" ? "an" : ""}">${ic("code", 20)}<span>Code</span></div>
  </div>`;
}

// Die Spur: DREI Zonen — fester Kopf, scrollende Mitte, fester Fuss.
function spur({ modus = "start", breite = 264, chatAktiv = -1, hoehe = "100%" } = {}) {
  const startMitte = `
      ${navZeile("plus", "Neuer Chat", { an: chatAktiv < 0, kuerzel: "⌘K" })}
      ${navZeile("search", "Suchen")}
      <div class="gruppe">Heute</div>
      ${navZeile("history", "Python-Funktion, die zwei Zahlen addiert", { an: chatAktiv === 0 })}
      ${navZeile("history", "Drei Farben nennen", { an: chatAktiv === 1 })}
      <div class="gruppe">Früher</div>
      ${navZeile("history", "Ada Lovelace auf Wikipedia nachschlagen")}
      ${navZeile("history", "Mit der Maus im Browser: wikipedia.org")}
      ${navZeile("history", "Chrome-Browser registrieren")}
      ${navZeile("history", "Alle 224 Gespräche", { zaehler: "›" })}
      <div class="gruppe">Meine Sachen</div>
      ${navZeile("cloud", "smejjCloud")}
      ${navZeile("bot", "smejjBot")}
      ${navZeile("folder", "Projekte")}
      ${navZeile("file", "Dateien")}
      ${navZeile("trash", "Papierkorb")}
      <div class="gruppe">Betrieb</div>
      ${navZeile("system", "Systemzustand")}
      ${navZeile("model", "KI-Modelle")}
      ${navZeile("storage", "Speicher")}`;
  const codeMitte = `
      ${navZeile("plus", "Neuer Auftrag", { an: true, kuerzel: "⌘K" })}
      ${navZeile("folder", "Meine Projekte")}
      ${navZeile("bot", "Nach Zeitplan")}
      ${navZeile("gear", "Regeln")}
      <div class="gruppe">Letzte Aufträge</div>
      ${navZeile("code", "Python-Funktion addieren")}
      ${navZeile("code", "Login-Seite responsiv machen")}
      ${navZeile("code", "Tests für chat-store.js")}
      ${navZeile("history", "Alle Aufträge", { zaehler: "›" })}
      <div class="gruppe">Meine Sachen</div>
      ${navZeile("cloud", "smejjCloud")}
      ${navZeile("file", "Dateien")}
      <div class="gruppe">Betrieb</div>
      ${navZeile("system", "Systemzustand")}
      ${navZeile("model", "KI-Modelle")}`;
  return `<aside style="display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); width: ${breite}px; min-width: 0; height: ${hoehe}; background: rgba(255,255,255,0.03); border-right: 1px solid rgba(255,255,255,0.075);">
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.075);">
      <div class="row" style="justify-content: space-between; padding: 0 4px;">
        <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.03em;">smejj<span class="cy">.</span></div>
        <div class="ikon-knopf" style="width: 36px; height: 36px; background: transparent;">${ic("panel", 20)}</div>
      </div>
      ${reiter(modus)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px; padding: 8px 8px 12px; overflow-y: auto;">
      ${modus === "code" ? codeMitte : startMitte}
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 8px 12px; border-top: 1px solid rgba(255,255,255,0.075);">
      ${navZeile("shield", "Kostenschutz an")}
      <div class="row" style="min-height: 48px; padding: 0 8px;">
        <div class="avatar">s</div>
        <div class="col" style="flex: 1; min-width: 0;">
          <div style="font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">smejjcom@gmail.com</div>
          <div class="faint" style="font-size: 12.5px;">smejj Plus</div>
        </div>
        <div class="ikon-knopf" style="width: 40px; height: 40px; background: transparent;">${ic("gear", 20)}</div>
      </div>
    </div>
  </aside>`;
}

function werkzeuge({ klein = false, spalten = 7 } = {}) {
  const liste = [["image", "Bild erstellen"], ["video", "Video erstellen"], ["code", "Programmieren"], ["mic", "Sprechen"], ["file", "Dateien"], ["globe", "Im Netz suchen"], ["browser", "Browser bedienen"]];
  if (klein) {
    const kurz = [["image", "Bild"], ["video", "Video"], ["code", "Code"], ["mic", "Sprechen"], ["file", "Dateien"], ["globe", "Im Netz"], ["browser", "Browser"], ["bot", "smejjBot"]];
    return `<div style="display: flex; gap: 8px; overflow-x: auto;">${kurz.map(([i, t]) => `<div class="werkzeug klein">${ic(i, 20)}<span>${t}</span></div>`).join("")}</div>`;
  }
  return `<div style="display: grid; grid-template-columns: repeat(${spalten}, minmax(0, 1fr)); gap: 10px;">${liste.map(([i, t]) => `<div class="werkzeug">${ic(i, 26)}<span>${t}</span></div>`).join("")}</div>`;
}

function schreibfeld({ text = "", kompakt = false, sprachmodus = true } = {}) {
  return `<div class="schreibfeld">
    <div class="row" style="min-height: 44px; padding: 0 4px;">
      ${text ? `<div style="flex: 1; font-size: 18px;">${text}</div>` : `<div class="platzhalter">Frag mich alles …</div>`}
    </div>
    <div class="row" style="justify-content: space-between; flex-wrap: wrap; gap: 8px;">
      <div class="row" style="gap: 8px;">
        <div class="ikon-knopf">${ic("plus", 22)}</div>
        <div class="chip">${ic("model", 17)}<span>smejj 1</span>${ic("down", 15)}</div>
        <div class="chip">${ic("think", 17)}<span>${kompakt ? "Nachdenken" : "Gründlich nachdenken"}</span></div>
      </div>
      <div class="row" style="gap: 8px;">
        <div class="ikon-knopf">${ic("mic", 22)}</div>
        ${sprachmodus ? `<div class="ikon-knopf">${ic("wave", 22)}</div>` : ""}
        <div class="ikon-knopf senden">${ic("send", 22)}</div>
      </div>
    </div>
  </div>`;
}

function plusMenue() {
  const z = (i, t, u) => `<div class="row" style="min-height: 46px; padding: 0 12px; gap: 12px;">${ic(i, 20)}<div class="col"><div style="font-size: 15.5px; font-weight: 600;">${t}</div>${u ? `<div class="faint" style="font-size: 12.5px;">${u}</div>` : ""}</div></div>`;
  return `<div class="glas" style="display: flex; flex-direction: column; width: 300px; padding: 6px; border-radius: 8px; background: #141b24; box-shadow: 0 18px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);">
    <div class="gruppe" style="padding-top: 8px;">Hinzufügen</div>
    ${z("file", "Datei hinzufügen", "PDF, Office, Text, Ton")}
    ${z("image", "Bild hinzufügen", "aus der Mediathek")}
    ${z("camera", "Foto oder Video aufnehmen")}
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

function antwortAktionen(kompakt = false) {
  if (kompakt) return `<div class="row" style="gap: 2px;">
    <div class="aktion">${ic("copy", 16)}Kopieren</div>
    <div class="aktion">${ic("speaker", 16)}Vorlesen</div>
    <div class="aktion">${ic("thumbup", 16)}</div>
    <div class="aktion">${ic("thumbdown", 16)}</div>
    <div class="aktion">${ic("pen", 16)}</div>
  </div>`;
  return `<div class="row" style="gap: 2px;">
    <div class="aktion">${ic("copy", 16)}Kopieren</div>
    <div class="aktion">${ic("speaker", 16)}Vorlesen</div>
    <div class="aktion">${ic("thumbup", 16)}</div>
    <div class="aktion">${ic("thumbdown", 16)}</div>
    <div class="aktion">${ic("pen", 16)}Weiter bearbeiten</div>
  </div>`;
}

function verlauf({ breit = true } = {}) {
  const ak = antwortAktionen(!breit);
  return `<div class="col" style="gap: 22px;">
    <div class="frage">Schreibe eine kurze Python-Funktion, die zwei Zahlen addiert. Nur der Code.</div>
    <div class="col" style="gap: 10px;">
      <div class="codeblock">
        <div class="kopf"><span>Python · 2 Zeilen</span><div class="row" style="gap: 10px;"><span>Kopieren</span><span>Rechts öffnen</span><span>Als Datei</span></div></div>
        <div style="padding: 12px 14px; line-height: 1.6;"><span style="color: #7ee8da;">def</span> addiere(a, b):<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #7ee8da;">return</span> a + b</div>
      </div>
      ${ak}
    </div>
    <div class="frage">Nenne drei Farben.</div>
    <div class="col" style="gap: 10px;">
      <div class="antwort">Blau, Rot, Grün.</div>
      ${ak}
    </div>
    <div class="frage">Erstelle ein Bild von einem roten Apfel auf einem Holztisch.</div>
    <div class="col" style="gap: 10px;">
      <div class="row" style="gap: 10px;"><div class="chip cy">${ic("image", 16)}Bild wird gemalt · 2:10 min</div><div class="faint" style="font-size: 14px;">Das Bild erscheint hier, sobald es fertig ist.</div></div>
      <div class="sicher hair" style="width: ${breit ? 320 : 220}px; height: ${breit ? 200 : 140}px;"></div>
    </div>
  </div>`;
}

function kopfzeileDesktop({ titel = "", rechts = true } = {}) {
  return `<div class="row" style="justify-content: space-between; min-height: 56px; padding: 0 20px; border-bottom: 1px solid rgba(255,255,255,0.075);">
    <div class="row" style="gap: 10px;">
      <div class="chip">${ic("model", 17)}<span>smejj 1</span>${ic("down", 15)}</div>
      ${titel ? `<span class="dim" style="font-size: 15px;">${titel}</span>` : ""}
    </div>
    ${rechts ? `<div class="row" style="gap: 8px;">
      <div class="chip">${ic("search", 17)}<span>Suchen</span><span class="faint" style="font-size: 12px;">⌘K</span></div>
      <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("browser", 20)}</div>
    </div>` : ""}
  </div>`;
}

// ---------------------------------------------------------- Artboards
// 1) Startseite am Rechner
const StartDesktop = doc(`
<div style="display: flex; width: 1440px; height: 900px; overflow: hidden;">
  ${spur({ modus: "start" })}
  <div class="col" style="flex: 1; min-width: 0;">
    ${kopfzeileDesktop()}
    <div class="col" style="flex: 1; align-items: center; justify-content: center; gap: 28px; padding: 40px;">
      <div class="col" style="width: 860px; gap: 26px;">
        <div style="font-size: 38px; font-weight: 700; letter-spacing: -0.03em; text-align: center;">Womit kann ich dir helfen?</div>
        ${schreibfeld()}
        ${werkzeuge()}
        <div class="col" style="gap: 6px;">
          <div class="vorschlag">${ic("pen", 18)}<span>Verbessere diesen Text: …</span></div>
          <div class="vorschlag">${ic("globe", 18)}<span>Recherchiere für mich: Was ist neu bei …</span></div>
          <div class="vorschlag">${ic("browser", 18)}<span>Erledige mit der Maus im Browser: …</span></div>
        </div>
      </div>
    </div>
  </div>
</div>`);

// 2) Chat am Rechner (mit offenem Plus-Menue)
const ChatDesktop = doc(`
<div style="display: flex; width: 1440px; height: 900px; overflow: hidden; position: relative;">
  ${spur({ modus: "start", chatAktiv: 0 })}
  <div class="col" style="flex: 1; min-width: 0;">
    ${kopfzeileDesktop({ titel: "Python-Funktion, die zwei Zahlen addiert" })}
    <div style="flex: 1; overflow: hidden; padding: 28px 0 0;">
      <div style="width: 860px; margin: 0 auto;">${verlauf()}</div>
    </div>
    <div class="col" style="gap: 10px; padding: 12px 0 22px;">
      <div style="width: 860px; margin: 0 auto;">${schreibfeld({ kompakt: true })}</div>
      <div style="width: 860px; margin: 0 auto;">${werkzeuge({ klein: true })}</div>
    </div>
  </div>
  <div style="position: absolute; left: 570px; bottom: 150px;">${plusMenue()}</div>
</div>`);

// 3) Code am Rechner — Reiter oben, "Code" markiert
const CodeDesktop = doc(`
<div style="display: flex; width: 1440px; height: 900px; overflow: hidden;">
  ${spur({ modus: "code" })}
  <div class="col" style="flex: 1; min-width: 0;">
    ${kopfzeileDesktop({ titel: "Projekt: smejj.com App · Ordner /public" })}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; flex: 1; min-height: 0;">
      <div class="col" style="gap: 20px; padding: 28px 32px; border-right: 1px solid rgba(255,255,255,0.075);">
        <div style="font-size: 30px; font-weight: 700; letter-spacing: -0.03em;">Was steht als Nächstes an?</div>
        <div class="frage" style="align-self: flex-start; background: transparent; box-shadow: none; padding: 0; max-width: 100%;">Python-Funktion addieren — <span class="dim">Auftrag läuft, Schritt 2 von 3</span></div>
        <div class="codeblock" style="max-width: 720px;">
          <div class="kopf"><span>public/rechner.js · Änderung</span><span>Ansehen</span></div>
          <div style="padding: 12px 14px; line-height: 1.6;"><span style="color: #7ef0c2;">+ export function addiere(a, b) {</span><br><span style="color: #7ef0c2;">+   return a + b;</span><br><span style="color: #7ef0c2;">+ }</span></div>
        </div>
        <div style="flex: 1;"></div>
        <div class="schreibfeld" style="max-width: 860px;">
          <div class="row" style="min-height: 44px; padding: 0 4px;"><div class="platzhalter">Beschreibe eine Aufgabe oder stelle eine Frage …</div></div>
          <div class="row" style="justify-content: space-between; flex-wrap: nowrap; gap: 8px;">
            <div class="row" style="gap: 8px;">
              <div class="ikon-knopf">${ic("plus", 22)}</div>
              <div class="chip">${ic("folder", 17)}<span>smejj.com App</span>${ic("down", 15)}</div>
              <div class="chip">${ic("model", 17)}<span>smejj 1</span>${ic("down", 15)}</div>
              <div class="chip">${ic("shield", 17)}<span>Fragt vorher</span></div>
              <div class="chip">${ic("think", 17)}<span>Mittel</span></div>
            </div>
            <div class="row" style="gap: 8px;">
              <div class="ikon-knopf">${ic("mic", 22)}</div>
              <div class="ikon-knopf senden">${ic("send", 22)}</div>
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
  </div>
</div>`);

// Handy-Rahmen: 390 x 844 — die Safe-Areas sind Teil des Layouts (oben 59 px,
// unten 34 px), gemalt in derselben Farbe, NICHT als schwarzer Balken.
function handy(inhalt, { hoehe = 844, breite = 390, oben = 59, unten = 34, links = 0, rechts = 0 } = {}) {
  return `<div style="position: relative; width: ${breite}px; height: ${hoehe}px; overflow: hidden; background: #0a0f16;">
    <div style="position: absolute; inset: 0; display: grid; grid-template-rows: ${oben}px minmax(0, 1fr) ${unten}px; grid-template-columns: ${links}px minmax(0, 1fr) ${rechts}px;">
      <div style="grid-column: 1 / -1;"></div>
      <div></div>
      <div class="col" style="min-height: 0;">${inhalt}</div>
      <div></div>
      <div style="grid-column: 1 / -1;"></div>
    </div>
  </div>`;
}

function kopfzeileHandy({ titel = "smejj 1", neu = true } = {}) {
  return `<div class="row" style="justify-content: space-between; min-height: 52px; padding: 0 10px;">
    <div class="ikon-knopf" style="background: transparent;">${ic("menu", 24)}</div>
    <div class="chip">${ic("model", 17)}<span>${titel}</span>${ic("down", 15)}</div>
    <div class="ikon-knopf" style="background: transparent;">${neu ? ic("plus", 24) : ic("search", 22)}</div>
  </div>`;
}

function schreibfeldHandy({ text = "" } = {}) {
  return `<div class="schreibfeld" style="gap: 8px; padding: 10px;">
    <div class="row" style="min-height: 44px; padding: 0 4px;">${text ? `<div style="flex: 1; font-size: 18px;">${text}</div>` : `<div class="platzhalter">Frag mich alles …</div>`}</div>
    <div class="row" style="justify-content: space-between;">
      <div class="row" style="gap: 8px;">
        <div class="ikon-knopf">${ic("plus", 22)}</div>
        <div class="chip">${ic("think", 17)}<span>Nachdenken</span></div>
      </div>
      <div class="row" style="gap: 8px;">
        <div class="ikon-knopf">${ic("mic", 22)}</div>
        <div class="ikon-knopf">${ic("wave", 22)}</div>
        <div class="ikon-knopf senden">${ic("send", 22)}</div>
      </div>
    </div>
  </div>`;
}

const werkzeugeHandy = () => {
  const liste = [["image", "Bild"], ["video", "Video"], ["code", "Code"], ["mic", "Sprechen"], ["file", "Dateien"], ["globe", "Im Netz"], ["browser", "Browser"], ["bot", "smejjBot"]];
  return `<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;">${liste.map(([i, t]) => `<div class="werkzeug" style="min-height: 74px; font-size: 14px;">${ic(i, 24)}<span>${t}</span></div>`).join("")}</div>`;
};

// 4) Startseite am iPhone (Hochformat)
const StartHandy = doc(handy(`
  ${kopfzeileHandy()}
  <div class="col" style="flex: 1; justify-content: center; gap: 22px; padding: 12px 16px;">
    <div style="font-size: 30px; font-weight: 700; letter-spacing: -0.03em; text-align: center; line-height: 1.15;">Womit kann ich dir helfen?</div>
    ${werkzeugeHandy()}
    <div class="col" style="gap: 6px;">
      <div class="vorschlag" style="min-height: 44px; font-size: 15.5px;">${ic("pen", 18)}<span>Verbessere diesen Text …</span></div>
      <div class="vorschlag" style="min-height: 44px; font-size: 15.5px;">${ic("globe", 18)}<span>Recherchiere für mich …</span></div>
    </div>
  </div>
  <div style="padding: 8px 12px 6px;">${schreibfeldHandy()}</div>
`));

// 5) Chat am iPhone (Hochformat)
const ChatHandy = doc(handy(`
  ${kopfzeileHandy({ neu: true })}
  <div style="flex: 1; min-height: 0; overflow: hidden; padding: 8px 14px 0;">${verlauf({ breit: false })}</div>
  <div class="col" style="gap: 8px; padding: 8px 12px 6px;">
    <div style="display: flex; gap: 8px; overflow-x: auto;">
      ${[["image", "Bild"], ["video", "Video"], ["code", "Code"], ["file", "Datei"], ["globe", "Netz"], ["browser", "Browser"]].map(([i, t]) => `<div class="werkzeug klein" style="min-height: 40px; font-size: 14px; padding: 0 12px;">${ic(i, 18)}<span>${t}</span></div>`).join("")}
    </div>
    ${schreibfeldHandy()}
  </div>
`));

// 6) Menue am iPhone — Code offen; Kopf und Fuss stehen, die Mitte scrollt
const MenueHandy = doc(`
<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: #0a0f16;">
  <div style="position: absolute; inset: 0; opacity: 0.35;">${handy(`${kopfzeileHandy({ titel: "smejj 1" })}<div style="flex: 1; padding: 8px 14px;">${verlauf({ breit: false })}</div>`)}</div>
  <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.45);"></div>
  <div style="position: absolute; top: 0; bottom: 0; left: 0; width: 318px; display: grid; grid-template-rows: 59px minmax(0, 1fr) 34px; background: #0e141c; box-shadow: 8px 0 40px rgba(0,0,0,0.5);">
    <div></div>
    <div style="display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); min-height: 0; min-width: 0;">
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 6px 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.075);">
        <div class="row" style="justify-content: space-between; padding: 0 4px;">
          <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.03em;">smejj<span class="cy">.</span></div>
          <div class="ikon-knopf" style="width: 40px; height: 40px; background: transparent;">${ic("x", 22)}</div>
        </div>
        ${reiter("code")}
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px; padding: 8px 8px 12px; overflow-y: auto; position: relative;">
        ${navZeile("plus", "Neuer Auftrag", { an: true, kuerzel: "⌘K" })}
        ${navZeile("folder", "Meine Projekte")}
        ${navZeile("bot", "Nach Zeitplan")}
        ${navZeile("gear", "Regeln")}
        <div class="gruppe">Letzte Aufträge</div>
        ${navZeile("code", "Python-Funktion addieren")}
        ${navZeile("code", "Login-Seite responsiv machen")}
        ${navZeile("code", "Tests für chat-store.js")}
        ${navZeile("code", "Startgewicht unter 300 KB")}
        ${navZeile("code", "Service Worker v863")}
        ${navZeile("history", "Alle Aufträge", { zaehler: "›" })}
        <div class="gruppe">Meine Sachen</div>
        ${navZeile("cloud", "smejjCloud")}
        ${navZeile("file", "Dateien")}
        ${navZeile("trash", "Papierkorb")}
        <div class="gruppe">Betrieb</div>
        ${navZeile("system", "Systemzustand")}
        ${navZeile("model", "KI-Modelle")}
        <div style="position: absolute; right: 3px; top: 40px; width: 4px; height: 160px; border-radius: 2px; background: rgba(255,255,255,0.18);"></div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 8px 8px; border-top: 1px solid rgba(255,255,255,0.075);">
        ${navZeile("shield", "Kostenschutz an")}
        <div class="row" style="min-height: 48px; padding: 0 8px;">
          <div class="avatar">s</div>
          <div class="col" style="flex: 1; min-width: 0;">
            <div style="font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">smejjcom@gmail.com</div>
            <div class="faint" style="font-size: 12.5px;">smejj Plus</div>
          </div>
          <div class="ikon-knopf" style="width: 40px; height: 40px; background: transparent;">${ic("gear", 20)}</div>
        </div>
      </div>
    </div>
    <div></div>
  </div>
</div>`);

// 7) Chat im Querformat (844 x 390): Kerbe links 59 px, Home-Balken 21 px
const ChatQuer = doc(handy(`
  <div style="display: grid; grid-template-columns: 220px minmax(0, 1fr); height: 100%;">
    ${spur({ modus: "start", breite: 220, chatAktiv: 0 })}
    <div class="col" style="min-height: 0;">
      <div class="row" style="justify-content: space-between; min-height: 44px; padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,0.075);">
        <div class="chip" style="min-height: 32px;">${ic("model", 16)}<span>smejj 1</span>${ic("down", 14)}</div>
        <div class="row" style="gap: 6px;"><div class="ikon-knopf" style="width: 36px; height: 36px; background: transparent;">${ic("search", 20)}</div><div class="ikon-knopf" style="width: 36px; height: 36px; background: transparent;">${ic("plus", 22)}</div></div>
      </div>
      <div style="flex: 1; min-height: 0; overflow: hidden; padding: 10px 16px 0;">
        <div class="col" style="gap: 12px;">
          <div class="frage" style="font-size: 15.5px; padding: 9px 12px;">Nenne drei Farben.</div>
          <div class="col" style="gap: 6px;"><div class="antwort" style="font-size: 15.5px;">Blau, Rot, Grün.</div>${antwortAktionen()}</div>
        </div>
      </div>
      <div class="row" style="gap: 8px; padding: 6px 12px 4px;">
        <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("plus", 22)}</div>
        <div class="schreibfeld" style="flex: 1; flex-direction: row; align-items: center; padding: 0 12px; min-height: 44px; gap: 8px;"><div class="platzhalter" style="font-size: 16px;">Frag mich alles …</div>${ic("mic", 20)}</div>
        <div class="ikon-knopf" style="width: 40px; height: 40px;">${ic("wave", 22)}</div>
        <div class="ikon-knopf senden" style="width: 40px; height: 40px;">${ic("send", 22)}</div>
      </div>
    </div>
  </div>
`, { hoehe: 390, breite: 844, oben: 0, unten: 21, links: 59, rechts: 59 }));

// ----------------------------------------------------------- Ausgabe
const dateien = { "Main.dc.html": StartDesktop, "ChatDesktop.dc.html": ChatDesktop, "CodeDesktop.dc.html": CodeDesktop, "StartHandy.dc.html": StartHandy, "ChatHandy.dc.html": ChatHandy, "MenueHandy.dc.html": MenueHandy, "ChatQuer.dc.html": ChatQuer };
for (const [name, inhalt] of Object.entries(dateien)) writeFileSync(join(HIER, name), inhalt);

const canvas = {
  artboards: [
    { file: "Main.dc.html", title: "1 · Startseite (Rechner)", x: 0, y: 0, w: 1440, h: 900 },
    { file: "ChatDesktop.dc.html", title: "2 · Chat mit Plus-Menü (Rechner)", x: 1560, y: 0, w: 1440, h: 900 },
    { file: "CodeDesktop.dc.html", title: "3 · Code — Start/Code-Reiter fest oben", x: 3120, y: 0, w: 1440, h: 900 },
    { file: "StartHandy.dc.html", title: "4 · Startseite (iPhone, Vollbild)", x: 0, y: 1060, w: 390, h: 844 },
    { file: "ChatHandy.dc.html", title: "5 · Chat (iPhone)", x: 520, y: 1060, w: 390, h: 844 },
    { file: "MenueHandy.dc.html", title: "6 · Menü (iPhone) — Kopf und Fuß fest, Mitte scrollt", x: 1040, y: 1060, w: 390, h: 844 },
    { file: "ChatQuer.dc.html", title: "7 · Chat im Querformat (iPhone)", x: 1560, y: 1060, w: 844, h: 390 }
  ],
  annotations: [
    { id: "hinweis-idee", x: 0, y: -170, w: 700, text: "Leitidee: Nichts suchen müssen.\nDie sieben Hauptwerkzeuge (Bild, Video, Code, Sprechen, Dateien, Netz, Browser) stehen als beschriftete Kacheln DIREKT unter dem Schreibfeld — am Rechner in einer Reihe, am Handy als 4×2-Raster. Das Modell steht immer sichtbar in der Kopfzeile. Farben, Glas und Schrift sind die des heutigen Designs (ein Cyan, eckig, 8-px-Knick nur an Bedienelementen). Alle Funktionen von heute bleiben: Plus-Menü, Modellwahl, Nachdenken, Mikrofon, Sprachmodus, Kostenschutz, Profil, Einstellungen." },
    { id: "hinweis-menue", x: 3120, y: -120, w: 520, text: "Linkes Menü in DREI festen Zonen: Kopf (Logo + Start/Code-Reiter) bleibt IMMER stehen, die Mitte scrollt, der Fuß (Kostenschutz, Konto, Zahnrad) bleibt IMMER stehen. Damit kann Start/Code nie mehr wegscrollen — auf keinem Gerät." },
    { id: "hinweis-vollbild", x: 0, y: 1960, w: 900, text: "Vollbild am Handy: Die Fläche reicht von ganz oben bis ganz unten. Die Ränder (Statusleiste 59 px, Home-Balken 34 px, im Querformat die Kerbe links/rechts 59 px) sind in derselben Farbe gemalt — kein schwarzer Balken. Das Schreibfeld sitzt direkt über dem Home-Balken; öffnet sich die Tastatur, rückt es mit hoch (Viewport-Höhe dynamisch, keine festen Pixelhöhen). Kein nachgemalter Statusbalken: der echte des Geräts liegt oben drüber." }
  ],
  launch: { view: "canvas" }
};
writeFileSync(join(HIER, "canvas.json"), JSON.stringify(canvas, null, 2));
console.log("geschrieben:", Object.keys(dateien).join(", "), "+ canvas.json");
