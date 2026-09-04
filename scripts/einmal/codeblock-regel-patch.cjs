// smejj.com — setzt die Codeblock-Regel in die Systemregeln der TIEFEN Spur.
//
// BEFUND (live gemessen 2026-09-05, Code-Bereich, Aufgabe mit "genauer:"):
// In zwei von drei Laeufen lieferte die tiefe Spur den Code OHNE ```-Zaeune —
// er klebte im Fliesstext ("...und Randfaellen:function maximum(liste) {").
// Die Oberflaeche macht aus Zaeunen einen Kasten mit Kopier- und
// Download-Knopf; ohne Zaeune fehlt beides, und der Renderer kann nichts dafuer.
// Die Regel fehlte schlicht: systemregeln.js verlangt normale Schreibweise fuer
// FORMELN (statt LaTeX), sagt zu Code aber nichts.
//
// Idempotent: laeuft der Patch zweimal, passiert beim zweiten Mal nichts.
const fs = require("fs");
const P = "src/agent/systemregeln.js";
let s = fs.readFileSync(P, "utf8");

if (s.includes("CODE-DARSTELLUNG:")) {
  console.log("Regel steht bereits — nichts zu tun.");
  process.exit(0);
}

const anker = `  if (voiceMode && !codingTask) {`;
if (!s.includes(anker)) throw new Error("Anker (Sprachmodus-Block) fehlt");

s = s.replace(anker, `  // Live gemessen 2026-09-05 (Betreiber: "Code-Auszeichnung erzwingen"): in zwei
  // von drei Laeufen kam der Code OHNE \`\`\`-Zaeune und klebte im Fliesstext. Die
  // Oberflaeche baut aus Zaeunen einen Kasten mit Kopier- und Download-Knopf —
  // ohne sie fehlt beides. NICHT im Sprachmodus: dort ist Markdown verboten,
  // weil die Antwort vorgelesen wird (Regel direkt darunter).
  if (!voiceMode) {
    systemLines.push(
      "CODE-DARSTELLUNG: Jeden Code, jeden Befehl und jeden Konfigurationsausschnitt IMMER in einen Markdown-Codeblock setzen — dreifache Backticks auf einer eigenen Zeile, mit Sprachangabe (js, python, bash, json, ...), und die schliessenden Backticks ebenfalls auf einer eigenen Zeile. Schreibe Code NIE roh in den Fliesstext und haenge ihn nie an einen Satz an. Erklaerungen stehen ausserhalb des Blocks."
    );
  }
  if (voiceMode && !codingTask) {`);

fs.writeFileSync(P, s);
console.log("Codeblock-Regel gesetzt:", s.split("\n").length, "Zeilen");
