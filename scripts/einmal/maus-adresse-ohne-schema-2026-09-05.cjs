// smejj.com — 2026-09-05 abends: Betreiber-Auftrag "gmail.com registrieren" scheiterte dreimal an
// "navigate ohne url" trotz Reparatur — das Modell schreibt die Adresse ohne https:// ("gmail.com").
// Ausserdem konnte niemand sehen, WAS das Modell vorgeschlagen hatte: die 422 nannte nur die
// Schema-Gruende. Jetzt: Adressen ohne Schema werden erkannt (nur echte Hostnamen mit Punkt),
// und die Ablehnung traegt einen "vorschlag" (Aktion + Feldnamen). Wurzel als Argument.
const fs = require("fs"); const path = require("path");
const wurzel = process.argv[2]; if (!wurzel) { console.error("Wurzel fehlt."); process.exit(1); }
const EDITS = {
  "workers/maus-engine/interactive-loop.mjs": [
    [`const URL_MUSTER = /^https?:\\/\\/\\S+$/i;
function urlAus(wert) {
  if (typeof wert === "string" && URL_MUSTER.test(wert.trim())) return wert.trim();`,
     `const URL_MUSTER = /^https?:\\/\\/\\S+$/i;
// Eine Adresse OHNE Schema ("gmail.com", "www.example.com/pfad"): nur echte
// Hostnamen mit Punkt und ohne Leerzeichen — "Weiter" oder "Example Domain"
// bleiben Text (Befund 05.09.: "gmail.com registrieren" scheiterte dreimal).
const HOST_MUSTER = /^(www\\.)?[a-z0-9-]+(\\.[a-z0-9-]+)+(\\/\\S*)?$/i;
function urlAus(wert) {
  if (typeof wert === "string" && URL_MUSTER.test(wert.trim())) return wert.trim();
  if (typeof wert === "string" && HOST_MUSTER.test(wert.trim())) return \`https://\${wert.trim()}\`;`],
    [`    for (const k of ["target", "href", "value", "link", "address", "adresse", "page", "destination"]) {`,
     `    for (const k of ["target", "href", "value", "link", "address", "adresse", "page", "destination", "domain", "site", "website", "host", "seite"]) {`],
    [`  const { decision, repariert } = repariereEntscheidung(normalized.plan);
  const envelope = decisionValidator()(decision);
  if (!envelope.ok) return { ok: false, errors: envelope.errors.slice(0, 10), repariert };`,
     `  const { decision, repariert } = repariereEntscheidung(normalized.plan);
  // Was hat das Modell vorgeschlagen? Ohne diese Zeile sah man bei einer
  // Ablehnung nur Schema-Gruende und musste raten (Befund 05.09.).
  const vorschlag = decision && typeof decision === "object"
    ? { decision: decision.decision, action: decision.step?.action, felder: Object.keys(decision.step || {}) }
    : null;
  const envelope = decisionValidator()(decision);
  if (!envelope.ok) return { ok: false, errors: envelope.errors.slice(0, 10), repariert, vorschlag };`],
    [`    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10), repariert };
  }
  return { ok: true, decision, repariert };`,
     `    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10), repariert, vorschlag };
  }
  return { ok: true, decision, repariert };`]
  ],
  "control-server/src/routes/mausEngineRoutes.js": [
    [`        ok: false, error: "entscheidung_abgelehnt", gruende: entscheidung.errors?.slice(0, 5) || [],
        nachgefragt,`,
     `        ok: false, error: "entscheidung_abgelehnt", gruende: entscheidung.errors?.slice(0, 5) || [],
        nachgefragt,
        vorschlag: entscheidung.vorschlag || null,
        repariert: entscheidung.repariert || [],`]
  ]
};
let fehler = 0;
for (const [rel, paare] of Object.entries(EDITS)) {
  const abs = path.join(wurzel, rel); let text = fs.readFileSync(abs, "utf8");
  if (rel.endsWith("interactive-loop.mjs") && text.includes("HOST_MUSTER")) { console.log("schon drin: " + rel); continue; }
  if (rel.endsWith("mausEngineRoutes.js") && text.includes("vorschlag: entscheidung.vorschlag")) { console.log("schon drin: " + rel); continue; }
  for (const [alt, neu] of paare) { const n = text.split(alt).length - 1; if (n !== 1) { fehler += 1; console.error(`ANKER ${n===0?"FEHLT":"MEHRDEUTIG"} in ${rel}: ${alt.slice(0,60).replace(/\n/g,"⏎")}`); continue; } text = text.replace(alt, () => neu); }
  if (!fehler) { fs.writeFileSync(abs, text); console.log("geschrieben: " + rel); }
}
if (fehler) process.exit(1);
