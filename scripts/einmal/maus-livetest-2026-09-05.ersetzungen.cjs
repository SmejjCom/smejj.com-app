// smejj.com — Maus-Livetest 2026-09-05 (Betreiber: "Geh chrome browser https://smejj.com/
// teste Erledige mit der Maus im Browser und alle Fehler beheben."). Vier Befunde aus dem
// Live-Lauf, jeder mit Textanker in der QUELLE (public/, nicht assets/ — das zieht
// build:assets nach). Fehlt ein Anker, bricht das Skript ab, statt still zu raten.
// Aufruf: node scripts/einmal/maus-livetest-2026-09-05.ersetzungen.cjs [--pruefen]
const fs = require("fs");
const path = require("path");
const nurPruefen = process.argv.includes("--pruefen");
const WURZEL = path.resolve(__dirname, "..", "..");

/** Exakte Ersetzungen je Datei: [alt, neu]. Jedes alt muss GENAU EINMAL vorkommen. */
const EDITS = {
  "public/browser-pane-maus.js": [
    // 1. Frist je Entscheidung — der Lauf stand live minutenlang bei "ueberlegt".
    [`export const AUSSETZER_GRENZE = 3;
`, `export const AUSSETZER_GRENZE = 3;
// Wie lange das Panel auf EINE Entscheidung des Servers wartet.
//
// LIVE GESEHEN 2026-09-05: „Maus 1/10: überlegt ...“ stand minutenlang da —
// ohne Zeile, ohne Fehler, ohne Ende. Der Server beantwortete dieselbe Frage
// direkt gerufen in gut einer Sekunde; die eine Verbindung war es, die hing.
// Ein fetch ohne Frist wartet ewig, und der Nutzer sieht einen Lauf, der weder
// fertig wird noch scheitert. Drei Minuten liegen über dem, was die Planer-
// Kette im Normalfall braucht, und unter dem, was die Plattform der Verbindung
// überhaupt lässt (300 s) — so kommt die Meldung von uns, nicht vom Gateway.
export const SCHRITT_FRIST_MS = 180_000;
`],
    [`  abbruch = () => false, maxSchritte = FREI_MAX_SCHRITTE, braucheSitzung = true
} = {}) {
  const hosts = erlaubteHosts(tab?.url);
  if (!hosts.length) return { ok: false, grund: "Erst eine Seite oeffnen — die Maus arbeitet nur dort." };
  // Die Sitzungspflicht`, `  abbruch = () => false, maxSchritte = FREI_MAX_SCHRITTE, braucheSitzung = true,
  schrittFristMs = SCHRITT_FRIST_MS
} = {}) {
  const hosts = erlaubteHosts(tab?.url);
  if (!hosts.length) return { ok: false, grund: "Erst eine Seite öffnen — die Maus arbeitet nur dort." };
  // Die Sitzungspflicht`],
    [`      const token = await holeToken();
      const r = await fetch(schrittUrl, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({
          naechsterSchritt: true,`, `      const token = await holeToken();
      // Frist je Entscheidung — siehe SCHRITT_FRIST_MS. Sie gilt auch fuer das
      // Lesen der Antwort: ein Server, der die Verbindung offen haelt und nie
      // zu Ende sendet, hinge sonst genauso.
      const frist = new AbortController();
      const uhr = setTimeout(() => frist.abort(), schrittFristMs);
      const r = await fetch(schrittUrl, {
        method: "POST",
        credentials: "include",
        signal: frist.signal,
        headers: { "content-type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({
          naechsterSchritt: true,`],
    [`      antwort = await r.json().catch(() => null);
      if (!r.ok || !antwort?.ok) {`, `      antwort = await r.json().catch(() => null);
      clearTimeout(uhr);
      if (!r.ok || !antwort?.ok) {`],
    [`    } catch {
      return { ok: false, grund: "Maus nicht erreichbar.", gelesen };
    }

    // 3. HANDELN`, `    } catch (fehler) {
      if (fehler?.name === "AbortError") {
        return { ok: false, grund: \`Die Maus hat \${Math.round(schrittFristMs / 1000)} s auf eine Entscheidung gewartet und aufgehört — bitte den Auftrag noch einmal senden.\`, gelesen };
      }
      return { ok: false, grund: "Maus nicht erreichbar.", gelesen };
    }

    // 3. HANDELN`],
    // 2. "fertig nach 0 Schritten" klang nach Fehler, war aber das Beste.
    [`    if (naechste.fertig) return { ok: true, grund: \`Maus fertig nach \${n - 1} Schritten: \${naechste.grund}\`, gelesen };`,
     `    if (naechste.fertig) {
      // „fertig nach 0 Schritten“ (live 2026-09-05) las sich wie ein Fehler,
      // war aber der beste Fall: die Antwort stand schon auf der Seite, kein
      // Klick nötig. Das sagen wir so — und zählen richtig, nicht „1 Schritten“.
      const getan = n - 1;
      const wie = getan === 0 ? "Maus fertig, kein Klick nötig" : getan === 1 ? "Maus fertig nach 1 Schritt" : \`Maus fertig nach \${getan} Schritten\`;
      return { ok: true, grund: \`\${wie}: \${naechste.grund}\`, gelesen };
    }`],
    // 3. Umlaute in Nutzertexten (die App schreibt sonst überall ä/ö/ü).
    [`    zeige(\`Maus \${n}/\${maxSchritte}: ueberlegt ...\`);`, `    zeige(\`Maus \${n}/\${maxSchritte}: überlegt ...\`);`],
    [`  return { ok: false, grund: \`Maus hat nach \${maxSchritte} Schritten aufgehoert (Obergrenze).\`, gelesen };`, `  return { ok: false, grund: \`Maus hat nach \${maxSchritte} Schritten aufgehört (Obergrenze).\`, gelesen };`],
    [`    case "navigate": return \`Seite oeffnen: \${kurz(s.url)}\`;`, `    case "navigate": return \`Seite öffnen: \${kurz(s.url)}\`;`],
    [`  if (!hosts.length) return { ok: false, grund: "Erst eine Seite oeffnen — die Maus arbeitet nur dort." };
  if (!tab?.sessionId) return { ok: false, grund: "Die Maus braucht den Live-Browser. Diese Ansicht hat keinen." };

  zeige("Maus denkt nach ...");`, `  if (!hosts.length) return { ok: false, grund: "Erst eine Seite öffnen — die Maus arbeitet nur dort." };
  if (!tab?.sessionId) return { ok: false, grund: "Die Maus braucht den Live-Browser. Diese Ansicht hat keinen." };

  zeige("Maus denkt nach ...");`],
    [`— nichts ausgefuehrt.\`` , `— nichts ausgeführt.\``],
    [`"Aus dem Plan ergab sich kein Schritt fuer diese Ansicht."`, `"Aus dem Plan ergab sich kein Schritt für diese Ansicht."`],
    [`" und klickt selbstaendig. Sie sieht nach jedem Schritt neu hin.\\n\\n" +`, `" und klickt selbständig. Sie sieht nach jedem Schritt neu hin.\\n\\n" +`]
  ],
  "public/maus-absicht.js": [
    // 4. Erst öffnen, dann ankündigen — kein Widerspruch im Chat mehr.
    [`  schreibe(\`Ich arbeite in deinem eigenen Chrome — du siehst der Maus direkt zu. Ich oeffne \${kurzeAdresse(ziel)}.\`);
  const auf = await sendeAnChrome({ type: "navigate", url: ziel });
  if (!auf?.ok) {`, `  // ERST ÖFFNEN, DANN ANKÜNDIGEN. Live gesehen 2026-09-05: „Ich arbeite in
  // deinem eigenen Chrome …“ stand im Chat, und die nächste Zeile nahm es
  // zurück („… ich nehme den eingebauten Browser“). Zwei Sätze, die sich
  // widersprechen, sind schlimmer als einer, der einen Moment später kommt.
  // Ob der eigene Chrome die Seite öffnen darf, weiß erst die Antwort der
  // Brücke — also wird erst gefragt und dann gesagt, wo gearbeitet wird.
  const auf = await sendeAnChrome({ type: "navigate", url: ziel });
  if (!auf?.ok) {`],
    [`      schreibe(\`Fuer \${kurzeAdresse(ziel)} hast du deinem Chrome noch nichts erlaubt — ich nehme den eingebauten Browser. (Wenn die Maus dort ANGEMELDET arbeiten soll: Puzzleteil oben rechts, „smejj.com Maus-Bruecke“, „Fuer 30 Minuten erlauben“.)\`);`,
     `      schreibe(\`Für \${kurzeAdresse(ziel)} hast du deinem eigenen Chrome noch nichts erlaubt — ich nehme den eingebauten Browser rechts. (Soll die Maus dort ANGEMELDET arbeiten: Puzzleteil oben rechts, „smejj.com Maus-Brücke“, „Für 30 Minuten erlauben“.)\`);`],
    [`  const ergebnis = await panel.starteMausLaufMitSender({
    auftrag: aufgabe,`, `  schreibe(\`Ich arbeite in deinem eigenen Chrome — du siehst der Maus direkt zu. \${kurzeAdresse(ziel)} ist offen.\`);
  const ergebnis = await panel.starteMausLaufMitSender({
    auftrag: aufgabe,`],
    // 5. Stopp-Viereck: Strom an/ab melden, auf Stopp hören.
    [`    starteMausLaufMitSender: maus.starteMausLaufMitSender
  };`, `    starteMausLaufMitSender: maus.starteMausLaufMitSender,
    haltMausAn: maus.haltMausAn
  };`],
    [`export async function mausAuftragErledigt({ task, output, deps = {} } = {}) {
  const vorlagen = await sammleVorlagen();
  if (!istMausAuftrag(task, vorlagen)) return false;

  const schreibe = deps.schreibe || baueZeilenschreiber(output);`, `export async function mausAuftragErledigt({ task, output, deps = {} } = {}) {
  const vorlagen = await sammleVorlagen();
  if (!istMausAuftrag(task, vorlagen)) return false;
  const strom = meldeMausStrom(deps);
  try {
    return await erledigeMausAuftrag({ task, output, deps, vorlagen });
  } finally {
    strom.ende();
  }
}

/**
 * DAS STOPP-VIERECK GEHÖRT AUCH DER MAUS.
 *
 * Live gesehen 2026-09-05: der Lauf war fertig, das Viereck im Eingabefeld
 * blieb noch anderthalb Minuten stehen. chat-stopp.js kennt nur die
 * Chat-Ströme (Ereignis smejj:chat-strom) und hörte von der Maus nichts — es
 * blendete erst nach seinem Vorlauf aus. Und andersherum: ein Klick auf das
 * Viereck beendete Ströme (smejj:chat-stoppen), die Maus klickte weiter.
 *
 * Beides läuft jetzt über dieselben zwei Ereignisse wie die Chat-Ströme:
 * ein Knopf, ein Zustand. Mitgenommen wird, was daran hängt — der
 * Verlauf-Sync hält den Vortritt, das Auslagern von Medien wartet.
 *
 * @param {{fenster?: EventTarget, halt?: Function}} deps  Tests reichen ein
 *   eigenes Fenster und einen eigenen Halt herein.
 */
function meldeMausStrom(deps = {}) {
  const fenster = deps.fenster || (typeof window !== "undefined" ? window : null);
  const melde = (laufen) => {
    try { fenster?.dispatchEvent(new CustomEvent("smejj:chat-strom", { detail: { laufen } })); } catch { /* ohne Fenster (Tests) egal */ }
  };
  const halt = () => {
    try {
      if (deps.halt) deps.halt();
      else holePanel().then((p) => p.haltMausAn?.()).catch(() => {});
    } catch { /* fail-safe: das Viereck bleibt bedienbar */ }
  };
  try { fenster?.addEventListener("smejj:chat-stoppen", halt); } catch { /* still */ }
  melde(1);
  return {
    ende() {
      try { fenster?.removeEventListener("smejj:chat-stoppen", halt); } catch { /* still */ }
      melde(0);
    }
  };
}

async function erledigeMausAuftrag({ task, output, deps = {}, vorlagen }) {
  const schreibe = deps.schreibe || baueZeilenschreiber(output);`],
    // 6. Umlaute in Nutzertexten.
    [`    return \`Fuer \${kurzeAdresse(ziel)} fehlt noch deine Freigabe. Klick in Chrome oben rechts auf das smejj-Symbol und dann auf „Fuer 30 Minuten erlauben“ — danach den Auftrag noch einmal senden.\`;`,
     `    return \`Für \${kurzeAdresse(ziel)} fehlt noch deine Freigabe. Klick in Chrome oben rechts auf das smejj-Symbol und dann auf „Für 30 Minuten erlauben“ — danach den Auftrag noch einmal senden.\`;`],
    [`laeuft nicht ueber https. In deinem angemeldeten Chrome arbeitet die Maus nur auf verschluesselten Seiten.`, `läuft nicht über https. In deinem angemeldeten Chrome arbeitet die Maus nur auf verschlüsselten Seiten.`],
    [`"Die Maus-Bruecke in Chrome antwortet nicht. Oeffne chrome://extensions und pruefe, ob sie aktiv ist."`, `"Die Maus-Brücke in Chrome antwortet nicht. Öffne chrome://extensions und prüfe, ob sie aktiv ist."`],
    [`"Chrome hat den Arbeits-Tab nicht geoeffnet. Bitte den Auftrag noch einmal senden."`, `"Chrome hat den Arbeits-Tab nicht geöffnet. Bitte den Auftrag noch einmal senden."`],
    [`  return \`Die Maus-Bruecke in Chrome meldet: \${text || "unbekannter Grund"}.\`;`, `  return \`Die Maus-Brücke in Chrome meldet: \${text || "unbekannter Grund"}.\`;`],
    [`text: "Maus-Bruecke nicht installiert — die Maus arbeitet im fernen Browser."`, `text: "Maus-Brücke nicht installiert — die Maus arbeitet im fernen Browser."`],
    [`  const marke = zustand.version ? \`Bruecke \${zustand.version}\` : "Bruecke";`, `  const marke = zustand.version ? \`Brücke \${zustand.version}\` : "Brücke";`],
    [`ist eine Freigabe gemerkt, aber Chrome haelt das Recht NICHT. Freigabe in Chrome noch einmal erteilen.`, `ist eine Freigabe gemerkt, aber Chrome hält das Recht NICHT. Freigabe in Chrome noch einmal erteilen.`],
    [`      text: \`\${marke}: fuer \${ohneRecht`, `      text: \`\${marke}: für \${ohneRecht`],
    [`      text: \`\${marke}: Chrome haelt ein Recht fuer \${ohneFreigabe.map(kurzeAdresse).join(", ")}, das die Bruecke nicht kennt — sie wird es nicht benutzen.\``, `      text: \`\${marke}: Chrome hält ein Recht für \${ohneFreigabe.map(kurzeAdresse).join(", ")}, das die Brücke nicht kennt — sie wird es nicht benutzen.\``],
    [`grund: \`Diese Adresse kann der eingebaute Browser nicht oeffnen: \${ziel} — es geht nur https.\``, `grund: \`Diese Adresse kann der eingebaute Browser nicht öffnen: \${ziel} — es geht nur https.\``],
    [`"Der Browser rechts ist noch nicht aufgebaut. Bitte einmal den Browser oeffnen und den Auftrag noch einmal senden."`, `"Der Browser rechts ist noch nicht aufgebaut. Bitte einmal den Browser öffnen und den Auftrag noch einmal senden."`],
    [`      schreibe(\`Der eingebaute Browser laesst sich gerade nicht laden`, `      schreibe(\`Der eingebaute Browser lässt sich gerade nicht laden`],
    [`    schreibe("Sag mir noch, WAS die Maus tun soll — zum Beispiel: „Erledige mit der Maus im Browser: auf smejj.com das Impressum oeffnen“.");`, `    schreibe("Sag mir noch, WAS die Maus tun soll — zum Beispiel: „Erledige mit der Maus im Browser: auf smejj.com das Impressum öffnen“.");`],
    [`    schreibe("Ich weiss noch nicht, WO die Maus arbeiten soll. Nenne die Seite mit, zum Beispiel: „Erledige mit der Maus im Browser: auf smejj.com das Impressum oeffnen“.");`, `    schreibe("Ich weiß noch nicht, WO die Maus arbeiten soll. Nenne die Seite mit, zum Beispiel: „Erledige mit der Maus im Browser: auf smejj.com das Impressum öffnen“.");`],
    [`  schreibe(\`Ich oeffne \${kurzeAdresse(ziel)} im Live-Browser rechts.\`);`, `  schreibe(\`Ich öffne \${kurzeAdresse(ziel)} im Live-Browser rechts.\`);`],
    [`grund: \`Diese Adresse kann der eingebaute Browser nicht oeffnen: \${ziel}\` })`, `grund: \`Diese Adresse kann der eingebaute Browser nicht öffnen: \${ziel}\` })`],
    [`  schreibe("Die Maus faengt an. Du siehst rechts jeden Schritt — der Maus-Knopf oben im Browser haelt sie an.");`, `  schreibe("Die Maus fängt an. Du siehst rechts jeden Schritt — der Maus-Knopf oben im Browser hält sie an.");`]
  ],
  "tests/browser-pane-maus.test.mjs": [
    [`assert.match(beschreibe({ action: "navigate", url: "https://smejj.com/" }), /Seite oeffnen/);`, `assert.match(beschreibe({ action: "navigate", url: "https://smejj.com/" }), /Seite öffnen/);`],
    [`  assert.match(ohneSeite.grund, /Seite oeffnen/);`, `  assert.match(ohneSeite.grund, /Seite öffnen/);`]
  ],
  "tests/maus-absicht.test.mjs": [
    [`  assert.match(befund.text, /Chrome haelt das Recht NICHT/);`, `  assert.match(befund.text, /Chrome hält das Recht NICHT/);`]
  ]
};

let fehler = 0;
for (const [rel, paare] of Object.entries(EDITS)) {
  const abs = path.join(WURZEL, rel);
  let text = fs.readFileSync(abs, "utf8");
  for (const [alt, neu] of paare) {
    const n = text.split(alt).length - 1;
    if (n !== 1) { fehler += 1; console.error(`ANKER ${n === 0 ? "FEHLT" : "MEHRDEUTIG (" + n + "x)"} in ${rel}: ${alt.slice(0, 70).replace(/\n/g, "⏎")}…`); continue; }
    text = text.replace(alt, () => neu);
  }
  if (!nurPruefen && !fehler) { fs.writeFileSync(abs, text); console.log(`geschrieben: ${rel} (${paare.length} Stellen)`); }
  else console.log(`${nurPruefen ? "Vorschau" : "NICHT geschrieben"}: ${rel} (${paare.length} Stellen)`);
}
if (fehler) { console.error(`${fehler} Anker-Fehler — nichts geschrieben.`); process.exit(1); }
