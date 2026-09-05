// smejj.com — 2026-09-06: Berlin-Auftrag scheiterte: das Modell tippte per role "textbox",
// Wikipedias Suchfeld ist eine "searchbox"; nach dem Fehlschlag wiederholte es denselben
// Selektor. Das Panel HAT aber die Beobachtung mit der Elementliste (tag, type, id, name,
// placeholder, text). Schlaegt ein Selektor fehl, leitet es daraus Ersatzziele ab und probiert
// sie, bevor der Fehlschlag zaehlt: Rollen-Alias (textbox/searchbox/combobox), dann css aus
// id/name/placeholder der passenden Eingabefelder; beim Klicken Elemente mit passendem Text.
const fs = require("fs"); const path = require("path");
const W = path.resolve(__dirname, "..", "..");
const abs = path.join(W, "public/browser-pane-maus.js"); let t = fs.readFileSync(abs, "utf8");
if (t.includes("export function ersatzZiele")) { console.log("schon drin"); process.exit(0); }
const EDITS = [
  [`/** Eine Entscheidung der Maus in eine Panel-Aktion uebersetzen. */
export function entscheidungAlsAktion(entscheidung) {`,
`/**
 * Ersatzziele aus der EIGENEN Beobachtung, wenn ein Selektor nicht trifft.
 *
 * LIVE 06.09.: das Modell tippte per role "textbox", Wikipedias Suchfeld ist
 * eine "searchbox" — und nach dem Fehlschlag kam derselbe Selektor noch
 * einmal. Das Panel weiss es besser: es hat die Elementliste der Seite
 * (tag, type, id, name, placeholder, text). Daraus werden hier Kandidaten
 * gebaut, deterministisch, hoechstens drei. Kein Raten ins Blaue: nur
 * Elemente, die zur Aktion passen (Eingabefelder zum Tippen, Links und
 * Knoepfe mit passendem Text zum Klicken).
 */
export function ersatzZiele(aktion, beobachtung) {
  const elemente = Array.isArray(beobachtung?.elements) ? beobachtung.elements : [];
  const escape = (s) => String(s).replace(/["\\\\]/g, "\\\\$&");
  const cssFuer = (el) => el.id ? \`#\${String(el.id).replace(/([^a-zA-Z0-9_-])/g, "\\\\$1")}\`
    : el.name ? \`\${el.tag}[name="\${escape(el.name)}"]\`
    : el.placeholder ? \`\${el.tag}[placeholder="\${escape(el.placeholder)}"]\`
    : el.type ? \`\${el.tag}[type="\${escape(el.type)}"]\` : null;
  const kandidaten = [];
  const schluessel = (k) => \`\${k.type}|\${k.strategy}|\${k.value}|\${k.name || ""}\`;
  const original = schluessel(aktion);
  const nimm = (k) => { if (k && schluessel(k) !== original && !kandidaten.some((x) => schluessel(x) === schluessel(k))) kandidaten.push(k); };

  if (aktion?.type === "selectorType") {
    if (aktion.strategy === "role" && ["textbox", "searchbox", "combobox"].includes(aktion.value)) {
      for (const rolle of ["searchbox", "textbox", "combobox"]) nimm({ ...aktion, value: rolle });
    }
    const rang = (el) => (el.type === "search" ? 3 : 0) + (/such|search|\\bq\\b|query/i.test([el.name, el.id, el.placeholder, el.label].join(" ")) ? 2 : 0) + (el.type === "text" || !el.type ? 1 : 0);
    const felder = elemente
      .filter((el) => (el.tag === "input" && !["hidden", "submit", "button", "checkbox", "radio", "password", "file", "image", "reset"].includes(String(el.type || "").toLowerCase())) || el.tag === "textarea")
      .sort((a, b) => rang(b) - rang(a));
    for (const el of felder.slice(0, 3)) { const css = cssFuer(el); if (css) nimm({ type: "selectorType", strategy: "css", value: css, text: aktion.text }); }
  }
  if (aktion?.type === "selectorClick") {
    const wort = String(aktion.name || aktion.value || "").trim().toLowerCase();
    if (wort.length >= 2) {
      const treffer = elemente.filter((el) => ["a", "button", "input", "summary"].includes(el.tag)
        && [el.text, el.label, el.name, el.title, el.value, el.id].some((x) => x && String(x).toLowerCase().includes(wort)));
      for (const el of treffer.slice(0, 2)) {
        const css = cssFuer(el);
        if (css) nimm({ type: "selectorClick", strategy: "css", value: css });
        else if (el.text) nimm({ type: "selectorClick", strategy: "text", value: String(el.text).slice(0, 80) });
      }
    }
  }
  return kandidaten.slice(0, 3);
}

/** Kurzform eines Ziels fuer die Fortschrittszeile. */
function zielKurz(k) {
  return k.strategy === "role" ? \`Rolle \${k.value}\${k.name ? \` „\${k.name}“\` : ""}\` : \`\${k.strategy} \${k.value}\`;
}

/** Eine Entscheidung der Maus in eine Panel-Aktion uebersetzen. */
export function entscheidungAlsAktion(entscheidung) {`],
  [`    zeige(\`Maus \${n}/\${maxSchritte}: \${naechste.beschreibung}\`);
    const ergebnis = await sende(naechste.aktion);
    if (!ergebnis || ergebnis.ok === false) {
      const grund = ergebnis?.error ? String(ergebnis.error).slice(0, 120) : "keine Antwort";`,
   `    zeige(\`Maus \${n}/\${maxSchritte}: \${naechste.beschreibung}\`);
    let ergebnis = await sende(naechste.aktion);
    // ERSATZZIELE, bevor der Fehlschlag zaehlt: das Panel hat die Elementliste
    // der Seite und kann ein Suchfeld auch dann treffen, wenn das Modell die
    // falsche Rolle riet (live 06.09.: textbox statt searchbox, zweimal).
    if ((!ergebnis || ergebnis.ok === false) && !ergebnis?.verloren && /selector_ohne_treffer|selector|nicht gefunden|not_found|kein_treffer/i.test(String(ergebnis?.error || "selector"))) {
      for (const ersatz of ersatzZiele(naechste.aktion, blick.beobachtung)) {
        if (abbruch()) break;
        zeige(\`Maus \${n}/\${maxSchritte}: \${naechste.beschreibung} — Ersatzziel \${zielKurz(ersatz)} ...\`);
        const zweit = await sende(ersatz);
        if (zweit && zweit.ok !== false) {
          verlauf.push(\`\${naechste.beschreibung}: Ziel \${zielKurz(naechste.aktion)} traf nicht, Ersatzziel \${zielKurz(ersatz)} hat getroffen\`);
          ergebnis = zweit;
          break;
        }
      }
    }
    if (!ergebnis || ergebnis.ok === false) {
      const grund = ergebnis?.error ? String(ergebnis.error).slice(0, 120) : "keine Antwort";`]
];
let fehler = 0;
for (const [alt, neu] of EDITS) { const n = t.split(alt).length - 1; if (n !== 1) { fehler += 1; console.error(`ANKER ${n===0?"FEHLT":"MEHRDEUTIG"}: ${alt.slice(0,70).replace(/\n/g,"⏎")}`); continue; } t = t.replace(alt, () => neu); }
if (fehler) process.exit(1);
fs.writeFileSync(abs, t); console.log("geschrieben: public/browser-pane-maus.js");
