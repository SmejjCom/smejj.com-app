// smejj.com — Ersetzungen fuer UI/UX Nr. 7 (Deutsch durchgaengig) + Nr. 8 (Modell-Chips
// erklaert) in public/index.html. Aufruf: node <diese Datei> <pfad zur index.html>.
// Eigene Datei, damit die Kaskade sie vorab an einer KOPIE trocken laufen lassen kann.
const fs = require("node:fs");
const pfad = process.argv[2] || "public/index.html";
let s = fs.readFileSync(pfad, "utf8");
let n = 0;
const ERSETZUNGEN = [
  // Nr. 7 — Deutsch durchgaengig (Audit 26.08.: Projects, Workspace, Disabled, Capabilities)
  ['data-icon="projects" title="Projects">Projects</button>', 'data-icon="projects" title="Projekte">Projekte</button>'],
  ['<section id="arbeitsbereiche" class="view" aria-label="Projects">', '<section id="arbeitsbereiche" class="view" aria-label="Projekte">'],
  ["<h2>Projects</h2>", "<h2>Projekte</h2>"],
  [">In Workspace speichern<", ">Im Arbeitsbereich speichern<"],
  [">Workspace Status<", ">Arbeitsbereich-Status<"],
  ['<option value="disabled">Disabled</option>', '<option value="disabled">Aus</option>'],
  ['<option value="local-browser">Local Browser</option>', '<option value="local-browser">Lokaler Browser</option>'],
  ['<button id="capabilities" type="button">Capabilities</button>', '<button id="capabilities" type="button">Fähigkeiten</button>'],
  ['<button id="localWorkspaceStatus" type="button">Local Workspace</button>', '<button id="localWorkspaceStatus" type="button">Lokaler Arbeitsbereich</button>'],
  ["<strong>Local Workspace</strong>", "<strong>Lokaler Arbeitsbereich</strong>"],
  // Nr. 8 — Modell-Chips erklaert. Die Knopf-Aufschrift kommt aus STUFE_LABEL (app.js)
  // bzw. dem data-model-Wert — sie bleibt kurz, nur Menuepunkte und Tooltips werden laenger.
  ['aria-expanded="false" title="Modell wechseln">smejj 1.0</button>', 'aria-expanded="false" title="Modell wechseln: Schnell, Gründlich oder Experten-Modelle">smejj 1.0</button>'],
  ['data-model="smejj 1.0" data-stufe="auto">smejj 1.0 (Standard)</button>', 'data-model="smejj 1.0" data-stufe="auto" title="Wählt selbst zwischen schnell und gründlich">smejj 1.0 (Standard) — passt sich der Frage an</button>'],
  ['role="menuitem" data-stufe="schnell">Schnell</button>', 'role="menuitem" data-stufe="schnell" title="Kurze Antwort in Sekunden">Schnell — Antwort in Sekunden</button>'],
  ['role="menuitem" data-stufe="gruendlich">Gründlich</button>', 'role="menuitem" data-stufe="gruendlich" title="Nimmt sich Zeit und antwortet ausführlich (langsamer)">Gründlich — ausführlich, dauert länger</button>'],
  ['aria-pressed="false" title="Gründlich nachdenken">', 'aria-pressed="false" title="Nimmt sich Zeit und antwortet gründlicher (langsamer)">'],
  // Vollbild-PWA (Betreiber-Screenshot iPhone 03.09.): Statusleiste transparent ueber dem Rahmen,
  // Farbe der Leiste = dunkle App-Farbe (html-Hintergrund #101113). viewport-fit=cover ist gesetzt,
  // body traegt schon env(safe-area-inset-*) als Innenabstand.
  ['<meta name="apple-mobile-web-app-status-bar-style" content="default">', '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'],
  ['<meta name="theme-color" content="#f7f7f4">', '<meta name="theme-color" content="#101113">']
];
// Manifest (liegt neben der index.html): Farben der PWA-Huelle ebenfalls dunkel.
const MANIFEST = [
  ['"background_color": "#f6f7f9"', '"background_color": "#101113"'],
  ['"theme_color": "#f7f7f4"', '"theme_color": "#101113"']
];
for (const [a, b] of ERSETZUNGEN) {
  const c = s.split(a).length - 1;
  if (!c) { console.log("schon korrigiert oder nicht gefunden:", a.slice(0, 60)); continue; }
  s = s.split(a).join(b);
  n += c;
}
const manifestPfad = pfad.replace(/index\.html$/, "manifest.webmanifest");
if (manifestPfad !== pfad && fs.existsSync(manifestPfad)) {
  let m = fs.readFileSync(manifestPfad, "utf8"); let k = 0;
  for (const [a, b] of MANIFEST) { const c = m.split(a).length - 1; if (c) { m = m.split(a).join(b); k += c; } }
  if (k) { fs.writeFileSync(manifestPfad, m); console.log(k, "Ersetzungen in", manifestPfad); }
}
if (n < 10) {
  console.error("ABBRUCH: nur", n, "Ersetzungen — index.html sieht anders aus als erwartet");
  process.exit(1);
}
fs.writeFileSync(pfad, s);
console.log(n, "Ersetzungen in", pfad);
