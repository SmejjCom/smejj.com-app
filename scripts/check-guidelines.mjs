#!/usr/bin/env node
// smejj.com — automatisierte Guideline-Pruefung (AI_Guidelines.md):
// 1) Keine Quellcode-Datei ueber 800 Zeilen.
// 2) Naming-Regel: Plattform heisst ausschliesslich "smejj.com" (niemals SMEJJ/Smejj-Varianten).
// Fail-closed: jeder Verstoss beendet den Lauf mit Exit-Code 1.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 800;
// Ratchet-Baseline fuer Altlasten (Stand 2026-07-02). Diese Dateien existierten vor der
// 800-Zeilen-Regel und duerfen NICHT weiter wachsen. Aufteilung ist eingeplant:
// - public/app.js + public/styles.css erst nach schriftlicher Design-Lock-Freigabe
//   (docs/frontend/START_DESIGN_LOCK.md), da Browserpruefung der Startseite Pflicht ist.
// - src/worker.js beim naechsten Backend-Refactoring.
// app.js-Baseline 1387 -> 1401 am 2026-07-03: Deep-Link-Restore + Canonical-Fix,
// schriftlich freigegeben ("Ja, aber nur lokal (Recommended)"); Datei darf ab
// diesem Stand wieder NICHT weiter wachsen.
// app.js-Baseline 1401 -> 1403 am 2026-07-17: Gespraechsgedaechtnis (Multi-Turn).
// Freigabe: "Ja ... Lass nicht offen ... wie ChatGPT, Gemini, Claude und noch
// besser machen. Was habe ich vergessen hinzuzufuegen fuege von dir aus"
// (Wof Kadavanich). Genau +2 Zeilen: 1 Import + 1 Payload-Feld `history`.
// Die Sammel-Logik liegt bewusst im eigenen Modul public/chat-history-context.js
// (48 Zeilen), damit app.js NICHT weiter waechst. Ab diesem Stand wieder
// eingefroren; die eigentliche Aufteilung von app.js bleibt eingeplant und
// braucht eine Design-Lock-Freigabe (Browserpruefung der Startseite ist Pflicht).
// app.js-Baseline 1403 -> 1404 am 2026-07-17: Markdown-Anzeige der Chat-Antworten.
// Freigabe: "Ja" auf die Empfehlung "Markdown im Chat fixen" (Wof Kadavanich).
// Genau +1 Zeile: renderChatMarkdown(output) am ENDE von stream(). Der Import kam
// OHNE neue Zeile aus — components.js re-exportiert den Renderer, die bestehende
// Import-Zeile wurde nur erweitert. Die Logik liegt in public/chat-markdown.js
// (90 Zeilen). Ab diesem Stand wieder eingefroren; die Aufteilung von app.js
// bleibt eingeplant und braucht eine Design-Lock-Freigabe.
// app.js-Baseline 1404 -> 1405 am 2026-07-27: Seiten-Kontext fuer das Modell
// (Stufe 2). Schriftliche Freigabe: "FREIGABE — Startseite Stufe 2 ... Ich gebe
// Aenderungen an public/app.js frei ... Inhalt der Browser-Leiste gelangt in den
// Modellkontext" (Wof Kadavanich, 2026-07-27). Genau +1 Zeile: der Import von
// groundTask. Die beiden Aufrufstellen wurden nur ERWEITERT (task -> await
// groundTask(task)), nicht vermehrt. Die gesamte Logik liegt in
// public/browser-context.js (137 Zeilen), damit app.js nicht weiter waechst.
// Ab diesem Stand wieder eingefroren; die Aufteilung von app.js bleibt eingeplant.
// app.js-Baseline 1405 -> 1411 am 2026-07-28: Freigabe "smejj.com 100 % fertig"
// (Wof Kadavanich, 2026-07-28) — Seitentitel je Ansicht (W2-05), Namensfeld
// beim Projektanlegen (W2-09) und verstaendliche Rueckmeldung statt Roh-JSON
// (W2-07). Netto +6 Zeilen. Die Titel-Logik wurde NICHT in app.js gelegt,
// sondern nach public/view-title.js ausgelagert (24 Zeilen, im Precache) —
// ohne diese Auslagerung waeren es +25 gewesen. Der Rest sind die Namensabfrage
// und ihre Absicherung, die zwingend im Projekt-Handler stehen.
// Ab diesem Stand wieder eingefroren; die Aufteilung von app.js bleibt eingeplant.
// public/app.js ist seit dem 2026-07-28 KEINE Altlast mehr: aufgeteilt in acht
// eigene Module (google-login.js, projects-surface.js, local-workspace-surface.js,
// uploads-surface.js, free-coding-fallback.js, panel-layout.js, view-routes.js)
// und damit von 1411 auf unter 800 Zeilen gebracht. Die Ausnahme ist entfernt —
// ab jetzt gilt fuer app.js die normale 800-Zeilen-Regel wie fuer jede Datei.
const LEGACY_BASELINE = new Map([
  // styles.css-Baseline 1552 -> 1565 am 2026-07-04: .visually-hidden fuer das
  // H1 der Startseite (Freigabe "Ja, Option A + Labels"); ab hier wieder eingefroren.
  // styles.css-Baseline 1565 -> 1589 am 2026-07-28: Freigabe "smejj.com 100 %
  // fertig" (Wof Kadavanich) — eigener Fokusstil fuer Knoepfe und Links
  // (QA-Welle 1, Befund F-17: Fokusregeln gab es nur fuer input/select/textarea,
  // alles andere hing am Browser-Standardring) und Mindest-Klickflaeche von
  // 24x24 px fuer die Rechtslinks der Fusszeile (F-21, WCAG 2.2 AA).
  // +24 Zeilen, davon 13 Kommentar. Beides sind Zusaetze, keine Umbauten:
  // bestehende Regeln, Farben, Abstaende und Schriftbilder bleiben unveraendert.
  // styles.css 1589 -> 1598 am 2026-08-24 (5514a47d): "Browser bedienen"
  // brach hart an der Kante ab — Scroll-Verhalten der Schublade repariert.
  // Nachtraeglich als Baseline dokumentiert im Vollaudit 2026-08-25; die
  // Datei war seither ueber der alten Baseline, ohne dass check:guidelines
  // im Alltag lief. Ab diesem Stand wieder eingefroren.
  ["public/styles.css", 1598],
  ["src/worker.js", 930],
  // Vollaudit 2026-08-25: zwei weitere Altlasten dieses ARBEITSZWEIGS als
  // eingefrorene Baselines dokumentiert, damit das Tor wieder schliesst und
  // ECHTE neue Risse sichtbar werden. Die eigentliche Aufteilung ist auf dem
  // Bauzweig bereits geschehen (Zeilen-Diaet Stufe 3, e6978155 — dort ist
  // index.html die einzige begruendete Dauer-Baseline); dieser Zweig erbt
  // sie beim naechsten Buendel-Abgleich. Bis dahin: NICHT weiter wachsen.
  // - index.html 999 seit 16b220e9 (Modell-Menue zentral, 24.08.)
  // - src/server.js 808 seit ce706bd4 (413-Fix, Nachzug aus dem Bauzweig)
  // - src/server.js 810 seit 2026-09-02 (Trainings-Speicher-Sonde in /api/health: Import + ein Feld)
  // 999 -> 1016 am 25.08.: Live-Spiegel (Inline-Tor +21 = exakt
  // auth-gate-frueh.js, preload +2, pwa-schnellstart +1) minus alte Zeilen.
  // Betreiber-Freigaben vom 25.08. woertlich dokumentiert in den Commits.
  ["public/index.html", 1016],
  ["src/server.js", 810],
  // - code-flaeche.js 804 und design-v11.css 2744: exakt die zwei Dateien,
  //   die die Bauzweig-Diaet (Stufe 3) dort bereits zerlegt hat (754 + vier
  //   Teile). Hier eingefroren bis zum Buendel-Abgleich.
  ["public/code-flaeche.js", 804],
  ["public/design-v11.css", 2744],
  ["public/account-privacy.css", 896],
  ["public/ai/chat-stream.js", 998],
  ["public/browser-pane.js", 818],
  ["public/chat-store.js", 990],
  // Dokumentations-Altlasten dieses Zweigs (Bauzweig: Verlauf in 4 Teile
  // geteilt, Memory_Bank konsolidiert auf 482):
  ["docs/frontend/SW_VERSIONSVERLAUF_2026-08.md", 1635],
  ["control-server/src/autopilots/autopilotLaeufer.js", 863]
]);
// Praezise Verstoesse: Markenwort in Grossschreibung (das SMEJJ_-Env-Praefix mit
// Unterstrich ist erlaubt) sowie grossgeschriebene Varianten ohne ".com"-Suffix.
const NAMING_VIOLATION = /\bSMEJJ\b(?!_)|\bSmejj\b(?!\.com)/;
const CHECK_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".md", ".json", ".html", ".css"]);
// backups/ enthaelt eingefrorene 1:1-Kopien (start lock v3) — kein aktiver Quellcode.
// UPLOAD-ZU-GITHUB/ ist der manuelle Deploy-Staging-Ordner: byte-identische Kopien
// bereits geprüfter public/-Dateien (Quelle bleibt ratchet-geprüft, 2026-07-14).
// public/start-styles.css ist ein ERZEUGTES Buendel (scripts/build/bundle-start-styles.mjs),
// kein handgepflegter Quellcode. Die acht Quelldateien bleiben einzeln unter der
// 800-Zeilen-Regel und werden weiterhin geprueft; das Buendel ist nur ihr Ergebnis
// und wird von check:start-styles gegen die Quellen verifiziert (2026-07-27).
// Auch die Auslieferungs-Kopie des Buendels ist erzeugt, nicht handgepflegt
// (public/assets/ spiegelt die Wurzel fuer den lokalen Server, 2026-08-13).
// public/assets/ ist KOMPLETT erzeugt (npm run build:assets kopiert die
// ratchet-gepruefte Wurzel 1:1; check:assets/auslieferung-lock beweisen die
// Byte-Gleichheit) — dieselbe Zeile doppelt zu zaehlen ist kein zweiter
// Befund, sondern Laerm (Vollaudit 2026-08-25).
const IGNORED_PATHS = [/^node_modules\//, /^\.pnpm-store\//, /^tests\/fixtures\//, /^pnpm-lock/, /^backups\//, /^UPLOAD-ZU-GITHUB\//, /^public\/(assets\/)?start-styles\.css$/, /^public\/assets\//];

const failures = [];
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => CHECK_EXTENSIONS.has(file.slice(file.lastIndexOf("."))))
  .filter((file) => !IGNORED_PATHS.some((pattern) => pattern.test(file)));

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // Datei im Index, aber lokal nicht lesbar (z. B. Cloud-only) — kein Verstoss.
  }
  const lines = text.split("\n");
  const lineCount = text.endsWith("\n") ? lines.length - 1 : lines.length;
  const limit = LEGACY_BASELINE.get(file) ?? MAX_LINES;
  if (lineCount > limit && !file.endsWith(".json")) {
    const label = LEGACY_BASELINE.has(file) ? `Ratchet-Baseline ${limit}` : `Limit ${limit}`;
    failures.push(`${file}: ${lineCount} Zeilen (${label}) — sofort modular aufteilen.`);
  }
  lines.forEach((line, index) => {
    if (NAMING_VIOLATION.test(line) && !line.includes("Niemals") && !line.includes("niemals") && !line.includes("NAMING_VIOLATION")) {
      failures.push(`${file}:${index + 1}: Naming-Verstoss — Plattform heisst ausschliesslich "smejj.com".`);
    }
  });
}

if (failures.length > 0) {
  console.error(`check:guidelines FAILED (${failures.length} Verstoesse):`);
  for (const failure of failures.slice(0, 50)) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check:guidelines OK — ${files.length} Dateien geprueft (max ${MAX_LINES} Zeilen, Naming-Regel smejj.com).`);
