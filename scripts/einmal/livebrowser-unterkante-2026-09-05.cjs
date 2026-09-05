// smejj.com — Betreiber-Befund 2026-09-05 (Bildschirmfoto): unter der Seite im Live-Browser
// bleibt ein dunkler Streifen, die Seite trifft nicht die Unterkante. Ursache (im Browser
// bewiesen, 213 px Streifen bei 1165x600-Bild in 813 px Hoehe): der Rahmen hat seit dem
// Entfernen der Kopfzeile (17.08.) zwei Gitterzeilen "auto minmax(0,1fr)", die Buehne landet
// in der auto-Zeile und wird nur so hoch wie das Bild; darunter zeigt die leere 1fr-Zeile den
// dunklen Grund. Dazu zog remoteBrowserViewport() noch die 38 px der laengst entfernten
// Kopfzeile ab, und der Nachlauf bei Groessenaenderung galt nur fuer "remote-browser", nicht
// fuer den Live-Browser. Textanker, idempotent. Aufruf: node <datei> [--pruefen]
const fs = require("fs"); const path = require("path");
const nurPruefen = process.argv.includes("--pruefen");
const W = path.resolve(__dirname, "..", "..");
const EDITS = {
  "public/browser-pane-render.js": [
    [`    main{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);box-sizing:border-box}
    header{display:flex;align-items:center;gap:10px;min-height:38px;padding:0 10px;border-bottom:1px solid rgba(246,243,238,.12);background:#18191c}
    strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
    header .bp-live-state{color:#9fe7d4;font-size:11px;white-space:nowrap}`,
     `    /* EINE Gitterzeile. Die Kopfzeile ist seit dem 17.08. weg — die zweite Zeile
       "auto" blieb stehen, die Buehne rutschte hinein und wurde nur so hoch wie
       das Bild. Darunter zeigte die leere 1fr-Zeile den dunklen Grund: der
       Streifen unter der Seite, den der Betreiber am 05.09. sah (im Browser
       nachgestellt: 213 px bei einem 600 px hohen Bild in 813 px Hoehe). */
    main{height:100%;display:grid;grid-template-rows:minmax(0,1fr);box-sizing:border-box}
    header{display:flex;align-items:center;gap:10px;min-height:38px;padding:0 10px;border-bottom:1px solid rgba(246,243,238,.12);background:#18191c}
    strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
    header .bp-live-state{color:#9fe7d4;font-size:11px;white-space:nowrap}`],
    [`    .bp-live-stage img{display:block;width:100%;height:100%;object-fit:contain;background:#fff;user-select:none;-webkit-user-drag:none}`,
     `    .bp-live-stage img{display:block;width:100%;height:100%;object-fit:contain;object-position:center top;background:#fff;user-select:none;-webkit-user-drag:none}`]
  ],
  "public/browser-pane-fernwege.js": [
    [`    const height = clampViewport((rect?.height || 0) - 38, 360, 1200, 900);`,
     `    // Kein Abzug mehr: die 38 px galten der Kopfzeile im Rahmen, die es seit
    // dem 17.08. nicht mehr gibt. Mit dem Abzug war das Bild 38 px kuerzer als
    // die Buehne — Rand statt Seite (Betreiber-Befund 05.09.).
    const height = clampViewport(rect?.height || 0, 360, 1200, 900);`]
  ],
  "public/browser-pane.js": [
    [`import { verdrahteMausKnopf } from "./browser-pane-maus.js?v=browser-pane-20260905-3";`,
     `import { verdrahteMausKnopf, mausLaeuft } from "./browser-pane-maus.js?v=browser-pane-20260905-3";`],
    [`    if (!tab || tab.mode !== "remote-browser" || !tab.url || tab.status === "loading") return;
    const current = remoteBrowserViewport();`,
     `    // Auch der LIVE-Browser folgt der Panelgroesse: sein Bild kommt in der
    // Groesse, die beim Oeffnen galt. Wird das Panel danach hoeher, blieb das
    // Bild kuerzer als die Buehne (Betreiber-Befund 05.09.: Seite trifft die
    // Unterkante nicht). Waehrend die Maus arbeitet, wird NICHT neu geoeffnet:
    // das wuerde ihre Sitzung mitten im Schritt abreissen.
    if (!tab || !["remote-browser", "live-browser"].includes(tab.mode) || !tab.url || tab.status === "loading") return;
    if (tab.mode === "live-browser" && mausLaeuft()) return;
    const current = remoteBrowserViewport();`],
    [`    state.lastRemoteRefitAt = now;
    navigate(tab, tab.url, { push: false });`,
     `    state.lastRemoteRefitAt = now;
    if (tab.mode === "live-browser") { oeffneImLiveBrowser(tab.url).catch(() => {}); return; }
    navigate(tab, tab.url, { push: false });`]
  ]
};
let fehler = 0;
for (const [rel, paare] of Object.entries(EDITS)) {
  const abs = path.join(W, rel); let text = fs.readFileSync(abs, "utf8");
  if (rel.endsWith("render.js") && text.includes("EINE Gitterzeile")) { console.log("schon drin: " + rel); continue; }
  if (rel.endsWith("fernwege.js") && text.includes("Kein Abzug mehr")) { console.log("schon drin: " + rel); continue; }
  if (rel.endsWith("browser-pane.js") && text.includes("Auch der LIVE-Browser folgt")) { console.log("schon drin: " + rel); continue; }
  for (const [alt, neu] of paare) {
    const n = text.split(alt).length - 1;
    if (n !== 1) { fehler += 1; console.error(`ANKER ${n === 0 ? "FEHLT" : "MEHRDEUTIG"} in ${rel}: ${alt.slice(0, 60).replace(/\n/g, "⏎")}`); continue; }
    text = text.replace(alt, () => neu);
  }
  if (!fehler && !nurPruefen) { fs.writeFileSync(abs, text); console.log("geschrieben: " + rel); } else console.log((nurPruefen ? "Vorschau: " : "NICHT geschrieben: ") + rel);
}
if (fehler) process.exit(1);
