// smejj.com — 2026-09-06 frueh, Testreihe nach v773: (1) "Lesen: birth_date → »«" dreimal —
// ein LEERES Leseergebnis zaehlte nicht als Fehlschlag, das Modell las dieselbe leere Klasse
// erneut. (2) "Die Maus konnte die Seite nicht ansehen." — scheitert das HINSEHEN (Sitzung
// verdraengt), gab es weder Grund noch Neuaufbau, obwohl beides fuer Aktionen schon da war.
const fs = require("fs"); const path = require("path");
const W = path.resolve(__dirname, "..", "..");
const abs = path.join(W, "public/browser-pane-maus.js"); let t = fs.readFileSync(abs, "utf8");
if (t.includes("nichts gelesen")) { console.log("schon drin"); process.exit(0); }
const EDITS = [
  [`    // 1. HINSEHEN
    zeige(\`Maus \${n}/\${maxSchritte}: sieht sich die Seite an ...\`);
    const blick = await sende({ type: "observe" });
    if (!blick?.beobachtung) return { ok: false, grund: "Die Maus konnte die Seite nicht ansehen.", gelesen };`,
   `    // 1. HINSEHEN
    zeige(\`Maus \${n}/\${maxSchritte}: sieht sich die Seite an ...\`);
    const blick = await sende({ type: "observe" });
    if (!blick?.beobachtung) {
      // Auch das Hinsehen kann an einer verdraengten Sitzung scheitern (live
      // 06.09.: "konnte die Seite nicht ansehen" ohne Grund, Schritt 5). Dann
      // gilt dasselbe wie bei einer Aktion: einmal neu verbinden, Grund nennen.
      const grund = blick?.error ? String(blick.error).slice(0, 120) : "keine Antwort";
      const verloren = blick?.verloren === true || (braucheSitzung && !tab?.sessionId);
      if (verloren && erneuere && !verlauf.some((z) => z.startsWith("UNTERBROCHEN"))) {
        zeige(\`Maus \${n}/\${maxSchritte}: Live-Browser-Sitzung verloren, sie verbindet neu ...\`);
        const wieder = await Promise.resolve(erneuere()).catch(() => false);
        if (!wieder) return { ok: false, grund: \`Die Live-Browser-Sitzung ist abgerissen (\${grund}) und liess sich nicht neu aufbauen — bitte den Auftrag noch einmal senden.\`, gelesen };
        verlauf.push("UNTERBROCHEN: Hinsehen — Sitzung neu aufgebaut");
        n -= 1;
        continue;
      }
      return { ok: false, grund: \`Die Maus konnte die Seite nicht ansehen (\${grund}) — bitte den Auftrag noch einmal senden.\`, gelesen };
    }`],
  [`    if (naechste.liestAls && typeof ergebnis.gelesen === "string") {
      gelesen[naechste.liestAls] = ergebnis.gelesen;
      verlauf.push(\`\${naechste.beschreibung} → »\${ergebnis.gelesen.slice(0, 300)}«\`);
    } else {`,
   `    if (naechste.liestAls && typeof ergebnis.gelesen === "string" && !ergebnis.gelesen.trim()) {
      // NICHTS GELESEN ist ein Fehlschlag, kein Ergebnis (live 06.09.: ".bday"
      // dreimal hintereinander, jedes Mal leer — das Modell hielt »« fuer
      // eine Antwort). Der Verlauf sagt es deutlich; nach zwei Mal ist Schluss.
      fehlschlaege += 1;
      if (fehlschlaege >= FEHLSCHLAG_GRENZE) {
        return { ok: false, grund: \`Maus gestoppt: »\${naechste.beschreibung}« hat zweimal nichts gelesen — das Element gibt es auf der Seite nicht.\`, gelesen };
      }
      verlauf.push(\`FEHLGESCHLAGEN: \${naechste.beschreibung} — nichts gelesen (Element nicht gefunden oder leer); ein anderes Ziel waehlen oder direkt aus dem Seitentext antworten\`);
      zeige(\`Maus \${n}/\${maxSchritte}: \${naechste.beschreibung} — nichts gelesen, sie versucht es anders ...\`);
      continue;
    }
    if (naechste.liestAls && typeof ergebnis.gelesen === "string") {
      gelesen[naechste.liestAls] = ergebnis.gelesen;
      verlauf.push(\`\${naechste.beschreibung} → »\${ergebnis.gelesen.slice(0, 300)}«\`);
    } else {`]
];
let fehler = 0;
for (const [alt, neu] of EDITS) { const n = t.split(alt).length - 1; if (n !== 1) { fehler += 1; console.error(`ANKER ${n===0?"FEHLT":"MEHRDEUTIG"}: ${alt.slice(0,70).replace(/\n/g,"⏎")}`); continue; } t = t.replace(alt, () => neu); }
if (fehler) process.exit(1);
fs.writeFileSync(abs, t); console.log("geschrieben: public/browser-pane-maus.js");
