#!/usr/bin/env node
// smejj.com — "Alle Modelle sind gerade am Limit" AUF DEN LIVE-STAND legen (10.09.).
//
// ANLASS: Gemessen am 10.09. abends waren beide Gratis-Kontingente (Groq,
// Zhipu) erschoepft. Im Chat stand dann "Modell antwortet nicht (502)" — als
// waere etwas kaputt. Es war nur voll. Der Server unterscheidet das jetzt
// (planer_am_limit + wartezeitMs), und die Zeile im Chat sagt es im Klartext.
// Live traegt browser-pane-maus-frei.js die Zeile (der Zweig hat den Monolithen).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const [klon] = process.argv.slice(2);
if (!klon) { console.error("Aufruf: <klon>"); process.exit(2); }
const VORHER = { "browser-pane-maus-frei.js": "037194136cd0" };
const sha = (t) => createHash("sha256").update(t).digest("hex").slice(0, 12);
const lies = (p) => readFileSync(p, "utf8");
for (const f of Object.keys(VORHER)) {
  const live = lies(join(klon, f));
  if (sha(live) !== VORHER[f]) { console.error(`ABBRUCH: ${f} live (${sha(live)}) ist nicht der erwartete Stand (${VORHER[f]}).`); process.exit(1); }
}
console.log("Sicherheitsnetz: Live-Datei wie erwartet.");
const geaendert = new Set();
{
  const p = join(klon, "browser-pane-maus-frei.js");
  let t = lies(p);
  const alt = "          zeige(`Maus ${n}/${maxSchritte}: Modell antwortet nicht (${r.status}), ${aussetzer === 1 ? \"zweiter\" : aussetzer === 2 ? \"dritter\" : \"noch ein\"} Versuch ...`);";
  const neu = [
    "          // AM LIMIT heisst: warten hilft, wiederholen nicht (gemessen 10.09.,",
    "          // beide Gratis-Kontingente erschoepft). Das gehoert im Klartext hin,",
    "          // sonst sucht der Betreiber den Fehler bei sich.",
    "          const amLimit = String(antwort?.error || \"\").includes(\"planer_am_limit\");",
    "          const sekunden = Math.round(Number(antwort?.wartezeitMs || 0) / 1000);",
    "          zeige(amLimit",
    "            ? `Maus ${n}/${maxSchritte}: alle Modelle sind gerade am Limit${sekunden ? ` — sie wartet ${sekunden} s` : \"\"} ...`",
    "            : `Maus ${n}/${maxSchritte}: Modell antwortet nicht (${r.status}), ${aussetzer === 1 ? \"zweiter\" : aussetzer === 2 ? \"dritter\" : \"noch ein\"} Versuch ...`);",
    "          if (amLimit && sekunden > 0 && sekunden <= 60) await new Promise((fertig) => setTimeout(fertig, sekunden * 1000));"
  ].join("\n");
  if (t.split(alt).length !== 2) { console.error("ABBRUCH: Anker nicht genau einmal gefunden."); process.exit(1); }
  writeFileSync(p, t.replace(alt, neu)); geaendert.add("browser-pane-maus-frei.js");
}
const kandidaten = readdirSync(klon).filter((n) => n.endsWith(".js") || n === "index.html");
const bump = (m) => {
  const x = /^(.*-)(\d+)$/.exec(m); if (x) return x[1] + (Number(x[2]) + 1);
  if (/^\d+$/.test(m)) return String(Number(m) + 1);
  const b = /^b(\d+)$/.exec(m); if (b) return "b" + (Number(b[1]) + 1);
  throw new Error("unbekannte Marke " + m);
};
const offen = [...geaendert]; const protokoll = [];
while (offen.length) {
  const modul = offen.shift();
  const muster = new RegExp(modul.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\?v=([A-Za-z0-9-]+)", "g");
  for (const g of kandidaten) {
    const pfad = join(klon, g); const text = lies(pfad);
    if (!muster.test(text)) continue;
    muster.lastIndex = 0;
    writeFileSync(pfad, text.replace(muster, (_, marke) => `${modul}?v=${bump(marke)}`));
    protokoll.push(`${g}: ${modul}`);
    if (!geaendert.has(g) && g !== "index.html") { geaendert.add(g); offen.push(g); }
    if (g === "index.html") geaendert.add(g);
  }
}
const swPfad = join(klon, "sw.js"); const sw = lies(swPfad);
const m = /const CACHE_NAME = "smejj-shell-v(\d+)";/.exec(sw);
if (!m) { console.error("ABBRUCH: CACHE_NAME nicht gefunden."); process.exit(1); }
const swNeu = `smejj-shell-v${Number(m[1]) + 1}`;
writeFileSync(swPfad, sw.replace(m[0], `const CACHE_NAME = "${swNeu}";`)); geaendert.add("sw.js");
for (const f of geaendert) { const k = join(klon, "assets", f); if (existsSync(k)) writeFileSync(k, lies(join(klon, f))); }
console.log(protokoll.join("\n")); console.log(`SW: ${m[0].match(/v\d+/)[0]} -> ${swNeu}`);
console.log("GEAENDERT:", [...geaendert].sort().join(" "));
writeFileSync("/tmp/maus-am-limit-sw.txt", swNeu);
