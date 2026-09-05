// smejj.com — Maus-Livetest 2026-09-05, fuenfter Befund: das Modell schlug "click" mit der
// Web-ADRESSE als Ziel vor (Klicken: https://de.wikipedia.org/wiki/Ada_Lovelace). Die Reparatur
// machte daraus einen Text-Selektor, der Klick ging ins Leere, der Lauf endete. Eine Adresse
// als Klickziel IST ein navigate. Wurzel als Argument; idempotent.
const fs = require("fs"); const path = require("path");
const wurzel = process.argv[2]; if (!wurzel) { console.error("Wurzel fehlt."); process.exit(1); }
const abs = path.join(wurzel, "workers/maus-engine/interactive-loop.mjs"); let t = fs.readFileSync(abs, "utf8");
if (t.includes("klick_auf_adresse_zu_navigate")) { console.log("schon drin"); process.exit(0); }
const alt = `  // 8. Ein nackter Selektor-String wird zum Selektor-Objekt.
  if (typeof s.target === "string" && s.target.trim()) {`;
const neu = `  // 7b. Ein KLICK AUF EINE ADRESSE ist ein navigate (live 2026-09-05: "Klicken:
  //     https://de.wikipedia.org/wiki/Ada_Lovelace" — als Text-Selektor ging der
  //     Klick ins Leere und beendete den Lauf; als navigate ist er genau richtig).
  if (["click", "openLink", "doubleClick"].includes(s.action) && !s.url) {
    const u = urlAus(s.target);
    if (u) { s.action = "navigate"; s.url = u; delete s.target; repariert.push("klick_auf_adresse_zu_navigate"); }
  }
  // 8. Ein nackter Selektor-String wird zum Selektor-Objekt.
  if (typeof s.target === "string" && s.target.trim()) {`;
if (t.split(alt).length !== 2) { console.error("Anker fehlt/mehrdeutig"); process.exit(1); }
fs.writeFileSync(abs, t.replace(alt, () => neu)); console.log("geschrieben: workers/maus-engine/interactive-loop.mjs");
