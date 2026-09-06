// smejj.com — 2026-09-06: Berlin-Auftrag — das Modell tippte per role "textbox" in ein Suchfeld
// (role searchbox) und wiederholte den Selektor nach dem Fehlschlag. Zwei Saetze im Vertrag:
// Eingabefelder per css aus der Elementliste (#id, [name=…]) treffen; role nur mit exakter
// Rolle UND Name; Suchfelder sind searchbox. Wurzel als Argument.
const fs = require("fs"); const path = require("path");
const wurzel = process.argv[2]; if (!wurzel) { console.error("Wurzel fehlt."); process.exit(1); }
const abs = path.join(wurzel, "workers/maus-engine/prompt-template.mjs"); let t = fs.readFileSync(abs, "utf8");
if (t.includes("Suchfelder sind searchbox")) { console.log("schon drin"); process.exit(0); }
const alt = `    "- Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt. Kein Text",
    "  davor oder danach, keine Markdown-Zaeune."
  ].join("\\n");
}`;
const neu = `    // LIVE 06.09.: role "textbox" traf Wikipedias Suchfeld (searchbox) nicht,
    // und nach dem Fehlschlag kam derselbe Selektor noch einmal. Die
    // Elementliste nennt id/name/placeholder — damit trifft css sicher.
    "- EINGABEFELDER: nimm css aus der Elementliste (#id oder input[name=\\"…\\"]);",
    "  role nur mit EXAKTER Rolle UND Name aus dem Bedienbaum. Suchfelder sind",
    "  searchbox, nicht textbox. Nach einem FEHLGESCHLAGENEN Schritt nie denselben",
    "  Selektor wiederholen — ein anderes Ziel aus der Elementliste waehlen.",
    "- Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt. Kein Text",
    "  davor oder danach, keine Markdown-Zaeune."
  ].join("\\n");
}`;
if (t.split(alt).length !== 2) { console.error("Anker fehlt/mehrdeutig"); process.exit(1); }
fs.writeFileSync(abs, t.replace(alt, () => neu)); console.log("geschrieben: workers/maus-engine/prompt-template.mjs");
