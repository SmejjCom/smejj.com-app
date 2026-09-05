// smejj.com — Maus-Livetest 2026-09-05, Abend: der ferne Browser haelt hoechstens vier
// Sitzungen (session-engine maxSessions), die aelteste fliegt raus. Mit sieben Panel-Tabs plus
// Testlaeufen verlor die Maus mitten im Lauf ihre Sitzung: runAct meldete nichts (undefined),
// onLost warf den Tab in die eingebettete Ansicht ("Inhalt blockiert"), der Lauf endete mit
// "Maus gestoppt bei: Lesen: heading" — ohne Grund. Und: der gelesene Wert kam nie zum Modell,
// deshalb las es dieselbe Ueberschrift zweimal. Vier Aenderungen, alle im Panel. Textanker.
const fs = require("fs"); const path = require("path");
const nurPruefen = process.argv.includes("--pruefen"); const W = path.resolve(__dirname, "..", "..");
const EDITS = {
  "public/browser-pane-session.js": [[
`    const error = String(data?.error || "");
    if (error === "session_busy") return; // Aktion verworfen — naechste kommt durch.
    if (error === "session_unknown" || error === "session_expired" || !data) {
      openIds.delete(sessionId);
      queues.delete(sessionId);
      tab.sessionId = "";
      hooks?.onLost?.(tab);
    }
  }`,
`    const error = String(data?.error || "");
    if (error === "session_busy") return { ok: false, error, beschaeftigt: true }; // Aktion verworfen — naechste kommt durch.
    if (error === "session_unknown" || error === "session_expired" || !data) {
      openIds.delete(sessionId);
      queues.delete(sessionId);
      tab.sessionId = "";
      hooks?.onLost?.(tab);
      return { ok: false, error: error || "keine_antwort", verloren: true };
    }
    // DEN GRUND MITGEBEN. Vorher endete jeder Fehlschlag hier als undefined —
    // die Maus sah nur "gestoppt bei", nie warum (live 05.09.: Sitzung vom
    // Server verdraengt, gemeldet als leeres Nichts).
    return data;
  }`]],
  "public/browser-pane.js": [
    [`  onLost: (tab) => {
    showHint("Live-Browser-Session beendet — verbinde neu ...");
    if (tab.url) navigate(tab, tab.url, { push: false });
  }`,
`  onLost: (tab) => {
    showHint("Live-Browser-Sitzung beendet — verbinde neu ...");
    if (!tab.url) return;
    // Waehrend die Maus arbeitet, verbindet SIE neu (erneuere) — sonst bauen
    // zwei Stellen gleichzeitig eine Sitzung auf.
    if (mausLaeuft()) return;
    // ERST der Live-Browser, DANN der eingebettete Rahmen. Vorher fiel der Tab
    // sofort in die eingebettete Ansicht: darin sieht die Maus nichts, und der
    // Nutzer bekam bei vielen Seiten nur "Inhalt blockiert" (live 05.09., als
    // der ferne Browser die aelteste seiner vier Sitzungen verdraengte).
    tryLiveBrowser(tab, tab.url, { push: false })
      .then((ok) => { if (!ok) navigate(tab, tab.url, { push: false }); })
      .catch(() => navigate(tab, tab.url, { push: false }));
  }`],
    [`    sende: (aktion) => sessionClient.actUndWarte(activeTab(), aktion, sessionHooks)
  });`,
`    sende: (aktion) => sessionClient.actUndWarte(activeTab(), aktion, sessionHooks),
    // Sitzung mitten im Lauf verloren? Die Maus baut sie hier neu auf.
    erneuere: async () => { const t = activeTab(); if (!t?.url) return false; return tryLiveBrowser(t, t.url, { push: false }); }
  });`]
  ],
  "public/browser-pane-maus.js": [
    [`export const AUSSETZER_GRENZE = 3;
`, `export const AUSSETZER_GRENZE = 3;
// Wie oft eine Aktion scheitern darf, bevor der Lauf endet. Ein Fehlschlag
// ist meist ein falsches Ziel — das Modell kann es korrigieren, wenn es den
// Grund erfaehrt. Zwei sind genug: wer zweimal danebenliegt, braucht einen
// anderen Auftrag, keinen dritten Versuch.
export const FEHLSCHLAG_GRENZE = 2;
`],
    [`export function verdrahteMausKnopf({ knopf, activeTab, planeUrl, holeToken, sende, zeige, render }) {`,
     `export function verdrahteMausKnopf({ knopf, activeTab, planeUrl, holeToken, sende, zeige, render, erneuere = null }) {`],
    [`  bausteine = { knopf: knopf || null, activeTab, planeUrl, holeToken, sende, zeige, render };`,
     `  bausteine = { knopf: knopf || null, activeTab, planeUrl, holeToken, sende, zeige, render, erneuere };`],
    [`  const { knopf, activeTab, planeUrl, holeToken, sende, render } = bausteine;`,
     `  const { knopf, activeTab, planeUrl, holeToken, sende, render, erneuere } = bausteine;`],
    [`      : await fuehreFreienLaufAus({
        auftrag: text, tab, schrittUrl: planeUrl, holeToken, sende, zeige: melde, abbruch: () => anhalten
      });`,
     `      : await fuehreFreienLaufAus({
        auftrag: text, tab, schrittUrl: planeUrl, holeToken, sende, zeige: melde, abbruch: () => anhalten, erneuere
      });`],
    [`  abbruch = () => false, maxSchritte = FREI_MAX_SCHRITTE, braucheSitzung = true,
  schrittFristMs = SCHRITT_FRIST_MS
} = {}) {`,
     `  abbruch = () => false, maxSchritte = FREI_MAX_SCHRITTE, braucheSitzung = true,
  schrittFristMs = SCHRITT_FRIST_MS, erneuere = null
} = {}) {`],
    [`  let aussetzer = 0;
  for (let n = 1; n <= maxSchritte; n += 1) {`,
     `  let aussetzer = 0;
  let fehlschlaege = 0;
  for (let n = 1; n <= maxSchritte; n += 1) {`],
    [`    const ergebnis = await sende(naechste.aktion);
    if (!ergebnis || ergebnis.ok === false) {
      return { ok: false, grund: \`Maus gestoppt bei: \${naechste.beschreibung}\`, gelesen };
    }
    if (naechste.liestAls && typeof ergebnis.gelesen === "string") gelesen[naechste.liestAls] = ergebnis.gelesen;
    // Der Verlauf haelt sie davon ab, im Kreis zu laufen: ohne ihn entscheidet
    // sie bei gleichem Seitenzustand jedes Mal dasselbe.
    verlauf.push(naechste.beschreibung);
  }`,
     `    const ergebnis = await sende(naechste.aktion);
    if (!ergebnis || ergebnis.ok === false) {
      const grund = ergebnis?.error ? String(ergebnis.error).slice(0, 120) : "keine Antwort";
      // SITZUNG VERLOREN (live 05.09.: der ferne Browser haelt vier Sitzungen,
      // die aelteste fliegt raus — mitten im Lauf). Nicht aufgeben, neu
      // verbinden und den Schritt noch einmal versuchen. Einmal.
      const verloren = ergebnis?.verloren === true || (braucheSitzung && !tab?.sessionId);
      if (verloren && erneuere && !verlauf.some((z) => z.startsWith("UNTERBROCHEN"))) {
        zeige(\`Maus \${n}/\${maxSchritte}: Live-Browser-Sitzung verloren, sie verbindet neu ...\`);
        const wieder = await Promise.resolve(erneuere()).catch(() => false);
        if (!wieder) return { ok: false, grund: \`Die Live-Browser-Sitzung ist abgerissen (\${grund}) und liess sich nicht neu aufbauen — bitte den Auftrag noch einmal senden.\`, gelesen };
        verlauf.push(\`UNTERBROCHEN: \${naechste.beschreibung} — Sitzung neu aufgebaut, Schritt noch NICHT ausgefuehrt\`);
        n -= 1; // der Schritt zaehlt nicht, es ist nichts geschehen
        continue;
      }
      if (verloren) return { ok: false, grund: \`Die Live-Browser-Sitzung ist abgerissen (\${grund}) — bitte den Auftrag noch einmal senden.\`, gelesen };
      // EIN FEHLSCHLAG IST EIN HINWEIS, KEIN ENDE. Meist ein falsches Ziel;
      // mit dem Grund im Verlauf waehlt das Modell ein anderes.
      fehlschlaege += 1;
      if (fehlschlaege >= FEHLSCHLAG_GRENZE) {
        return { ok: false, grund: \`Maus gestoppt: »\${naechste.beschreibung}« ist zweimal fehlgeschlagen (\${grund}).\`, gelesen };
      }
      verlauf.push(\`FEHLGESCHLAGEN: \${naechste.beschreibung} (\${grund}) — bitte anders vorgehen\`);
      zeige(\`Maus \${n}/\${maxSchritte}: \${naechste.beschreibung} hat nicht geklappt (\${grund}), sie versucht es anders ...\`);
      continue;
    }
    // Der Verlauf haelt sie davon ab, im Kreis zu laufen: ohne ihn entscheidet
    // sie bei gleichem Seitenzustand jedes Mal dasselbe. Und ein GELESENER
    // WERT gehoert hinein: vorher kam er nie beim Modell an, und es las
    // dieselbe Ueberschrift ein zweites Mal (live 05.09.).
    if (naechste.liestAls && typeof ergebnis.gelesen === "string") {
      gelesen[naechste.liestAls] = ergebnis.gelesen;
      verlauf.push(\`\${naechste.beschreibung} → »\${ergebnis.gelesen.slice(0, 300)}«\`);
    } else {
      verlauf.push(naechste.beschreibung);
    }
  }`]
  ]
};
let fehler = 0;
for (const [rel, paare] of Object.entries(EDITS)) {
  const abs = path.join(W, rel); let text = fs.readFileSync(abs, "utf8");
  if (rel.endsWith("session.js") && text.includes("DEN GRUND MITGEBEN")) { console.log("schon drin: " + rel); continue; }
  if (rel.endsWith("browser-pane.js") && text.includes("Sitzung mitten im Lauf verloren")) { console.log("schon drin: " + rel); continue; }
  if (rel.endsWith("browser-pane-maus.js") && text.includes("FEHLSCHLAG_GRENZE")) { console.log("schon drin: " + rel); continue; }
  for (const [alt, neu] of paare) {
    const n = text.split(alt).length - 1;
    if (n !== 1) { fehler += 1; console.error(`ANKER ${n === 0 ? "FEHLT" : "MEHRDEUTIG"} in ${rel}: ${alt.slice(0, 70).replace(/\n/g, "⏎")}`); continue; }
    text = text.replace(alt, () => neu);
  }
  if (!fehler && !nurPruefen) { fs.writeFileSync(abs, text); console.log("geschrieben: " + rel); } else console.log((nurPruefen ? "Vorschau: " : "NICHT geschrieben: ") + rel);
}
if (fehler) process.exit(1);
